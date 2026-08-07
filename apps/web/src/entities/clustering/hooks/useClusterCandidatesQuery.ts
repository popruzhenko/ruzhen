import { useQuery } from '@tanstack/react-query';
import { getClusterCandidates } from '../api/getClusterCandidates';

export function useClusterCandidatesQuery(clusterId?: string | null) {
    return useQuery({
        queryKey: ['cluster-candidates', clusterId],
        queryFn: () => getClusterCandidates(clusterId as string),
        enabled: Boolean(clusterId),
    });
}