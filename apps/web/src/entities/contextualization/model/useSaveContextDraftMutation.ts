import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveContextDraft, type SaveContextDraftPayload } from '../api/saveContextDraft';

interface SaveContextDraftMutationInput { clusterId: string; payload: SaveContextDraftPayload; }

export function useSaveContextDraftMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ clusterId, payload }: SaveContextDraftMutationInput) =>
            saveContextDraft(clusterId, payload),

        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['cluster', variables.clusterId],
            });

            queryClient.invalidateQueries({
                queryKey: ['clusters'],
            });

            queryClient.invalidateQueries({
                queryKey: ['cluster-blocks', variables.clusterId],
            });
        },
    });
}