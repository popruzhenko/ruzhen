import { apiClient } from '../../../shared/api/client';
import type { ClusterDetailsApiItem } from '../model/types';

export async function getClusterById(
    clusterId: string,
): Promise<ClusterDetailsApiItem> {
    return apiClient<ClusterDetailsApiItem>(`/admin/clusters/${clusterId}`, {
        method: 'GET',
    });
}
