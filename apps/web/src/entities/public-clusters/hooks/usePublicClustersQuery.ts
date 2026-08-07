import { useQuery } from '@tanstack/react-query';

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
        queryKey: ['public-clusters', page, limit],
        queryFn: () =>
            getPublicClusters({
                page,
                limit,
            }),
    });
}