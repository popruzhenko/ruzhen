import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClusterBulk } from './useClusterBulk';
import type {
    ClusterBulkAction,
    ClusterBulkJob,
    ClusterBulkJobDetails,
    ClusterBulkJobList,
} from '../../../../../entities/cluster/model/clusterBulk';
import { queryKeys } from '../../../../../shared/lib/queryKeys';

const mocks = vi.hoisted(() => ({
    apiClient: vi.fn<
        (
            url: string,
            options?: {
                method?: string;
                json?: unknown;
                signal?: AbortSignal;
            },
        ) => Promise<unknown>
    >(),
}));
vi.mock('../../../../../shared/api/client', () => ({
    apiClient: mocks.apiClient,
}));
const prefix = '/admin/clusters/bulk/jobs';
const job = (changes: Partial<ClusterBulkJob> = {}): ClusterBulkJob => ({
    id: 'job-1',
    action: 'CONTEXTUALIZE',
    status: 'RUNNING',
    total: 503,
    counts: {
        PENDING: 402,
        RUNNING: 1,
        SUCCEEDED: 98,
        SKIPPED: 1,
        FAILED: 1,
        CANCELED: 0,
    },
    currentTitle: 'Current event',
    createdAt: '2026-09-11T01:00:00Z',
    updatedAt: '2026-09-11T01:01:00Z',
    ...changes,
});
const details = (entry: ClusterBulkJob, page = 1): ClusterBulkJobDetails => ({
    job: entry,
    items: Array.from(
        { length: Math.min(50, Math.max(0, entry.total - (page - 1) * 50)) },
        (_, index) => ({
            id: 'item-' + ((page - 1) * 50 + index),
            clusterId: 'cluster-' + ((page - 1) * 50 + index),
            humanId: 'Event-' + index,
            title: 'Saved event ' + index,
            status: 'SUCCEEDED',
            reason: null,
        }),
    ),
    pagination: {
        page,
        limit: 50,
        total: entry.total,
        totalPages: Math.ceil(entry.total / 50),
    },
});
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};
let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
let bulk: ReturnType<typeof useClusterBulk>;
let unmounted: boolean;
let listing: ClusterBulkJobList;
let savedDetails: Map<string, ClusterBulkJobDetails>;
let post: (url: string, body: unknown) => Promise<unknown>;

function Harness({ action }: { action: ClusterBulkAction }) {
    bulk = useClusterBulk(action);
    return <div>{bulk.phase}</div>;
}
const flush = async () => {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
    });
};
async function render(action: ClusterBulkAction = 'CONTEXTUALIZE') {
    await act(async () =>
        root.render(
            <QueryClientProvider client={client}>
                <Harness action={action} />
            </QueryClientProvider>,
        ),
    );
    await flush();
}
const posts = () =>
    mocks.apiClient.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
    );
async function remount(action: ClusterBulkAction = 'CONTEXTUALIZE') {
    await act(async () => root.unmount());
    client.clear();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    root = createRoot(container);
    await render(action);
}

beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.apiClient.mockReset();
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    unmounted = false;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    listing = { jobs: [], activeJob: null };
    savedDetails = new Map();
    post = async () => {
        const next = job({ status: 'QUEUED' });
        listing = { jobs: [next], activeJob: next };
        savedDetails.set(next.id, details(next));
        return { job: next, reused: false };
    };
    mocks.apiClient.mockImplementation(async (url, options) => {
        if (options?.method === 'POST') return post(url, options.json);
        if (url.startsWith(prefix + '?')) return structuredClone(listing);
        if (url.startsWith(prefix + '/')) {
            const parsed = new URL(url, 'https://example.test');
            const id = parsed.pathname.split('/').at(-1)!;
            const saved = savedDetails.get(id);
            if (!saved) throw new Error('Job not found');
            return details(
                structuredClone(saved.job),
                Number(parsed.searchParams.get('page') ?? 1),
            );
        }
        throw new Error('Unexpected endpoint ' + url);
    });
});
afterEach(async () => {
    if (!unmounted) await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.restoreAllMocks();
});

