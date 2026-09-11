import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    cancelClusterBulkJob,
    getClusterBulkJob,
    getClusterBulkJobs,
    retryClusterBulkJob,
    startClusterBulkJob,
} from '../../../../../entities/cluster/api/clusterBulk';
import type {
    ClusterBulkAction,
    ClusterBulkCounts,
    ClusterBulkJob,
    ClusterBulkJobDetails,
    ClusterBulkJobList,
    ClusterBulkReportRow,
} from '../../../../../entities/cluster/model/clusterBulk';
import { getStoredUser } from '../../../../../features/auth/lib/authStorage';
import { queryKeys } from '../../../../../shared/lib/queryKeys';

type ClusterBulkPhase =
    | 'idle'
    | 'preparing'
    | 'running'
    | 'stopping'
    | 'completed'
    | 'stopped'
    | 'error';
const emptyCounts: ClusterBulkCounts = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    SKIPPED: 0,
    FAILED: 0,
    CANCELED: 0,
};
const isActive = (job: ClusterBulkJob | null | undefined) =>
    Boolean(job && ['QUEUED', 'RUNNING', 'STOPPING'].includes(job.status));
const messageFrom = (cause: unknown) =>
    cause instanceof Error ? cause.message : 'The request failed.';
const phaseFrom = (job: ClusterBulkJob | null): ClusterBulkPhase => {
    if (!job) return 'idle';
    if (job.status === 'COMPLETED') return 'completed';
    if (job.status === 'CANCELED') return 'stopped';
    if (job.status === 'STOPPING') return 'stopping';
    return 'running';
};

