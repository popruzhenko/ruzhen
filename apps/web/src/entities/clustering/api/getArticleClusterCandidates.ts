import { apiClient } from '../../../shared/api/client';
import type { GetArticleClusterCandidatesResponse } from '../model/types';

export async function getArticleClusterCandidates(
    clusterId: string,
): Promise<GetArticleClusterCandidatesResponse> {
    return apiClient<GetArticleClusterCandidatesResponse>(
        `/admin/clusters/${clusterId}/candidates`,
        {
            method: 'GET',
        },
    );
}
