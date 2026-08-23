import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { generateArticleEmbeddings } from '../api/generateArticleEmbeddings';

export function useGenerateArticleEmbeddingsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: generateArticleEmbeddings,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });
        },
    });
}
