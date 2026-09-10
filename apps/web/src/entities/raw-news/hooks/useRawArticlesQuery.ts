import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getRawArticles } from '../api/rawArticles';
import type {
    RawArticlesFilters,
    RawArticlesListPagination,
} from '../model/rawArticles';

export function useRawArticlesQuery(
    filters: RawArticlesFilters,
    pagination: RawArticlesListPagination = { page: 1, limit: 50 },
    enabled = true,
) {
    return useQuery({
        queryKey: [
            'articles',
            'raw',
            filters,
            pagination.page,
            pagination.limit,
        ],
        queryFn: ({ signal }) => getRawArticles(filters, signal, pagination),
        placeholderData: keepPreviousData,
        enabled,
    });
}
