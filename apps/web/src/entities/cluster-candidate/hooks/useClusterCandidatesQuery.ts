import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import { getClusterCandidates } from '../api/getClusterCandidates';

export function useClusterCandidatesQuery() {
    return useQuery({
        queryKey: queryKeys.clusterCandidates.list(),
        queryFn: getClusterCandidates,
    });
}
