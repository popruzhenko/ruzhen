import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteCluster } from '../api/deleteCluster';

export function useDeleteClusterMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteCluster,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster'],
            });

            queryClient.invalidateQueries({
                queryKey: ['articles'],
            });
        },
    });
}