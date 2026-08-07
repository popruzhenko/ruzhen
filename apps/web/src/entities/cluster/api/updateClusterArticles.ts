import { apiClient } from "../../../shared/api/client";

export interface UpdateClusterArticlePayloadItem {
    articleId: string;
    confidence: number | null;
    isPrimary: boolean;
}

export interface UpdateClusterArticlesPayload {
    articles: UpdateClusterArticlePayloadItem[];
}

export interface UpdateClusterArticlesResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: string | null;
        status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
        publishedAt: string | null;
        createdAt: string;
        updatedAt: string;
    };
}

export async function updateClusterArticles(
    clusterId: string,
    payload: UpdateClusterArticlesPayload,
): Promise<UpdateClusterArticlesResponse> {
    return apiClient<UpdateClusterArticlesResponse>(
        `/admin/clusters/${clusterId}/articles`,
        {
            method: 'PATCH',
            body: JSON.stringify(payload),
        },
    );
}