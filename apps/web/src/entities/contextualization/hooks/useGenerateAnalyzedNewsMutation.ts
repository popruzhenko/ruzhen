import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { generateAnalyzedNews } from '../api/generateAnalyzedNews';

export function useGenerateAnalyzedNewsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: generateAnalyzedNews,
        onSuccess: (_, clusterId) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.detail(clusterId),
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.blocks(clusterId),
            });
        },
    });
}