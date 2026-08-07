import { apiClient } from '../../../shared/api/client';

import type { ContextBlockType, OpinionStance } from './generateAnalyzedNews';

export interface SaveContextDraftBlockPayload {
    type: ContextBlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: OpinionStance | null;
}

export interface SaveContextDraftPayload {
    title: string;
    summary: string;
    blocks: SaveContextDraftBlockPayload[];
}

export interface SaveContextDraftResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: string | null;
        status: string;
        updatedAt: string;
    };
    blocks: {
        id: string;
        clusterId: string;
        type: ContextBlockType;
        title: string | null;
        content: string;
        position: number;
        sourceName: string | null;
        sourceUrl: string | null;
        authorName: string | null;
        stance: OpinionStance | null;
        createdByUserId: string;
        createdAt: string;
        updatedAt: string;
    }[];
}

export async function saveContextDraft(
    clusterId: string,
    payload: SaveContextDraftPayload,
): Promise<SaveContextDraftResponse> {
    return apiClient<SaveContextDraftResponse>(
        `/admin/clusters/${clusterId}/context-draft`,
        {
            method: 'PATCH',
            body: JSON.stringify(payload),
        },
    );
}
