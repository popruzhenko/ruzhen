import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClusterFromArticles } from '../api/createClusterFromArticles';
import { queryKeys } from '../../../shared/lib/queryKeys';

export function useCreateClusterFromArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createClusterFromArticles,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });
        },
    });
}
