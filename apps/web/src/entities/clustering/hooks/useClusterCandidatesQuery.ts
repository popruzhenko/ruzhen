import { useQuery } from '@tanstack/react-query';
import { getClusterCandidates } from '../api/getClusterCandidates';
import { queryKeys } from '../../../shared/lib/queryKeys';

export function useClusterCandidatesQuery(clusterId?: string | null) {
    return useQuery({
        queryKey: queryKeys.clusters.candidates(clusterId as string),
        queryFn: () => {
            if (!clusterId) {
                throw new Error('Cluster id is required');
            }

            return getClusterCandidates(clusterId);
        },
        enabled: Boolean(clusterId),
    });
}
