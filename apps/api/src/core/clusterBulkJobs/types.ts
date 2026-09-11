import type { ClusterBulkItemStatus, ClusterBulkJob } from '@prisma/client';

export class ClusterBulkJobError extends Error {
    constructor(
        message: string,
        public readonly statusCode = 400,
    ) {
        super(message);
    }
}

export class ClusterBulkLeaseLost extends Error {
    constructor() {
        super('This worker no longer owns the cluster job item.');
    }
}

export type ClusterBulkJobSummary = Pick<
    ClusterBulkJob,
    'id' | 'action' | 'status' | 'total' | 'createdAt' | 'updatedAt'
> & {
    counts: Record<ClusterBulkItemStatus, number>;
    currentTitle: string | null;
};

export const CLUSTER_BULK_ACTIVE_KEY = 'editorial';
export const CLUSTER_BULK_LEASE_MS = 120000;
