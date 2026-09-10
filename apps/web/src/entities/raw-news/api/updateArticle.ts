import { apiClient } from '../../../shared/api/client';
import type { ArticleStatus } from '../model/articleConstants';
import type { ArticleApiItem } from '../model/types';

export interface UpdateArticlePayload {
    id: string;
    expectedUpdatedAt?: string;
    confirmFullText?: boolean;
    title?: string;
    summary?: string;
    content?: string;
    preview?: string;
    cleanedAccessibleText?: string;
    status?: ArticleStatus;
}

export async function updateArticle(
    payload: UpdateArticlePayload,
): Promise<ArticleApiItem> {
    return apiClient<ArticleApiItem>(
        `/articles/${encodeURIComponent(payload.id)}`,
        {
            method: 'PATCH',
            json: {
                expectedUpdatedAt: payload.expectedUpdatedAt,
                confirmFullText: payload.confirmFullText,
                title: payload.title,
                summary: payload.summary,
                content: payload.content,
                preview: payload.preview,
                cleanedAccessibleText: payload.cleanedAccessibleText,
                status: payload.status,
            },
        },
    );
}
