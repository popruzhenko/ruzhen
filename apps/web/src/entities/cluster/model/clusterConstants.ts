export const CLUSTER_STATUS = {
    DRAFT: 'DRAFT',
    PUBLISHED: 'PUBLISHED',
    ARCHIVED: 'ARCHIVED',
} as const;

export type ClusterStatus =
    (typeof CLUSTER_STATUS)[keyof typeof CLUSTER_STATUS];