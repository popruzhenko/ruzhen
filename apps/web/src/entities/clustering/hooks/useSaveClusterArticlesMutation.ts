import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { saveClusterArticles } from '../api/saveClusterArticles';

export function useSaveClusterArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveClusterArticles,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.detail(variables.clusterId),
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.candidates(variables.clusterId),
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });
        },
    });
}