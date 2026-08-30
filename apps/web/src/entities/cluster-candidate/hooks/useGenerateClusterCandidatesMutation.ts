import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';
import { generateClusterCandidates } from '../api/generateClusterCandidates';

export function useGenerateClusterCandidatesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: generateClusterCandidates,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: queryKeys.clusterCandidates.all,
            });
        },
    });
}