export function useClusterBulk(action: ClusterBulkAction) {
    const queryClient = useQueryClient();
    const [preferredJobId, setPreferredJobId] = useState<string | null>(null);
    const [pageSelection, setPageSelection] = useState({ jobId: '', page: 1 });
    const [isMutating, setIsMutating] = useState(false);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [pendingOperation, setPendingOperation] = useState<
        'start' | 'retry' | 'stop' | null
    >(null);
    const mutationLock = useRef(false);
    const mounted = useRef(true);
    const pendingIds = useRef(new Map<string, string>());
    const observedProgress = useRef<string | null>(null);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const jobsQuery = useQuery({
        queryKey: queryKeys.clusterBulkJobs.list(action),
        queryFn: ({ signal }) => getClusterBulkJobs(action, signal),
        refetchInterval: 2000,
        retry: false,
    });
    const jobs = jobsQuery.data?.jobs ?? [];
    const listedActive = jobsQuery.data?.activeJob ?? null;
    const ownActive =
        listedActive?.action === action && isActive(listedActive)
            ? listedActive
            : null;
    const selectedJobId =
        ownActive?.id ?? preferredJobId ?? jobs.at(0)?.id ?? null;
    const resultPage =
        pageSelection.jobId === selectedJobId ? pageSelection.page : 1;
    const detailQuery = useQuery({
        queryKey: queryKeys.clusterBulkJobs.detail(selectedJobId, resultPage),
        queryFn: ({ signal }) =>
            getClusterBulkJob(selectedJobId!, resultPage, signal),
        enabled: Boolean(selectedJobId),
        refetchInterval: (query) =>
            isActive(query.state.data?.job) || ownActive ? 2000 : false,
        retry: false,
    });
    const detail = detailQuery.data;
    const activeJob =
        listedActive?.id === detail?.job.id &&
        detailQuery.dataUpdatedAt >= jobsQuery.dataUpdatedAt
            ? isActive(detail?.job)
                ? detail!.job
                : null
            : listedActive;
    const job =
        detail?.job ?? jobs.find(({ id }) => id === selectedJobId) ?? ownActive;
    const counts = job?.counts ?? emptyCounts;
    const processed = counts.SUCCEEDED + counts.SKIPPED + counts.FAILED;
    const isLoading = jobsQuery.isPending;
    const isBusy = isMutating || isLoading || Boolean(activeJob);

    // Refresh saved views when a worker commits, including after navigation.
    // Reading progress never starts or stops a server job.
    const progressSignature = JSON.stringify([
        activeJob?.id,
        activeJob?.status,
        activeJob?.counts,
        job?.id,
        job?.status,
        job?.counts,
    ]);
    useEffect(() => {
        if (
            jobsQuery.isPending ||
            observedProgress.current === progressSignature
        )
            return;
        observedProgress.current = progressSignature;
        void Promise.allSettled([
            queryClient.invalidateQueries({ queryKey: queryKeys.clusters.all }),
            queryClient.invalidateQueries({
                queryKey: queryKeys.publicClusters.all,
            }),
        ]);
    }, [jobsQuery.isPending, progressSignature, queryClient]);

    const rememberJob = (next: ClusterBulkJob) => {
        queryClient.setQueryData<ClusterBulkJobList>(
            queryKeys.clusterBulkJobs.list(action),
            (previous) => ({
                jobs: [
                    next,
                    ...(previous?.jobs ?? []).filter(
                        ({ id }) => id !== next.id,
                    ),
                ].slice(0, 20),
                activeJob: isActive(next)
                    ? next
                    : previous?.activeJob?.id === next.id
                      ? null
                      : (previous?.activeJob ?? null),
            }),
        );
        queryClient.setQueriesData<ClusterBulkJobDetails>(
            { queryKey: ['cluster-bulk-jobs', 'detail', next.id] },
            (previous) => (previous ? { ...previous, job: next } : previous),
        );
        if (mounted.current) {
            setPreferredJobId(next.id);
            setPageSelection({ jobId: next.id, page: 1 });
        }
    };

    const refresh = async () => {
        const refreshed = await Promise.allSettled([
            jobsQuery.refetch({ throwOnError: true }),
            ...(selectedJobId
                ? [detailQuery.refetch({ throwOnError: true })]
                : []),
        ]);
        if (
            mounted.current &&
            refreshed.every(({ status }) => status === 'fulfilled')
        )
            setMutationError(null);
    };

    const requestIdentity = (operation: string) => {
        let userId = 'session';
        try {
            userId = getStoredUser()?.id ?? userId;
        } catch {
            /* Storage can be disabled. */
        }
        const key =
            'ruzhen:cluster-bulk:' + userId + ':' + action + ':' + operation;
        let id = pendingIds.current.get(key);
        try {
            id ??= sessionStorage.getItem(key) ?? undefined;
        } catch {
            /* Keep the in-memory ID. */
        }
        if (!id) id = crypto.randomUUID();
        pendingIds.current.set(key, id);
        try {
            sessionStorage.setItem(key, id);
        } catch {
            /* Server also deduplicates active jobs. */
        }
        return {
            id,
            clear: () => {
                pendingIds.current.delete(key);
                try {
                    sessionStorage.removeItem(key);
                } catch {
                    /* Storage is optional. */
                }
            },
        };
    };

    const mutate = async (
        operation: 'start' | 'retry' | 'stop',
        request: () => Promise<ClusterBulkJob>,
    ) => {
        if (mutationLock.current || !mounted.current) return;
        mutationLock.current = true;
        setIsMutating(true);
        setPendingOperation(operation);
        setMutationError(null);
        try {
            rememberJob(await request());
        } catch (cause) {
            if (mounted.current) setMutationError(messageFrom(cause));
        } finally {
            // POSTs survive navigation and are never retried automatically.
            // Keep the request ID across reload when the response was lost.
            await Promise.allSettled([
                queryClient.invalidateQueries({
                    queryKey: queryKeys.clusterBulkJobs.all,
                }),
            ]);
            mutationLock.current = false;
            if (mounted.current) {
                setIsMutating(false);
                setPendingOperation(null);
            }
        }
    };

    const startDisabledReason = isLoading
        ? 'Loading the server queue status…'
        : jobsQuery.isError
          ? 'Refresh the queue status before starting another job.'
          : activeJob && activeJob.action !== action
            ? (activeJob.action === 'CONTEXTUALIZE'
                  ? 'Contextualization'
                  : 'Publication') +
              ' is already running on the server. Wait for it to finish before starting this action.'
            : null;
    const canStop = Boolean(
        activeJob?.action === action &&
        activeJob.status !== 'STOPPING' &&
        !isMutating,
    );
    const canRetry = Boolean(
        job &&
        !isActive(job) &&
        !isBusy &&
        !jobsQuery.isError &&
        counts.FAILED + counts.CANCELED > 0,
    );

    const start = async () => {
        if (startDisabledReason || isBusy) return;
        await mutate('start', async () => {
            const identity = requestIdentity('start');
            const response = await startClusterBulkJob(action, identity.id);
            identity.clear();
            return response.job;
        });
    };
    const stop = async () => {
        if (!activeJob || !canStop) return;
        await mutate(
            'stop',
            async () => (await cancelClusterBulkJob(activeJob.id)).job,
        );
    };
    const retry = async () => {
        if (!job || !canRetry) return;
        await mutate('retry', async () => {
            const identity = requestIdentity('retry:' + job.id);
            const response = await retryClusterBulkJob(job.id, identity.id);
            identity.clear();
            return response.job;
        });
    };
    const results: ClusterBulkReportRow[] = (detail?.items ?? []).map(
        (item) => ({
            clusterId: item.clusterId,
            humanId: item.humanId,
            title: item.title,
            outcome:
                item.status.toLowerCase() as ClusterBulkReportRow['outcome'],
            message:
                item.reason ??
                (item.status === 'PENDING'
                    ? 'Waiting for processing.'
                    : item.status === 'RUNNING'
                      ? 'Processing on the server.'
                      : ''),
        }),
    );
    const error =
        mutationError ??
        (jobsQuery.error
            ? messageFrom(jobsQuery.error)
            : detailQuery.error
              ? messageFrom(detailQuery.error)
              : null);
    const phase: ClusterBulkPhase =
        pendingOperation === 'start' || pendingOperation === 'retry'
            ? 'preparing'
            : pendingOperation === 'stop'
              ? 'stopping'
              : job
                ? phaseFrom(job)
                : error
                  ? 'error'
                  : 'idle';

    return {
        phase,
        isBusy,
        results,
        total: job?.total ?? 0,
        processed,
        currentTitle: job?.currentTitle ?? null,
        error,
        start,
        stop,
        jobs,
        job,
        selectedJobId,
        counts,
        activeJob,
        canStop,
        canRetry,
        isLoading,
        isRefreshing: jobsQuery.isFetching || detailQuery.isFetching,
        isMutating,
        refresh,
        retry,
        startDisabledReason,
        resultPage,
        pagination: detail?.pagination ?? null,
        selectJob: (id: string) => {
            if (ownActive || isMutating) return;
            setPreferredJobId(id);
            setPageSelection({ jobId: id, page: 1 });
        },
        setResultPage: (page: number) => {
            if (selectedJobId && Number.isInteger(page) && page > 0)
                setPageSelection({ jobId: selectedJobId, page });
        },
    };
}
