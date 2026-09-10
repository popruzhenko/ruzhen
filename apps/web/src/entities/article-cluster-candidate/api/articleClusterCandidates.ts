import { apiClient } from '../../../shared/api/client';

import type {
    AcceptArticleClusterCandidateResponse,
    ArticleClusterCandidatesParams,
    ArticleClusterCandidatesResponse,
    GenerateArticleClusterCandidatesResponse,
    RejectArticleClusterCandidateResponse,
} from '../model/types';

const endpoint = '/admin/article-cluster-candidates';

export function getArticleClusterCandidates(
    { page, limit }: ArticleClusterCandidatesParams,
    signal?: AbortSignal,
) {
    const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
    });
    return apiClient<ArticleClusterCandidatesResponse>(
        `${endpoint}?${params}`,
        { signal },
    );
}

export function generateArticleClusterCandidates() {
    return apiClient<GenerateArticleClusterCandidatesResponse>(
        `${endpoint}/generate`,
        {
            method: 'POST',
        },
    );
}

export function acceptArticleClusterCandidate(candidateId: string) {
    return apiClient<AcceptArticleClusterCandidateResponse>(
        `${endpoint}/${encodeURIComponent(candidateId)}/accept`,
        { method: 'POST' },
    );
}

export function rejectArticleClusterCandidate(candidateId: string) {
    return apiClient<RejectArticleClusterCandidateResponse>(
        `${endpoint}/${encodeURIComponent(candidateId)}/reject`,
        { method: 'POST' },
    );
}
