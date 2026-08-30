import { apiClient } from '../../../shared/api/client';

export type ContextBlockType = 'FACT' | 'CONTEXT' | 'OPINION';
export type OpinionStance = 'PRO' | 'CONTRA' | 'NEUTRAL';

export interface GeneratedClusterBlockApiItem {
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
}

export interface GenerateAnalyzedNewsResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: string | null;
        updatedAt: string;
    };
    blocks: GeneratedClusterBlockApiItem[];
}

export async function generateAnalyzedNews(
    clusterId: string,
): Promise<GenerateAnalyzedNewsResponse> {
    return apiClient<GenerateAnalyzedNewsResponse>(
        `/admin/clusters/${clusterId}/generate-analyzed-news`,
        {
            method: 'POST',
        },
    );
}
