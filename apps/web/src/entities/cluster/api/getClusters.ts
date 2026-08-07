import { apiClient } from '../../../shared/api/client';

import type {
    GetClustersApiResponse,
    GetClustersParams,
} from '../model/types';

export async function getClusters(
    params: GetClustersParams = {},
): Promise<GetClustersApiResponse> {
    const searchParams = new URLSearchParams();

    if (params.page) {
        searchParams.set('page', String(params.page));
    }

    if (params.limit) {
        searchParams.set('limit', String(params.limit));
    }

    const query = searchParams.toString();

    return apiClient<GetClustersApiResponse>(
        `/admin/clusters${query ? `?${query}` : ''}`,
    );
}