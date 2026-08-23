import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../shared/lib/queryKeys';

import {
    saveContextDraft,
    type SaveContextDraftPayload,
} from '../api/saveContextDraft';

interface SaveContextDraftMutationInput {
    clusterId: string;
    payload: SaveContextDraftPayload;
}

export function useSaveContextDraftMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ clusterId, payload }: SaveContextDraftMutationInput) =>
            saveContextDraft(clusterId, payload),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.detail(variables.clusterId),
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.all,
            });

            queryClient.invalidateQueries({
                queryKey: queryKeys.clusters.blocks(variables.clusterId),
            });
        },
    });
}
