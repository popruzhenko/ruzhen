import type { ClusterStatus } from '../../../../../../entities/cluster/model/clusterConstants';

export type PublicationStatusFilter = 'ALL' | ClusterStatus;

export type PublicationUpdatedDateFilter =
    'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export type PublicationSourceCountFilter =
    'ALL' | 'GTE_2' | 'GTE_3' | 'GTE_5' | 'GTE_10';

export interface PublicationFiltersState {
    search: string;
    status: PublicationStatusFilter;
    updatedDate: PublicationUpdatedDateFilter;
    sourceCount: PublicationSourceCountFilter;
}

export interface PublicationFiltersProps {
    filters: PublicationFiltersState;
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof PublicationFiltersState>(
        key: K,
        value: PublicationFiltersState[K],
    ) => void;
    onClear: () => void;
}
