import { useQuery } from '@tanstack/react-query';

import { getClusters } from '../api/getClusters';

import type {
    GetClustersApiResponse,
    GetClustersParams,
} from '../model/types';

export function useClustersQuery(params: GetClustersParams = {}) {
    return useQuery<GetClustersApiResponse>({
        queryKey: ['clusters', params],
        queryFn: () => getClusters(params),
    });
}