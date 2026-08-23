import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import {
    updateClusterArticles,
    type UpdateClusterArticlesPayload,
    type UpdateClusterArticlesResponse,
} from '../api/updateClusterArticles';

interface UseUpdateClusterArticlesVariables {
    clusterId: string;
    payload: UpdateClusterArticlesPayload;
}

export function useUpdateClusterArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation<
        UpdateClusterArticlesResponse,
        Error,
        UseUpdateClusterArticlesVariables
    >({
        mutationFn: ({ clusterId, payload }) =>
            updateClusterArticles(clusterId, payload),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.detail(variables.clusterId),
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });
        },
    });
}
