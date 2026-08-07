import { apiClient } from '../../../shared/api/client';
import type { GetClusterCandidatesResponse } from '../model/types';

export async function getClusterCandidates(
    clusterId: string,
): Promise<GetClusterCandidatesResponse> {
    return apiClient<GetClusterCandidatesResponse>(
        `/admin/clusters/${clusterId}/candidates`,
        {
            method: 'GET',
        },
    );
}
