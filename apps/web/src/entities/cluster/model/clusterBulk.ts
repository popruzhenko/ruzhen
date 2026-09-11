export type ClusterBulkAction = 'CONTEXTUALIZE' | 'PUBLISH';

export interface ClusterBulkItem {
    clusterId: string;
    humanId: string;
    title: string;
    revision: string;
}

export interface ClusterBulkPreview {
    action: ClusterBulkAction;
    items: ClusterBulkItem[];
    skipped: Array<Omit<ClusterBulkItem, 'revision'> & { reason: string }>;
}

export interface ClusterBulkResult {
    clusterId: string;
    outcome: 'succeeded' | 'skipped' | 'failed';
    message: string;
}

export interface ClusterBulkReportRow extends Omit<
    ClusterBulkResult,
    'outcome'
> {
    humanId: string;
    title: string;
    outcome: ClusterBulkResult['outcome'] | 'pending' | 'running' | 'canceled';
}

export type ClusterBulkJobStatus =
    'QUEUED' | 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'CANCELED';
export type ClusterBulkItemStatus =
    'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'SKIPPED' | 'FAILED' | 'CANCELED';
export type ClusterBulkCounts = Record<ClusterBulkItemStatus, number>;

export interface ClusterBulkJob {
    id: string;
    action: ClusterBulkAction;
    status: ClusterBulkJobStatus;
    total: number;
    counts: ClusterBulkCounts;
    currentTitle: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface ClusterBulkJobItem {
    id: string;
    clusterId: string;
    humanId: string;
    title: string;
    status: ClusterBulkItemStatus;
    reason: string | null;
}

export interface ClusterBulkJobList {
    jobs: ClusterBulkJob[];
    activeJob: ClusterBulkJob | null;
}

export interface ClusterBulkJobDetails {
    job: ClusterBulkJob;
    items: ClusterBulkJobItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface StartClusterBulkJobResponse {
    job: ClusterBulkJob;
    reused: boolean;
}
