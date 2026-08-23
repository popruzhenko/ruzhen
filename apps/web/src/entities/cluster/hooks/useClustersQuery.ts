import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { getClusters } from '../api/getClusters';

import type { GetClustersApiResponse, GetClustersParams } from '../model/types';

export function useClustersQuery(params: GetClustersParams = {}) {
    return useQuery<GetClustersApiResponse>({
        queryKey: queryKeys.clusters.list(params),
        queryFn: () => getClusters(params),
    });
}