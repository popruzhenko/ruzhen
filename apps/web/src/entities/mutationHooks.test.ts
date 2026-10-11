import { createElement, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    useAcceptArticleClusterCandidateMutation,
    useGenerateArticleClusterCandidatesMutation,
    useRejectArticleClusterCandidateMutation,
} from './article-cluster-candidate/hooks/useArticleClusterCandidates';
import { refreshEnrichmentQueries } from './article-enrichment/hooks/useArticleEnrichment';
import { useAcceptClusterCandidateMutation } from './cluster-candidate/hooks/useAcceptClusterCandidateMutation';
import { useDeleteClusterCandidateMutation } from './cluster-candidate/hooks/useDeleteClusterCandidateMutation';
import { useGenerateClusterCandidatesMutation } from './cluster-candidate/hooks/useGenerateClusterCandidatesMutation';
import { useCreateClusterFromArticlesMutation } from './cluster/hooks/useCreateClusterFromArticlesMutation';
import { useCreateClusterMutation } from './cluster/hooks/useCreateClusterMutation';
import { useDeleteClusterMutation } from './cluster/hooks/useDeleteClusterMutation';
import { useUpdateClusterArticlesMutation } from './cluster/hooks/useUpdateClusterArticlesMutation';
import { useGenerateArticleEmbeddingsMutation } from './clustering/hooks/useGenerateArticleEmbeddingsMutation';
import { useSaveClusterArticlesMutation } from './clustering/hooks/useSaveClusterArticlesMutation';
import { useGenerateAnalyzedNewsMutation } from './contextualization/hooks/useGenerateAnalyzedNewsMutation';
import { useSaveContextDraftMutation } from './contextualization/model/useSaveContextDraftMutation';
import { useUpdateClusterStatusMutation } from './publication/model/useUpdateClusterStatusMutation';
import { useFetchNewArticlesMutation } from './raw-news/hooks/useFetchNewArticlesMutation';
import { invalidateRawArticleQueries } from './raw-news/hooks/invalidateRawArticleQueries';
import { useReviewArticleContentMutation } from './raw-news/hooks/useReviewArticleContentMutation';
import { useUpdateArticleMutation } from './raw-news/hooks/useUpdateArticleMutation';

const rawKeys = [
    'articles',
    'clusters',
    'cluster-candidates',
    'article-cluster-candidates',
    'public-clusters',
];
const cacheKeys = [
    ...rawKeys,
    'article-enrichment',
    'cluster-bulk-jobs',
    'unrelated',
];
const clients: QueryClient[] = [];
const fetchMock = vi.fn<typeof fetch>();

function setupClient() {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
            mutations: { retry: false },
        },
    });
    clients.push(client);
    cacheKeys.forEach((root) => {
        client.setQueryData([root], { marker: root });
        client.setQueryData([root, 'nested', 'c1'], {
            marker: `${root} nested`,
        });
    });
    const wrapper = ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children);
    return { client, wrapper };
}

function expectInvalidations(
    client: QueryClient,
    expectedRoots: readonly string[],
) {
    cacheKeys.forEach((root) => {
        expect(
            client.getQueryState([root])?.isInvalidated,
            `root ${root}`,
        ).toBe(expectedRoots.includes(root));
        expect(
            client.getQueryState([root, 'nested', 'c1'])?.isInvalidated,
            `nested ${root}`,
        ).toBe(expectedRoots.includes(root));
    });
}

interface MutationCase {
    name: string;
    useHook: () => {
        run: () => Promise<unknown>;
        status: string;
        error: Error | null;
    };
    success: readonly string[];
    failure?: readonly string[];
}

