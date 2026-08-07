import { apiClient } from '../../../shared/api/client';

export interface CreateClusterFromArticlesPayload {
    articleIds: string[];
    title?: string;
    summary?: string | null;
    mainCountry?: string | null;
    startDate?: string | null;
}

export interface CreateClusterFromArticlesResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: string | null;
        status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
        createdByUserId: string;
        publishedAt: string | null;
        embedding: number[] | null;
        createdAt: string;
        updatedAt: string;
    };
}

export async function createClusterFromArticles(
    payload: CreateClusterFromArticlesPayload,
): Promise<CreateClusterFromArticlesResponse> {
    return apiClient<CreateClusterFromArticlesResponse>(
        '/admin/clusters/from-articles',
        {
            method: 'POST',
            json: payload,
        },
    );
}