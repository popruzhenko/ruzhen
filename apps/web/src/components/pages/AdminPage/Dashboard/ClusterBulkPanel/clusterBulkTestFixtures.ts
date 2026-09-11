import { vi } from 'vitest';
import type { ClusterBulkJob } from '../../../../../entities/cluster/model/clusterBulk';
import type { useClusterBulk } from './useClusterBulk';

export const emptyBulkCounts = () => ({
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    SKIPPED: 0,
    FAILED: 0,
    CANCELED: 0,
});

export const makeBulkJob = (
    updates: Partial<ClusterBulkJob> = {},
): ClusterBulkJob => ({
    id: 'job-1',
    action: 'CONTEXTUALIZE',
    status: 'COMPLETED',
    total: 0,
    counts: emptyBulkCounts(),
    currentTitle: null,
    createdAt: '2026-09-11T10:00:00.000Z',
    updatedAt: '2026-09-11T10:00:00.000Z',
    ...updates,
});

export const makeBulkState = (
    updates: Partial<ReturnType<typeof useClusterBulk>> = {},
): ReturnType<typeof useClusterBulk> => {
    const job = updates.job ?? null;
    const activeJob = updates.activeJob ?? null;
    const counts = updates.counts ?? job?.counts ?? emptyBulkCounts();
    return {
        phase:
            job?.status === 'RUNNING' || job?.status === 'QUEUED'
                ? 'running'
                : job?.status === 'STOPPING'
                  ? 'stopping'
                  : job?.status === 'CANCELED'
                    ? 'stopped'
                    : job
                      ? 'completed'
                      : 'idle',
        isBusy: Boolean(activeJob),
        total: job?.total ?? 0,
        processed: counts.SUCCEEDED + counts.SKIPPED + counts.FAILED,
        results: [],
        currentTitle: job?.currentTitle ?? null,
        error: null,
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        jobs: job ? [job] : [],
        job,
        selectedJobId: job?.id ?? null,
        selectJob: vi.fn(),
        counts,
        activeJob,
        canStop: Boolean(activeJob && activeJob.id === job?.id),
        canRetry: !activeJob && Boolean(counts.FAILED + counts.CANCELED),
        isLoading: false,
        isRefreshing: false,
        isMutating: false,
        refresh: vi.fn(async () => undefined),
        retry: vi.fn(async () => undefined),
        startDisabledReason: null,
        resultPage: 1,
        setResultPage: vi.fn(),
        pagination: job
            ? {
                  page: 1,
                  limit: 50,
                  total: job.total,
                  totalPages: Math.max(1, Math.ceil(job.total / 50)),
              }
            : null,
        ...updates,
    };
};
