import { createElement, type PropsWithChildren } from 'react';
import {
    QueryClient,
    QueryClientProvider,
    type UseQueryResult,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../shared/lib/queryKeys';
import { useArticleClusterCandidatesQuery as useSuggestionQuery } from './article-cluster-candidate/hooks/useArticleClusterCandidates';
import { articleClusterCandidateKeys } from './article-cluster-candidate/model/queryKeys';
import {
    enrichmentKeys,
    useArticleContentVersionsQuery,
    useEnrichmentJobQuery,
    useEnrichmentJobsQuery,
    useEnrichmentProposalQuery,
} from './article-enrichment/hooks/useArticleEnrichment';
import {
    isEnrichmentJobActive,
    type EnrichmentJob,
} from './article-enrichment/model/types';
import { useClusterCandidatesQuery } from './cluster-candidate/hooks/useClusterCandidatesQuery';
import { useClusterByIdQuery } from './cluster/hooks/useClusterByIdQuery';
import { useClustersQuery } from './cluster/hooks/useClustersQuery';
import { useArticleClusterCandidatesQuery } from './clustering/hooks/useArticleClusterCandidatesQuery';
import { usePublicClusterByHumanIdQuery } from './public-clusters/hooks/usePublicClusterByHumanIdQuery';
import { usePublicClustersQuery } from './public-clusters/hooks/usePublicClustersQuery';
import { useArticlesQuery } from './raw-news/hooks/useArticlesQuery';
import { useRawArticlesQuery } from './raw-news/hooks/useRawArticlesQuery';

const clients: QueryClient[] = [];
const fetchMock = vi.fn<typeof fetch>();

const job = (status: EnrichmentJob['status'], running = 0): EnrichmentJob => ({
    id: 'j1',
    status,
    total: 1,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    counts: {
        PENDING: 0,
        RUNNING: running,
        FULL_TEXT: 0,
        PARTIAL_TEXT: 0,
        PROPOSED: 0,
        UNCHANGED: 0,
        SKIPPED: 0,
        ERROR: 0,
        CANCELED: 0,
    },
});

function setupClient() {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: Infinity },
            mutations: { retry: false },
        },
    });
    clients.push(client);
    const wrapper = ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children);
    return { client, wrapper };
}

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(
        async () =>
            new Response(
                JSON.stringify({ marker: 'server', job: job('COMPLETED') }),
                { status: 200 },
            ),
    );
});

afterEach(() => {
    clients.splice(0).forEach((client) => client.clear());
    vi.useRealTimers();
});

interface QueryCase {
    name: string;
    useHook: () => UseQueryResult<unknown, Error>;
    key: readonly unknown[];
    endpoint: string;
}

const queries: QueryCase[] = [
    {
        name: 'articles',
        useHook: () => useArticlesQuery(),
        key: queryKeys.articles.all,
        endpoint: '/articles',
    },
    {
        name: 'raw articles',
        useHook: () =>
            useRawArticlesQuery({ search: 'News' }, { page: 2, limit: 25 }),
        key: ['articles', 'raw', { search: 'News' }, 2, 25],
        endpoint: '/admin/articles/raw?search=News&page=2&limit=25',
    },
    {
        name: 'clusters',
        useHook: () => useClustersQuery({ page: 2, limit: 25 }),
        key: queryKeys.clusters.list({ page: 2, limit: 25 }),
        endpoint: '/admin/clusters?page=2&limit=25',
    },
    {
        name: 'cluster details',
        useHook: () => useClusterByIdQuery('c1'),
        key: queryKeys.clusters.detail('c1'),
        endpoint: '/admin/clusters/c1',
    },
    {
        name: 'cluster candidates',
        useHook: () => useClusterCandidatesQuery(),
        key: queryKeys.clusterCandidates.list(),
        endpoint: '/admin/cluster-candidates',
    },
    {
        name: 'candidates for cluster',
        useHook: () => useArticleClusterCandidatesQuery('c1'),
        key: queryKeys.clusters.candidates('c1'),
        endpoint: '/admin/clusters/c1/candidates',
    },
    {
        name: 'article cluster suggestions',
        useHook: () => useSuggestionQuery({ page: 2, limit: 25 }, 'revision1'),
        key: articleClusterCandidateKeys.list(
            { page: 2, limit: 25 },
            'revision1',
        ),
        endpoint: '/admin/article-cluster-candidates?page=2&limit=25',
    },
    {
        name: 'public clusters',
        useHook: () =>
            usePublicClustersQuery({ minSources: 2, page: 2, limit: 25 }),
        key: queryKeys.publicClusters.list({
            minSources: 2,
            page: 2,
            limit: 25,
        }),
        endpoint: '/public/clusters?minSources=2&page=2&limit=25',
    },
    {
        name: 'public cluster detail',
        useHook: () => usePublicClusterByHumanIdQuery('news-1'),
        key: queryKeys.publicClusters.detail('news-1'),
        endpoint: '/clusters/news-1',
    },
    {
        name: 'enrichment jobs',
        useHook: () => useEnrichmentJobsQuery(),
        key: enrichmentKeys.jobs,
        endpoint: '/admin/articles/enrichment/jobs',
    },
    {
        name: 'enrichment job details',
        useHook: () => useEnrichmentJobQuery('j1', 2),
        key: enrichmentKeys.job('j1', 2),
        endpoint: '/admin/articles/enrichment/jobs/j1?page=2&limit=50',
    },
    {
        name: 'enrichment proposal',
        useHook: () => useEnrichmentProposalQuery('i1'),
        key: enrichmentKeys.proposal('i1'),
        endpoint: '/admin/articles/enrichment/items/i1/proposal',
    },
    {
        name: 'article versions',
        useHook: () => useArticleContentVersionsQuery('a1'),
        key: enrichmentKeys.versions('a1'),
        endpoint: '/admin/articles/enrichment/articles/a1/versions',
    },
];

