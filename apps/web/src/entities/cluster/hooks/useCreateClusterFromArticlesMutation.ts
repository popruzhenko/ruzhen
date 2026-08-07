import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClusterFromArticles } from '../api/createClusterFromArticles';

export function useCreateClusterFromArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createClusterFromArticles,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}
