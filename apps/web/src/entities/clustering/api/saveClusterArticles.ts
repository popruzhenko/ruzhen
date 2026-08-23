import { apiClient } from '../../../shared/api/client';
import type { SaveClusterArticlesPayload } from '../model/types';

export async function saveClusterArticles(
    payload: SaveClusterArticlesPayload,
): Promise<void> {
    return apiClient<void>(`/admin/clusters/${payload.clusterId}/articles`, {
        method: 'PATCH',
        json: {
            articleIds: payload.articleIds,
        },
    });
}
