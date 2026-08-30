import { apiClient } from '../../../shared/api/client';

import type { GenerateClusterCandidatesResponse } from '../model/types';

export function generateClusterCandidates() {
    return apiClient<GenerateClusterCandidatesResponse>(
        '/admin/cluster-candidates/generate',
        {
            method: 'POST',
        },
    );
}
