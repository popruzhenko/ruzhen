import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import { getArticleClusterCandidates } from '../api/getArticleClusterCandidates';

export function useArticleClusterCandidatesQuery(clusterId?: string | null) {
    return useQuery({
        queryKey: queryKeys.clusters.candidates(clusterId ?? null),
        queryFn: () => {
            if (!clusterId) {
                throw new Error('Cluster id is required');
            }

            return getArticleClusterCandidates(clusterId);
        },
        enabled: Boolean(clusterId),
    });
}
