import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import { deleteClusterCandidate } from '../api/deleteClusterCandidate';

export function useDeleteClusterCandidateMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteClusterCandidate,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: queryKeys.clusterCandidates.all,
            });
        },
    });
}
