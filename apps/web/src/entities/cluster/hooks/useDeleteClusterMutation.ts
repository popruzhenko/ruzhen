import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import { deleteCluster } from '../api/deleteCluster';

export function useDeleteClusterMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteCluster,
        onSuccess: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.articles.all,
            });
        },
    });
}