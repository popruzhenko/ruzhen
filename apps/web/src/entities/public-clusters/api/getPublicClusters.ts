import { apiClient } from '../../../shared/api/client';

import type { GetPublicClustersResponse } from '../model/types';

interface GetPublicClustersParams {
    page: number;
    limit: number;
}

export async function getPublicClusters({
    page,
    limit,
}: GetPublicClustersParams): Promise<GetPublicClustersResponse> {
    const searchParams = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });

    return apiClient<GetPublicClustersResponse>(
        `/public/clusters?${searchParams.toString()}`,
    );
}
