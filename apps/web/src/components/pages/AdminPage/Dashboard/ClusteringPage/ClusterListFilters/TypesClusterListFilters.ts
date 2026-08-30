export type ClusterListFilterStatus =
    'ALL' | 'CANDIDATE' | 'DRAFT' | 'UPDATED' | 'PUBLISHED' | 'ARCHIVED';

export type ClusterListFilterSort =
    'NEWEST' | 'OLDEST' | 'TITLE_ASC' | 'ARTICLES_DESC' | 'SIMILARITY_DESC';

export interface ClusterListFiltersState {
    search: string;
    status: ClusterListFilterStatus;
    sort: ClusterListFilterSort;
}
