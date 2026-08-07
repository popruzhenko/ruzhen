import { apiClient } from "../../../shared/api/client";
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
    articleId: string,
): Promise<ReviewArticleContentResponse> {
    return apiClient<ReviewArticleContentResponse>(
        `/articles/${articleId}/review-content`,
        {
            method: 'POST',
        },
    );
}