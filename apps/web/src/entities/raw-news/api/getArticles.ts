import { apiClient } from "../../../shared/api/client";
import type { GetArticlesApiResponse } from "../model/types";

export async function getArticles(): Promise<GetArticlesApiResponse> {
    return apiClient<GetArticlesApiResponse>('/articles');
}