import { apiClient } from '../../../shared/api/client';

import type { GetPublicClusterByHumanIdResponse } from '../model/types';

export async function getPublicClusterByHumanId(
    humanId: string,
): Promise<GetPublicClusterByHumanIdResponse> {
    return apiClient<GetPublicClusterByHumanIdResponse>(
        `/clusters/${humanId}`,
    );
}