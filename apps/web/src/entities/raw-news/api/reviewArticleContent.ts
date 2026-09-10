import { apiClient } from '../../../shared/api/client';
import type { ArticleApiItem } from '../model/types';

interface ReviewArticleContentResponse {
    article: ArticleApiItem;
    review: {
        previousStatus: string;
        nextStatus: string;
        previousContentAvailability: string | null;
        nextContentAvailability: string | null;
    };
}

export async function reviewArticleContent(
    input: string | { id: string; expectedUpdatedAt?: string },
): Promise<ReviewArticleContentResponse> {
    const { id, expectedUpdatedAt } =
        typeof input === 'string'
            ? { id: input, expectedUpdatedAt: undefined }
            : input;
    return apiClient<ReviewArticleContentResponse>(
        `/articles/${encodeURIComponent(id)}/review-content`,
        {
            method: 'POST',
            json: { expectedUpdatedAt },
        },
    );
}
