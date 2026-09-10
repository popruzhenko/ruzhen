import { apiClient } from '../../../shared/api/client';

import type {
    GetPublicClustersParams,
    GetPublicClustersResponse,
} from '../model/types';

export async function getPublicClusters(
    params: GetPublicClustersParams,
    signal?: AbortSignal,
): Promise<GetPublicClustersResponse> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            searchParams.set(key, String(value));
        }
    }

    return apiClient<GetPublicClustersResponse>(
        `/public/clusters?${searchParams.toString()}`,
        { signal },
    );
}
