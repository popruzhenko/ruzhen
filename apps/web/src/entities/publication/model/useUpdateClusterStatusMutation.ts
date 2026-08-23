import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import {
    updateClusterStatus,
    type PublicationClusterStatus,
    type UpdateClusterStatusResponse,
} from '../api/updateClusterStatus';

interface UpdateClusterStatusMutationInput {
    clusterId: string;
    status: PublicationClusterStatus;
}

export function useUpdateClusterStatusMutation() {
    const queryClient = useQueryClient();

    return useMutation<UpdateClusterStatusResponse, Error, UpdateClusterStatusMutationInput>({
        mutationFn: ({ clusterId, status }) => updateClusterStatus(clusterId, status),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.detail(variables.clusterId),
            });
        },
    });
}