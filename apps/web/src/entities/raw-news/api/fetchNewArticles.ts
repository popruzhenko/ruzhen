import { apiClient } from '../../../shared/api/client';

export interface FetchNewArticlesResponse {
    message: string;
    result: {
        parseResults: {
            success: boolean;
            sourceId: string;
            sourceName: string;
            fetchedItems: number;
            created: number;
            updated: number;
            skippedDuplicates: number;
            skippedInvalid: number;
            error?: string;
        }[];
        enrichResults: unknown;
    };
}

export async function fetchNewArticles(): Promise<FetchNewArticlesResponse> {
    return apiClient<FetchNewArticlesResponse>('/admin/articles/fetch-new', {
        method: 'POST',
    });
}
