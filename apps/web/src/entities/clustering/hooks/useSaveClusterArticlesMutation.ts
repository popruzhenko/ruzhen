import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveClusterArticles } from '../api/saveClusterArticles';

export function useSaveClusterArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: saveClusterArticles,
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['cluster', variables.clusterId],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster-candidates', variables.clusterId],
            });

            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });
        },
    });
}