describe('durable cluster bulk jobs', () => {
    it('restores server progress on mount without submitting any work or blocking browser navigation', async () => {
        const active = job();
        listing = { jobs: [active], activeJob: active };
        savedDetails.set(active.id, details(active));
        const listener = vi.spyOn(window, 'addEventListener');
        await render();
        expect(bulk.job?.id).toBe(active.id);
        expect(bulk.total).toBe(503);
        expect(bulk.processed).toBe(100);
        expect(bulk.results).toHaveLength(50);
        expect(bulk.isBusy).toBe(true);
        expect(bulk.canStop).toBe(true);
        expect(
            listener.mock.calls.some(([name]) => name === 'beforeunload'),
        ).toBe(false);
        await act(async () => bulk.start());
        expect(posts()).toHaveLength(0);
    });

    it('creates one server job for duplicate clicks and never executes individual events in the browser', async () => {
        await render();
        const pending = deferred<unknown>();
        post = () => pending.promise;
        let first!: Promise<void>;
        await act(async () => {
            first = bulk.start();
            await bulk.start();
        });
        expect(posts()).toHaveLength(1);
        expect(posts()[0][0]).toBe(prefix);
        expect(posts()[0][1]?.json).toEqual({
            action: 'CONTEXTUALIZE',
            requestId: expect.any(String),
        });
        const next = job({ status: 'QUEUED' });
        listing = { jobs: [next], activeJob: next };
        savedDetails.set(next.id, details(next));
        await act(async () => {
            pending.resolve({ job: next, reused: false });
            await first;
        });
        await flush();
        expect(bulk.phase).toBe('running');
        expect(posts()).toHaveLength(1);
        expect(
            mocks.apiClient.mock.calls.some(
                ([url]) => url.endsWith('/execute') || url.endsWith('/preview'),
            ),
        ).toBe(false);
    });

    it('does not cancel on unmount and restores later worker progress on return', async () => {
        const active = job();
        listing = { jobs: [active], activeJob: active };
        savedDetails.set(active.id, details(active));
        await render();
        const advanced = job({
            counts: { ...active.counts, SUCCEEDED: 108, PENDING: 392 },
        });
        listing = { jobs: [advanced], activeJob: advanced };
        savedDetails.set(advanced.id, details(advanced));
        await remount();
        expect(bulk.processed).toBe(110);
        expect(posts()).toHaveLength(0);
    });

    it('lets an in-flight creation finish after unmount without sending cancellation', async () => {
        await render('PUBLISH');
        const pending = deferred<unknown>();
        post = () => pending.promise;
        let run!: Promise<void>;
        await act(async () => {
            run = bulk.start();
        });
        await act(async () => {
            root.unmount();
            unmounted = true;
        });
        pending.resolve({
            job: job({ action: 'PUBLISH', status: 'QUEUED' }),
            reused: false,
        });
        await run;
        expect(posts()).toHaveLength(1);
        expect(posts()[0][1]?.json).toEqual({
            action: 'PUBLISH',
            requestId: expect.any(String),
        });
    });

    it('reuses the request ID after a lost creation response and page reload', async () => {
        post = async () => {
            throw new Error('Response lost');
        };
        await render();
        await act(async () => bulk.start());
        await flush();
        const original = posts()[0][1]?.json as { requestId: string };
        expect(bulk.error).toBe('Response lost');
        await remount();
        post = async () => {
            const next = job({ status: 'QUEUED' });
            listing = { jobs: [next], activeJob: next };
            savedDetails.set(next.id, details(next));
            return { job: next, reused: true };
        };
        await act(async () => bulk.start());
        await flush();
        expect(posts()[1][1]?.json).toEqual({
            action: 'CONTEXTUALIZE',
            requestId: original.requestId,
        });
        expect(bulk.error).toBeNull();
    });

    it('cancels unsent work explicitly while the current server item finishes', async () => {
        const active = job();
        listing = { jobs: [active], activeJob: active };
        savedDetails.set(active.id, details(active));
        post = async (url) => {
            expect(url).toBe(prefix + '/' + active.id + '/cancel');
            const stopping = job({
                status: 'STOPPING',
                counts: { ...active.counts, PENDING: 0, CANCELED: 402 },
            });
            listing = { jobs: [stopping], activeJob: stopping };
            savedDetails.set(stopping.id, details(stopping));
            return { job: stopping };
        };
        await render();
        await act(async () => bulk.stop());
        await flush();
        expect(bulk.phase).toBe('stopping');
        expect(bulk.isBusy).toBe(true);
        expect(bulk.processed).toBe(100);
        expect(bulk.counts.CANCELED).toBe(402);
        expect(bulk.canStop).toBe(false);
        const stopped = job({
            status: 'CANCELED',
            counts: { ...bulk.counts, RUNNING: 0, SUCCEEDED: 99 },
        });
        listing = { jobs: [stopped], activeJob: null };
        savedDetails.set(stopped.id, details(stopped));
        await act(async () => bulk.refresh());
        await flush();
        expect(bulk.phase).toBe('stopped');
        expect(bulk.isBusy).toBe(false);
        expect(bulk.canRetry).toBe(true);
    });

    it('blocks the other bulk action while a global editorial job is active', async () => {
        const running = job({ action: 'CONTEXTUALIZE' });
        const prior = job({
            id: 'publication-history',
            action: 'PUBLISH',
            status: 'COMPLETED',
        });
        listing = { jobs: [prior], activeJob: running };
        savedDetails.set(prior.id, details(prior));
        await render('PUBLISH');
        expect(bulk.isBusy).toBe(true);
        expect(bulk.startDisabledReason).toContain(
            'Contextualization is already running',
        );
        expect(bulk.canStop).toBe(false);
        expect(bulk.canRetry).toBe(false);
        await act(async () => {
            await bulk.start();
            await bulk.retry();
        });
        expect(posts()).toHaveLength(0);
    });

    it('keeps the current report and server job active when polling fails', async () => {
        const active = job();
        listing = { jobs: [active], activeJob: active };
        savedDetails.set(active.id, details(active));
        await render();
        mocks.apiClient.mockRejectedValue(new Error('Network unavailable'));
        await act(async () => bulk.refresh());
        await flush();
        expect(bulk.error).toBe('Network unavailable');
        expect(bulk.job?.id).toBe(active.id);
        expect(bulk.processed).toBe(100);
        expect(bulk.isBusy).toBe(true);
        expect(posts()).toHaveLength(0);
    });

    it('blocks new starts until initial queue status can be read', async () => {
        mocks.apiClient.mockRejectedValueOnce(new Error('Queue unavailable'));
        await render();
        expect(bulk.startDisabledReason).toContain('Refresh the queue status');
        await act(async () => bulk.start());
        expect(posts()).toHaveLength(0);
        await act(async () => bulk.refresh());
        await flush();
        expect(bulk.startDisabledReason).toBeNull();
    });

    it('paginates stored results without deriving global counts from the visible page', async () => {
        const completed = job({
            status: 'COMPLETED',
            counts: {
                PENDING: 0,
                RUNNING: 0,
                SUCCEEDED: 501,
                SKIPPED: 1,
                FAILED: 1,
                CANCELED: 0,
            },
        });
        listing = { jobs: [completed], activeJob: null };
        savedDetails.set(completed.id, details(completed));
        await render();
        await act(async () => bulk.setResultPage(11));
        await flush();
        expect(bulk.pagination?.page).toBe(11);
        expect(bulk.results).toHaveLength(3);
        expect(bulk.processed).toBe(503);
        expect(posts()).toHaveLength(0);
    });

    it('requests retry of the selected failed/canceled job without recreating a global snapshot on the client', async () => {
        const old = job({ status: 'CANCELED' });
        listing = { jobs: [old], activeJob: null };
        savedDetails.set(old.id, details(old));
        post = async (url) => {
            expect(url).toBe(prefix + '/' + old.id + '/retry');
            const next = job({ id: 'retry-job', status: 'QUEUED', total: 1 });
            listing = { jobs: [next, old], activeJob: next };
            savedDetails.set(next.id, details(next));
            return { job: next, reused: false };
        };
        await render();
        expect(bulk.canRetry).toBe(true);
        await act(async () => bulk.retry());
        await flush();
        expect(posts()).toHaveLength(1);
        expect(posts()[0][1]?.json).toEqual({ requestId: expect.any(String) });
        expect(bulk.selectedJobId).toBe('retry-job');
    });

    it('refreshes saved cluster and public views after publication progress changes', async () => {
        const active = job({ action: 'PUBLISH' });
        listing = { jobs: [active], activeJob: active };
        savedDetails.set(active.id, details(active));
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        await render('PUBLISH');
        invalidate.mockClear();
        const complete = job({
            action: 'PUBLISH',
            status: 'COMPLETED',
            counts: {
                ...active.counts,
                SUCCEEDED: 501,
                RUNNING: 0,
                PENDING: 0,
            },
        });
        listing = { jobs: [complete], activeJob: null };
        savedDetails.set(complete.id, details(complete));
        await act(async () => bulk.refresh());
        await flush();
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.clusters.all,
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: queryKeys.publicClusters.all,
        });
        expect(bulk.phase).toBe('completed');
    });
});
