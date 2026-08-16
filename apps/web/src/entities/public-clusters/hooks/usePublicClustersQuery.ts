import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { getPublicClusters } from '../api/getPublicClusters';

interface UsePublicClustersQueryInput {
    page: number;
    limit: number;
}

export function usePublicClustersQuery({
    page,
    limit,
}: UsePublicClustersQueryInput) {
    return useQuery({
        queryKey: queryKeys.publicClusters.list({ page, limit }),
        queryFn: () => getPublicClusters({ page, limit }),
    });
}