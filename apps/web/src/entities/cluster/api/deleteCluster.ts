import { apiClient } from '../../../shared/api/client';

export interface DeleteClusterResponse {
    message: string;
    cluster: {
        id: string;
    };
}

export async function deleteCluster(
    clusterId: string,
): Promise<DeleteClusterResponse> {
    return apiClient<DeleteClusterResponse>(`/admin/clusters/${clusterId}`, {
        method: 'DELETE',
    });
}