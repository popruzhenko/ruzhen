import { useMutation, useQueryClient } from '@tanstack/react-query';

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
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster', variables.clusterId],
            });

            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}
