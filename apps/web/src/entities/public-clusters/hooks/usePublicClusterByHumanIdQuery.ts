import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { getPublicClusterByHumanId } from '../api/getPublicClusterByHumanId';

export function usePublicClusterByHumanIdQuery(humanId?: string) {
    return useQuery({
        queryKey: queryKeys.publicClusters.detail(humanId ?? ''),
        queryFn: () => {
            if (!humanId) {
                throw new Error('humanId is required');
            }

            return getPublicClusterByHumanId(humanId);
        },
        enabled: Boolean(humanId),
    });
}
