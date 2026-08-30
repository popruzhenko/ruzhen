import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import { acceptClusterCandidate } from '../api/acceptClusterCandidate';

export function useAcceptClusterCandidateMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: acceptClusterCandidate,
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: queryKeys.clusterCandidates.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: queryKeys.clusters.all,
                }),
            ]);
        },
    });
}
