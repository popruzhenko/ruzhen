import { apiClient } from '../../../shared/api/client';
import type {
    ClusterBulkAction,
    ClusterBulkItem,
    ClusterBulkPreview,
    ClusterBulkResult,
    ClusterBulkJob,
    ClusterBulkJobList,
    ClusterBulkJobDetails,
    StartClusterBulkJobResponse,
} from '../model/clusterBulk';

export function previewClusterBulk(
    action: ClusterBulkAction,
    signal?: AbortSignal,
) {
    return apiClient<ClusterBulkPreview>('/admin/clusters/bulk/preview', {
        method: 'POST',
        json: { action },
        signal,
    });
}

export function getClusterBulkJobs(
    action: ClusterBulkAction,
    signal?: AbortSignal,
) {
    return apiClient<ClusterBulkJobList>(
        `/admin/clusters/bulk/jobs?action=${action}`,
        { signal },
    );
}

export function getClusterBulkJob(
    jobId: string,
    page = 1,
    signal?: AbortSignal,
) {
    return apiClient<ClusterBulkJobDetails>(
        `/admin/clusters/bulk/jobs/${encodeURIComponent(jobId)}?page=${page}&limit=50`,
        { signal },
    );
}

export function startClusterBulkJob(
    action: ClusterBulkAction,
    requestId: string,
) {
    return apiClient<StartClusterBulkJobResponse>('/admin/clusters/bulk/jobs', {
        method: 'POST',
        json: { action, requestId },
    });
}

export function cancelClusterBulkJob(jobId: string) {
    return apiClient<{ job: ClusterBulkJob }>(
        `/admin/clusters/bulk/jobs/${encodeURIComponent(jobId)}/cancel`,
        { method: 'POST' },
    );
}

export function retryClusterBulkJob(jobId: string, requestId: string) {
    return apiClient<StartClusterBulkJobResponse>(
        `/admin/clusters/bulk/jobs/${encodeURIComponent(jobId)}/retry`,
        { method: 'POST', json: { requestId } },
    );
}

export function executeClusterBulk(
    action: ClusterBulkAction,
    item: ClusterBulkItem,
) {
    return apiClient<ClusterBulkResult>('/admin/clusters/bulk/execute', {
        method: 'POST',
        json: { action, item },
    });
}