const cases: MutationCase[] = [
    {
        name: 'create cluster',
        useHook: () => {
            const mutation = useCreateClusterMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync({ title: 'New cluster' }),
            };
        },
        success: ['clusters'],
    },
    {
        name: 'create cluster from articles',
        useHook: () => {
            const mutation = useCreateClusterFromArticlesMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync({ articleIds: ['a1'] }),
            };
        },
        success: ['clusters', 'articles'],
    },
    {
        name: 'delete cluster',
        useHook: () => {
            const mutation = useDeleteClusterMutation();
            return { ...mutation, run: () => mutation.mutateAsync('c1') };
        },
        success: ['clusters', 'articles'],
    },
    {
        name: 'update cluster articles',
        useHook: () => {
            const mutation = useUpdateClusterArticlesMutation();
            return {
                ...mutation,
                run: () =>
                    mutation.mutateAsync({
                        clusterId: 'c1',
                        payload: { articles: [] },
                    }),
            };
        },
        success: ['clusters', 'articles'],
    },
    {
        name: 'save cluster article selection',
        useHook: () => {
            const mutation = useSaveClusterArticlesMutation();
            return {
                ...mutation,
                run: () =>
                    mutation.mutateAsync({
                        clusterId: 'c1',
                        articleIds: ['a1'],
                    }),
            };
        },
        success: ['clusters'],
    },
    {
        name: 'generate article embeddings',
        useHook: () => {
            const mutation = useGenerateArticleEmbeddingsMutation();
            return { ...mutation, run: () => mutation.mutateAsync() };
        },
        success: ['articles', 'clusters'],
    },
    {
        name: 'generate cluster candidates',
        useHook: () => {
            const mutation = useGenerateClusterCandidatesMutation();
            return { ...mutation, run: () => mutation.mutateAsync() };
        },
        success: ['cluster-candidates'],
    },
    {
        name: 'delete cluster candidate',
        useHook: () => {
            const mutation = useDeleteClusterCandidateMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync('candidate1'),
            };
        },
        success: ['cluster-candidates'],
    },
    {
        name: 'accept cluster candidate',
        useHook: () => {
            const mutation = useAcceptClusterCandidateMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync('candidate1'),
            };
        },
        success: ['cluster-candidates', 'clusters'],
    },
    {
        name: 'generate context',
        useHook: () => {
            const mutation = useGenerateAnalyzedNewsMutation();
            return { ...mutation, run: () => mutation.mutateAsync('c1') };
        },
        success: ['clusters'],
    },
    {
        name: 'save context draft',
        useHook: () => {
            const mutation = useSaveContextDraftMutation();
            return {
                ...mutation,
                run: () =>
                    mutation.mutateAsync({
                        clusterId: 'c1',
                        payload: {
                            title: 'News',
                            summary: 'Summary',
                            blocks: [],
                        },
                    }),
            };
        },
        success: ['clusters'],
    },
    {
        name: 'publish cluster',
        useHook: () => {
            const mutation = useUpdateClusterStatusMutation();
            return {
                ...mutation,
                run: () =>
                    mutation.mutateAsync({
                        clusterId: 'c1',
                        status: 'PUBLISHED',
                    }),
            };
        },
        success: ['clusters'],
    },
    {
        name: 'update article',
        useHook: () => {
            const mutation = useUpdateArticleMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync({ id: 'a1', title: 'Edited' }),
            };
        },
        success: rawKeys,
        failure: rawKeys,
    },
    {
        name: 'review article content',
        useHook: () => {
            const mutation = useReviewArticleContentMutation();
            return {
                ...mutation,
                run: () =>
                    mutation.mutateAsync({
                        id: 'a1',
                        expectedUpdatedAt: 'revision1',
                    }),
            };
        },
        success: rawKeys,
        failure: rawKeys,
    },
    {
        name: 'fetch new articles',
        useHook: () => {
            const mutation = useFetchNewArticlesMutation();
            return { ...mutation, run: () => mutation.mutateAsync() };
        },
        success: [...rawKeys, 'article-enrichment'],
        failure: [...rawKeys, 'article-enrichment'],
    },
    {
        name: 'generate article cluster suggestions',
        useHook: () => {
            const mutation = useGenerateArticleClusterCandidatesMutation();
            return { ...mutation, run: () => mutation.mutateAsync() };
        },
        success: ['article-cluster-candidates'],
    },
    {
        name: 'accept article cluster suggestion',
        useHook: () => {
            const mutation = useAcceptArticleClusterCandidateMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync('suggestion1'),
            };
        },
        success: rawKeys,
        failure: ['article-cluster-candidates'],
    },
    {
        name: 'reject article cluster suggestion',
        useHook: () => {
            const mutation = useRejectArticleClusterCandidateMutation();
            return {
                ...mutation,
                run: () => mutation.mutateAsync('suggestion1'),
            };
        },
        success: ['article-cluster-candidates'],
        failure: ['article-cluster-candidates'],
    },
];

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(
        async () =>
            new Response(JSON.stringify({ marker: 'saved' }), { status: 200 }),
    );
});

afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('mutation cache consistency', () => {
    it.each(cases)(
        '$name invalidates affected query families after a successful write',
        async ({ useHook, success }) => {
            const { client, wrapper } = setupClient();
            const { result } = renderHook(useHook, { wrapper });
            await act(async () => {
                await expect(result.current.run()).resolves.toEqual({
                    marker: 'saved',
                });
            });
            await waitFor(() => expect(result.current.status).toBe('success'));
            expect(fetchMock).toHaveBeenCalledOnce();
            expectInvalidations(client, success);
        },
    );

    it.each(cases)(
        '$name applies its refresh policy after a server conflict',
        async ({ useHook, failure = [] }) => {
            fetchMock.mockResolvedValue(
                new Response('Revision conflict', { status: 409 }),
            );
            const { client, wrapper } = setupClient();
            const { result } = renderHook(useHook, { wrapper });
            await act(async () => {
                await expect(result.current.run()).rejects.toThrow(
                    '409: Revision conflict',
                );
            });
            await waitFor(() => expect(result.current.status).toBe('error'));
            expect(result.current.error?.message).toContain(
                'Revision conflict',
            );
            expect(fetchMock).toHaveBeenCalledOnce();
            expectInvalidations(client, failure);
        },
    );

    it('preserves successful suggestion acceptance when a subsequent refresh rejects', async () => {
        const { client, wrapper } = setupClient();
        const refresh = vi
            .spyOn(client, 'invalidateQueries')
            .mockRejectedValue(new Error('Refresh unavailable'));
        const { result } = renderHook(
            () => useAcceptArticleClusterCandidateMutation(),
            { wrapper },
        );

        await act(async () => {
            await expect(
                result.current.mutateAsync('suggestion1'),
            ).resolves.toEqual({ marker: 'saved' });
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(refresh).toHaveBeenCalledTimes(5);
    });
});

describe('refresh helpers', () => {
    it.each([false, true])(
        'refreshes enrichment and includes article families only for articlesChanged=%s',
        async (articlesChanged) => {
            const { client } = setupClient();
            await refreshEnrichmentQueries(client, articlesChanged);
            expectInvalidations(
                client,
                articlesChanged
                    ? [...rawKeys, 'article-enrichment']
                    : ['article-enrichment'],
            );
        },
    );

    it('attempts every raw article family even if one refresh fails', async () => {
        const { client } = setupClient();
        const refresh = vi
            .spyOn(client, 'invalidateQueries')
            .mockRejectedValueOnce(new Error('First refresh failed'));
        await expect(
            invalidateRawArticleQueries(client),
        ).resolves.toBeUndefined();
        expect(refresh).toHaveBeenCalledTimes(rawKeys.length);
        rawKeys.forEach((key) =>
            expect(refresh).toHaveBeenCalledWith({ queryKey: [key] }),
        );
    });
});
