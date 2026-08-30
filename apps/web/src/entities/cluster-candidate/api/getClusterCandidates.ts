import { apiClient } from '../../../shared/api/client';

import type { ClusterCandidatesResponse } from '../model/types';

export function getClusterCandidates() {
    return apiClient<ClusterCandidatesResponse>('/admin/cluster-candidates');
}
