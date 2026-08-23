import { apiClient } from '../../../shared/api/client';
import type { ClusterStatus } from '../../cluster/model/clusterConstants';

export type PublicationClusterStatus = ClusterStatus;

export interface UpdateClusterStatusResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        status: ClusterStatus;
        mainCountry: string | null;
        startDate: string | null;
        publishedAt: string | null;
        updatedAt: string;
        createdAt: string;
        _count?: {
            articleLinks?: number;
            blocks?: number;
        };
    };
}

export async function updateClusterStatus(
    clusterId: string,
    status: PublicationClusterStatus,
): Promise<UpdateClusterStatusResponse> {
    return apiClient<UpdateClusterStatusResponse>(
        `/admin/clusters/${clusterId}/status`,
        {
            method: 'PATCH',
            body: JSON.stringify({
                status,
            }),
        },
    );
}
