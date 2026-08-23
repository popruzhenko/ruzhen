import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { updateArticle } from '../api/updateArticle';

export function useUpdateArticleMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateArticle,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });
        },
    });
}