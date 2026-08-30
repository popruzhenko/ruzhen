import { apiClient } from '../../../shared/api/client';

import type { AcceptClusterCandidateResponse } from '../model/types';

export function acceptClusterCandidate(candidateId: string) {
    return apiClient<AcceptClusterCandidateResponse>(
        `/admin/cluster-candidates/${candidateId}/accept`,
        {
            method: 'POST',
        },
    );
}
