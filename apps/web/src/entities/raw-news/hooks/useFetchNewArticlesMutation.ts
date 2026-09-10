import { useMutation, useQueryClient } from '@tanstack/react-query';

import { refreshEnrichmentQueries } from '../../article-enrichment/hooks/useArticleEnrichment';

import {
    fetchNewArticles,
    type FetchNewArticlesResponse,
} from '../api/fetchNewArticles';

export function useFetchNewArticlesMutation() {
    const queryClient = useQueryClient();

    return useMutation<FetchNewArticlesResponse, Error>({
        mutationFn: fetchNewArticles,
        onSettled: () => refreshEnrichmentQueries(queryClient, true),
    });
}
