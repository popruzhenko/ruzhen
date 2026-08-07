import { useQuery } from '@tanstack/react-query';

import { getPublicClusterByHumanId } from '../api/getPublicClusterByHumanId';

export function usePublicClusterByHumanIdQuery(humanId?: string) {
    return useQuery({
        queryKey: ['public-cluster', humanId],
        queryFn: () => {
            if (!humanId) {
                throw new Error('humanId is required');
            }

            return getPublicClusterByHumanId(humanId);
        },
        enabled: Boolean(humanId),
    });
}
