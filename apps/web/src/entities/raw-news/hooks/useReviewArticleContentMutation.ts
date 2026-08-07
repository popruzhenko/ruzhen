import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reviewArticleContent } from '../api/reviewArticleContent';

export function useReviewArticleContentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: reviewArticleContent,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}
