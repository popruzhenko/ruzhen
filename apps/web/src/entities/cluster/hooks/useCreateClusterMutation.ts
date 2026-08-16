import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCluster } from '../api/createCluster';
import { queryKeys } from '../../../shared/lib/queryKeys';

export function useCreateClusterMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCluster,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });
        },
    });
}
