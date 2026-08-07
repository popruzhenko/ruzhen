export type ContextualizationStatusFilter =
    'ALL' | 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type ContextualizationDraftStateFilter =
    'ALL' | 'WITHOUT_BLOCKS' | 'WITH_BLOCKS' | 'READY_TO_REVIEW';

export type ContextualizationDateFilter =
    'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export type ContextualizationSourceCountFilter =
    'ALL' | 'GTE_2' | 'GTE_3' | 'GTE_5' | 'GTE_10';

export interface ContextualizationFiltersState {
    search: string;
    status: ContextualizationStatusFilter;
    draftState: ContextualizationDraftStateFilter;
    updatedDate: ContextualizationDateFilter;
    sourceCount: ContextualizationSourceCountFilter;
}

export interface ContextualizationFiltersProps {
    filters: ContextualizationFiltersState;
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof ContextualizationFiltersState>(
        key: K,
        value: ContextualizationFiltersState[K],
    ) => void;
    onClear: () => void;
}
