import { apiClient } from '../../../shared/api/client';
import type { EnrichmentJobStatus } from '../../article-enrichment/model/types';

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
        enrichment: {
            jobId: string | null;
            total: number;
            status: EnrichmentJobStatus | null;
        };
    };
}

export async function fetchNewArticles(): Promise<FetchNewArticlesResponse> {
    return apiClient<FetchNewArticlesResponse>('/admin/articles/fetch-new', {
        method: 'POST',
    });
}
