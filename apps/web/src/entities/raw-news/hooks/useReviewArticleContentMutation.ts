import { useMutation, useQueryClient } from '@tanstack/react-query';

import { invalidateRawArticleQueries } from './invalidateRawArticleQueries';

import { reviewArticleContent } from '../api/reviewArticleContent';

export function useReviewArticleContentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: reviewArticleContent,
        onSettled: () => invalidateRawArticleQueries(queryClient),
    });
}
