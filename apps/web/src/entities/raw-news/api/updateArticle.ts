import { apiClient } from '../../../shared/api/client';
import type { ArticleApiItem } from '../model/types';

export interface UpdateArticlePayload {
    id: string;
    title?: string;
    summary?: string;
    content?: string;
    preview?: string;
    cleanedAccessibleText?: string;
    status?:
        | 'NEW'
        | 'NEEDS_REVIEW'
        | 'REVIEWED'
        | 'EMBEDDED'
        | 'CLUSTERED'
        | 'APPROVED'
        | 'REJECTED';
}

export async function updateArticle(
    payload: UpdateArticlePayload,
): Promise<ArticleApiItem> {
    return apiClient<ArticleApiItem>(`/articles/${payload.id}`, {
        method: 'PATCH',
        json: {
            title: payload.title,
            summary: payload.summary,
            content: payload.content,
            preview: payload.preview,
            cleanedAccessibleText: payload.cleanedAccessibleText,
            status: payload.status,
        },
    });
}
