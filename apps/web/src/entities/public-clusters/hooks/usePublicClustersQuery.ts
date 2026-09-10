import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { getPublicClusters } from '../api/getPublicClusters';
import type { GetPublicClustersParams } from '../model/types';

export function usePublicClustersQuery(params: GetPublicClustersParams) {
    return useQuery({
        queryKey: queryKeys.publicClusters.list(params),
        queryFn: ({ signal }) => getPublicClusters(params, signal),
    });
}
