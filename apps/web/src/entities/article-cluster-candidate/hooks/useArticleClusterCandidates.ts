import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryClient,
} from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import {
    acceptArticleClusterCandidate,
    generateArticleClusterCandidates,
    getArticleClusterCandidates,
    rejectArticleClusterCandidate,
} from '../api/articleClusterCandidates';
import { articleClusterCandidateKeys } from '../model/queryKeys';
import type { ArticleClusterCandidatesParams } from '../model/types';

// A successful write stays successful if a subsequent read cannot be refreshed.
// The affected query exposes its own refresh error to its consumer.
const refreshQueries = async (
    client: QueryClient,
    keys: readonly (readonly string[])[],
) => {
    await Promise.allSettled(
        keys.map((queryKey) => client.invalidateQueries({ queryKey })),
    );
};

export function useArticleClusterCandidatesQuery(
    params: ArticleClusterCandidatesParams,
    dataRevision: string,
) {
    return useQuery({
        queryKey: articleClusterCandidateKeys.list(params, dataRevision),
        queryFn: ({ signal }) => getArticleClusterCandidates(params, signal),
    });
}

export function useGenerateArticleClusterCandidatesMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: generateArticleClusterCandidates,
        onSuccess: () =>
            refreshQueries(client, [articleClusterCandidateKeys.all]),
    });
}

export function useAcceptArticleClusterCandidateMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: acceptArticleClusterCandidate,
        onSuccess: () =>
            refreshQueries(client, [
                queryKeys.articles.all,
                queryKeys.clusters.all,
                queryKeys.publicClusters.all,
                queryKeys.clusterCandidates.all,
            ]),
        // A conflict can mean another editor already handled this suggestion.
        onSettled: () =>
            refreshQueries(client, [articleClusterCandidateKeys.all]),
    });
}

export function useRejectArticleClusterCandidateMutation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: rejectArticleClusterCandidate,
        onSettled: () =>
            refreshQueries(client, [articleClusterCandidateKeys.all]),
    });
}
