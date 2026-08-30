import { apiClient } from '../../../shared/api/client';

import type { DeleteClusterCandidateResponse } from '../model/types';

export function deleteClusterCandidate(candidateId: string) {
    return apiClient<DeleteClusterCandidateResponse>(
        `/admin/cluster-candidates/${candidateId}`,
        {
            method: 'DELETE',
        },
    );
}
