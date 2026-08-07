import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateArticleEmbeddings } from '../api/generateArticleEmbeddings';

export function useGenerateArticleEmbeddingsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: generateArticleEmbeddings,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });

            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster'],
            });
        },
    });
}
