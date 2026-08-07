import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCluster } from '../api/createCluster';

export function useCreateClusterMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createCluster,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });
        },
    });
}
