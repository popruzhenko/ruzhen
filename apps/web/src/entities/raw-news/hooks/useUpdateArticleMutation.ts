import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateArticle } from '../api/updateArticle';

export function useUpdateArticleMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: updateArticle,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}
