import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateAnalyzedNews } from '../api/generateAnalyzedNews';

export function useGenerateAnalyzedNewsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: generateAnalyzedNews,
        onSuccess: (_, clusterId) => {
            queryClient.invalidateQueries({
                queryKey: ['cluster', clusterId],
            });

            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster-blocks', clusterId],
            });
        },
    });
}