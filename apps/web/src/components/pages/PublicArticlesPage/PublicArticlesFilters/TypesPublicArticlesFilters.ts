export type PublicArticlesPublishedDateFilter =
    'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export type PublicArticlesSourceCountFilter =
    'ALL' | 'GTE_2' | 'GTE_3' | 'GTE_5' | 'GTE_10';

export type PublicArticlesBlockTypeFilter =
    'ALL' | 'WITH_FACTS' | 'WITH_CONTEXT' | 'WITH_OPINIONS';

export type PublicArticlesSortFilter =
    'NEWEST' | 'OLDEST' | 'MOST_SOURCES' | 'TITLE_ASC';

export interface PublicArticlesFiltersState {
    search: string;
    publishedDate: PublicArticlesPublishedDateFilter;
    sourceCount: PublicArticlesSourceCountFilter;
    blockType: PublicArticlesBlockTypeFilter;
    sort: PublicArticlesSortFilter;
}

export interface PublicArticlesFiltersProps {
    filters: PublicArticlesFiltersState;
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof PublicArticlesFiltersState>(
        key: K,
        value: PublicArticlesFiltersState[K],
    ) => void;
    onClear: () => void;
}
