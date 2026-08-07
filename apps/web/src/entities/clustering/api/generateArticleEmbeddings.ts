
import { apiClient } from '../../../shared/api/client';

export interface GenerateArticleEmbeddingsResponse {
    message: string;
    embedded: number;
    skipped: number;
    failed: number;
    results: Array<unknown>;
}

export async function generateArticleEmbeddings(): Promise<GenerateArticleEmbeddingsResponse> {
    return apiClient<GenerateArticleEmbeddingsResponse>(
        '/admin/articles/generate-embeddings',
        {
            method: 'POST',
            
            json: {
                limit: 999,
            },
        },
    );
}