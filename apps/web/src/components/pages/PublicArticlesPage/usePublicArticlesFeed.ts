import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    usePublicClustersQuery,
    type PublicClusterListItem,
} from '../../../entities/public-clusters';
import type { PublicArticlesFiltersState } from './PublicArticlesFilters/TypesPublicArticlesFilters';
import { getPublicArticlesQueryParams } from './PublicArticlesFilters/getPublicArticlesQueryParams';
import {
    hasActivePublicArticlesFilters,
    initialPublicArticlesFilters,
} from './PublicArticlesFilters/publicArticlesFiltersConfig';

const DEFAULT_LIMIT = 10;
const EMPTY_ARTICLES: PublicClusterListItem[] = [];

export function usePublicArticlesFeed() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [filters, setFilters] = useState<PublicArticlesFiltersState>(
        initialPublicArticlesFilters,
    );
    const requestedPage = Number(searchParams.get('page'));
    const page =
        Number.isSafeInteger(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;
    const publicClustersQuery = usePublicClustersQuery(
        getPublicArticlesQueryParams(filters, page, DEFAULT_LIMIT),
    );

    const setPage = (nextPage: number, replace = false) => {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set('page', String(nextPage));
                return next;
            },
            { replace },
        );
    };

    const handlePageChange = (nextPage: number) => {
        setPage(nextPage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleChangeFilter = <K extends keyof PublicArticlesFiltersState>(
        key: K,
        value: PublicArticlesFiltersState[K],
    ) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setPage(1, true);
    };

    const handleClearFilters = () => {
        setFilters(initialPublicArticlesFilters);
        setPage(1, true);
    };

    return {
        publicClustersQuery,
        articles: publicClustersQuery.data?.items ?? EMPTY_ARTICLES,
        pagination: publicClustersQuery.data?.pagination,
        filters,
        hasActiveFilters: hasActivePublicArticlesFilters(filters),
        handlePageChange,
        handleChangeFilter,
        handleClearFilters,
    };
}
