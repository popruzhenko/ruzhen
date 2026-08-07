export type RawNewsStatusFilter =
    | 'ALL'
    | 'NEW'
    | 'NEEDS_REVIEW'
    | 'REVIEWED'
    | 'APPROVED'
    | 'REJECTED'
    | 'EMBEDDED'
    | 'CLUSTERED';

export type RawNewsContentFilter =
    | 'ALL'
    | 'FULL_TEXT'
    | 'PARTIAL_TEXT'
    | 'SUMMARY_ONLY'
    | 'TITLE_ONLY'
    | 'PREVIEW_ONLY';

export type RawNewsDateFilter =
    | 'ALL'
    | 'TODAY'
    | 'YESTERDAY'
    | 'LAST_7_DAYS'
    | 'LAST_30_DAYS';

export interface RawNewsSourceOption {
    label: string;
    value: string;
}

export interface RawNewsFiltersState {
    search: string;
    status: RawNewsStatusFilter;
    contentAvailability: RawNewsContentFilter;
    sourceName: string;
    fetchedDate: RawNewsDateFilter;
    onlyProblematic: boolean;
}

export interface RawNewsFiltersProps {
    filters: RawNewsFiltersState;
    sourceOptions: RawNewsSourceOption[];
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof RawNewsFiltersState>(
        key: K,
        value: RawNewsFiltersState[K],
    ) => void;
    onClear: () => void;
    onFetchNewArticles: () => void;
    isFetchingNewArticles?: boolean;
}