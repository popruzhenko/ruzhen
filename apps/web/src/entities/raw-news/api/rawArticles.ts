import { apiClient } from '../../../shared/api/client';
import type {
    RawArticleBulkAction,
    RawArticleBulkPreview,
    RawArticleBulkResult,
    RawArticleBulkScope,
    RawArticlesFilters,
    RawArticlesListPagination,
    RawArticlesResponse,
} from '../model/rawArticles';

export function getRawArticles(
    filters: RawArticlesFilters,
    signal?: AbortSignal,
    pagination: RawArticlesListPagination = { page: 1, limit: 50 },
) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value));
    });
    params.set('page', String(pagination.page));
    params.set('limit', String(pagination.limit));
    const query = params.toString();
    return apiClient<RawArticlesResponse>(
        `/admin/articles/raw${query ? `?${query}` : ''}`,
        { signal },
    );
}

export function previewRawArticleBulk(
    action: RawArticleBulkAction,
    scope: RawArticleBulkScope,
    signal?: AbortSignal,
) {
    return apiClient<RawArticleBulkPreview>('/admin/articles/bulk/preview', {
        method: 'POST',
        json: { action, scope },
        signal,
    });
}

export function executeRawArticleBulk(
    action: RawArticleBulkAction,
    items: { id: string; updatedAt: string }[],
) {
    return apiClient<{ results: RawArticleBulkResult[] }>(
        '/admin/articles/bulk',
        {
            method: 'POST',
            json: { action, items },
        },
    );
}
