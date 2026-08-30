import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { reviewArticleContent } from '../api/reviewArticleContent';

export function useReviewArticleContentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: reviewArticleContent,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });
        },
    });
}