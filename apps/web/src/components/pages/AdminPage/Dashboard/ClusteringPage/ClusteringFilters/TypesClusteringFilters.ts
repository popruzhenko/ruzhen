export type ClusteringDateFilter =
    'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export type ClusteringEmbeddingFilter =
    'ALL' | 'WITH_EMBEDDING' | 'WITHOUT_EMBEDDING';

export type ClusteringSimilarityFilter =
    'ALL' | 'GT_070' | 'GT_075' | 'GT_080' | 'GT_085';

export type ClusteringSortFilter =
    'NEWEST' | 'OLDEST' | 'SIMILARITY_DESC' | 'SIMILARITY_ASC' | 'TITLE_ASC';

export interface ClusteringSourceOption {
    label: string;
    value: string;
}

export interface ClusteringFiltersState {
    search: string;
    fetchedDate: ClusteringDateFilter;
    sourceName: string;
    embedding: ClusteringEmbeddingFilter;
    similarity: ClusteringSimilarityFilter;
    sort: ClusteringSortFilter;
    onlySelected: boolean;
}

export interface ClusteringFiltersProps {
    filters: ClusteringFiltersState;
    sourceOptions: ClusteringSourceOption[];
    totalCount: number;
    filteredCount: number;
    selectedCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof ClusteringFiltersState>(
        key: K,
        value: ClusteringFiltersState[K],
    ) => void;
    onClear: () => void;
}
