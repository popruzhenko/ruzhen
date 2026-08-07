import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchNewArticles,
    type FetchNewArticlesResponse,
} from '../api/fetchNewArticles';

export function useFetchNewArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation<FetchNewArticlesResponse, Error>({
        mutationFn: fetchNewArticles,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}