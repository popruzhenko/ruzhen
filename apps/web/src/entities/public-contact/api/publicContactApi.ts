import { apiClient } from "../../../shared/api/client";

export type ContactTopic = 'CORRECTIONS' | 'SOURCES' | 'PARTNERSHIPS' | 'OTHER';

export interface CreateContactMessagePayload {
    name: string | null;
    email: string;
    topic: ContactTopic;
    title: string;
    message: string;
}

export interface CreateContactMessageResponse {
    message: {
        id: string;
        topic: ContactTopic;
        title: string;
        createdAt: string;
    };
}

export function createContactMessageRequest(
    payload: CreateContactMessagePayload,
) {
    return apiClient<CreateContactMessageResponse>('/public/contact', {
        method: 'POST',
        json: payload,
    });
}