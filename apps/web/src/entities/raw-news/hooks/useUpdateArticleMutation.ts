import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidateRawArticleQueries } from './invalidateRawArticleQueries';

import { updateArticle } from '../api/updateArticle';

export function useUpdateArticleMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateArticle,
        onSettled: () => invalidateRawArticleQueries(queryClient),
    });
}
