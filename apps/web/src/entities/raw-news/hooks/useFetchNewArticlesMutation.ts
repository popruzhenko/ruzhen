import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

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
                queryKey: queryKeys.articles.all,
            });
        },
    });
}