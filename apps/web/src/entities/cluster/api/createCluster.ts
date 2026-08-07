import { apiClient } from '../../../shared/api/client';

export interface CreateClusterPayload {
    title: string;
    summary?: string | null;
    mainCountry?: string | null;
    startDate?: string | null;
}

export interface CreateClusterResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: string | null;
        status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
        createdByUserId: string;
        publishedAt: string | null;
        updatedAt: string;
    };
}

export async function createCluster(
    payload: CreateClusterPayload,
): Promise<CreateClusterResponse> {
    return apiClient<CreateClusterResponse>('/admin/clusters', {
        method: 'POST',
        json: payload,
    });
}