describe('entity query hooks', () => {
    it.each(queries)(
        'stores $name response under its parameterized query key',
        async ({ useHook, key, endpoint }) => {
            const { client, wrapper } = setupClient();
            const { result } = renderHook(useHook, { wrapper });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toMatchObject({ marker: 'server' });
            expect(client.getQueryData(key)).toEqual(result.current.data);
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(fetchMock.mock.calls[0][0]).toBe(
                `https://api.test.invalid${endpoint}`,
            );
        },
    );

    it.each([
        {
            name: 'cluster details',
            useHook: (id: string | null) => useClusterByIdQuery(id),
        },
        {
            name: 'cluster candidates',
            useHook: (id: string | null) =>
                useArticleClusterCandidatesQuery(id),
        },
        {
            name: 'public details',
            useHook: (id: string | null) =>
                usePublicClusterByHumanIdQuery(id ?? undefined),
        },
        {
            name: 'enrichment job',
            useHook: (id: string | null) => useEnrichmentJobQuery(id, 1),
        },
        {
            name: 'enrichment proposal',
            useHook: (id: string | null) => useEnrichmentProposalQuery(id),
        },
        {
            name: 'article versions',
            useHook: (id: string | null) => useArticleContentVersionsQuery(id),
        },
    ])('defers $name until an identifier is available', async ({ useHook }) => {
        const { wrapper } = setupClient();
        const { result, rerender } = renderHook(({ id }) => useHook(id), {
            wrapper,
            initialProps: { id: null as string | null },
        });
        expect(result.current.fetchStatus).toBe('idle');
        expect(fetchMock).not.toHaveBeenCalled();

        rerender({ id: 'id1' });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock.mock.calls[0][0]).toContain('id1');
    });

    it('honors the raw article enabled flag', async () => {
        const { wrapper } = setupClient();
        const { result, rerender } = renderHook(
            ({ enabled }) => useRawArticlesQuery({}, undefined, enabled),
            { wrapper, initialProps: { enabled: false } },
        );
        expect(result.current.fetchStatus).toBe('idle');
        expect(fetchMock).not.toHaveBeenCalled();
        rerender({ enabled: true });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it.each([
        { name: 'raw articles', useHook: () => useRawArticlesQuery({}) },
        {
            name: 'public clusters',
            useHook: () => usePublicClustersQuery({ page: 1, limit: 25 }),
        },
        {
            name: 'article cluster suggestions',
            useHook: () => useSuggestionQuery({ page: 1, limit: 25 }, 'r1'),
        },
        { name: 'enrichment jobs', useHook: () => useEnrichmentJobsQuery() },
        {
            name: 'enrichment job',
            useHook: () => useEnrichmentJobQuery('j1', 1),
        },
        {
            name: 'enrichment proposal',
            useHook: () => useEnrichmentProposalQuery('i1'),
        },
        {
            name: 'article history',
            useHook: () => useArticleContentVersionsQuery('a1'),
        },
    ])(
        'aborts $name network request when its observer unmounts',
        async ({ useHook }) => {
            let signal: AbortSignal | null | undefined;
            fetchMock.mockImplementation((_url, options) => {
                signal = options?.signal;
                return new Promise<Response>((_resolve, reject) => {
                    signal?.addEventListener('abort', () =>
                        reject(new DOMException('Canceled', 'AbortError')),
                    );
                });
            });
            const { wrapper } = setupClient();
            const { unmount } = renderHook<
                UseQueryResult<unknown, Error>,
                unknown
            >(useHook, { wrapper });
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(signal?.aborted).toBe(false);
            unmount();
            expect(signal?.aborted).toBe(true);
        },
    );

    it('keeps the current raw article page visible while the next page is loading', async () => {
        let resolveNext!: (response: Response) => void;
        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ articles: [{ id: 'page1' }] }), {
                status: 200,
            }),
        );
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveNext = resolve;
                }),
        );
        const { client, wrapper } = setupClient();
        const { result, rerender } = renderHook(
            ({ page }) => useRawArticlesQuery({}, { page, limit: 25 }),
            { wrapper, initialProps: { page: 1 } },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        rerender({ page: 2 });
        expect(result.current.isPlaceholderData).toBe(true);
        expect(result.current.data?.articles).toEqual([{ id: 'page1' }]);
        expect(result.current.isFetching).toBe(true);
        await act(async () =>
            resolveNext(
                new Response(JSON.stringify({ articles: [{ id: 'page2' }] }), {
                    status: 200,
                }),
            ),
        );
        await waitFor(() =>
            expect(result.current.isPlaceholderData).toBe(false),
        );
        expect(result.current.data?.articles).toEqual([{ id: 'page2' }]);
        expect(client.getQueryData(['articles', 'raw', {}, 1, 25])).toEqual({
            articles: [{ id: 'page1' }],
        });
        expect(client.getQueryData(['articles', 'raw', {}, 2, 25])).toEqual({
            articles: [{ id: 'page2' }],
        });
    });

    it('refetches article suggestions when the data revision changes', async () => {
        const { client, wrapper } = setupClient();
        const params = { page: 1, limit: 25 };
        const { result, rerender } = renderHook(
            ({ revision }) => useSuggestionQuery(params, revision),
            { wrapper, initialProps: { revision: 'r1' } },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        rerender({ revision: 'r2' });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(
            client.getQueryData(articleClusterCandidateKeys.list(params, 'r1')),
        ).toBeDefined();
        expect(
            client.getQueryData(articleClusterCandidateKeys.list(params, 'r2')),
        ).toBeDefined();
    });

    it('exposes server errors without retries in the test client', async () => {
        fetchMock.mockResolvedValue(
            new Response('Unavailable', { status: 503 }),
        );
        const { wrapper } = setupClient();
        const { result } = renderHook(() => useArticlesQuery(), { wrapper });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error?.message).toContain('503: Unavailable');
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe('enrichment polling', () => {
    it('refreshes the job list every five seconds', async () => {
        vi.useFakeTimers();
        const { wrapper } = setupClient();
        const { unmount } = renderHook(() => useEnrichmentJobsQuery(), {
            wrapper,
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(fetchMock).toHaveBeenCalledOnce();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4999);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        { status: 'QUEUED' as const, running: 0 },
        { status: 'RUNNING' as const, running: 0 },
        { status: 'COMPLETED' as const, running: 1 },
    ])(
        'polls $status with $running running items, then stops after completion',
        async ({ status, running }) => {
            vi.useFakeTimers();
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify({ job: job(status, running) }), {
                    status: 200,
                }),
            );
            fetchMock.mockImplementation(
                async () =>
                    new Response(JSON.stringify({ job: job('COMPLETED', 0) }), {
                        status: 200,
                    }),
            );
            const { wrapper } = setupClient();
            const { result } = renderHook(
                () => useEnrichmentJobQuery('j1', 1),
                { wrapper },
            );
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1);
            });
            expect(result.current.data?.job.status).toBe(status);
            expect(fetchMock).toHaveBeenCalledOnce();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(result.current.data?.job.status).toBe('COMPLETED');
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000);
            });
            expect(fetchMock).toHaveBeenCalledTimes(2);
        },
    );

    it.each(['COMPLETED', 'CANCELED'] as const)(
        'does not poll settled %s jobs',
        async (status) => {
            vi.useFakeTimers();
            fetchMock.mockImplementation(
                async () =>
                    new Response(JSON.stringify({ job: job(status) }), {
                        status: 200,
                    }),
            );
            const { wrapper } = setupClient();
            renderHook(() => useEnrichmentJobQuery('j1', 1), { wrapper });
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000);
            });
            expect(fetchMock).toHaveBeenCalledOnce();
        },
    );
});

describe('isEnrichmentJobActive', () => {
    it.each(['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED'] as const)(
        'recognizes %s state',
        (status) => {
            expect(isEnrichmentJobActive(job(status))).toBe(
                status === 'QUEUED' || status === 'RUNNING',
            );
        },
    );

    it('handles an absent job', () =>
        expect(isEnrichmentJobActive()).toBe(false));
});
