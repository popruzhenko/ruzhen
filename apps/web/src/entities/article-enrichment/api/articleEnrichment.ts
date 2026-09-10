import { apiClient } from '../../../shared/api/client';
import type {
    ArticleContentVersion,
    EnrichmentArticleSnapshot,
    EnrichmentItem,
    EnrichmentJob,
    EnrichmentJobDetail,
    EnrichmentProposalResponse,
    EnrichmentVersionsResponse,
    StartEnrichmentInput,
} from '../model/types';

const base = '/admin/articles/enrichment';
const encoded = encodeURIComponent;

export const getEnrichmentJobs = (signal?: AbortSignal) =>
    apiClient<{ jobs: EnrichmentJob[] }>(`${base}/jobs`, { signal });
export const getEnrichmentJob = (
    id: string,
    page: number,
    signal?: AbortSignal,
) =>
    apiClient<EnrichmentJobDetail>(
        `${base}/jobs/${encoded(id)}?page=${page}&limit=50`,
        { signal },
    );
export const startEnrichment = (input: StartEnrichmentInput) =>
    apiClient<{ job: EnrichmentJob }>(`${base}/jobs`, {
        method: 'POST',
        json: input,
    });
export const stopEnrichment = (id: string) =>
    apiClient<{ job: EnrichmentJob }>(`${base}/jobs/${encoded(id)}/stop`, {
        method: 'POST',
    });
export const retryEnrichmentErrors = (id: string) =>
    apiClient<{ job: EnrichmentJob }>(
        `${base}/jobs/${encoded(id)}/retry-errors`,
        { method: 'POST' },
    );
export const getEnrichmentProposal = (id: string, signal?: AbortSignal) =>
    apiClient<EnrichmentProposalResponse>(
        `${base}/items/${encoded(id)}/proposal`,
        { signal },
    );
export const applyEnrichmentProposal = ({
    id,
    expectedUpdatedAt,
}: {
    id: string;
    expectedUpdatedAt: string;
}) =>
    apiClient<{
        article: EnrichmentArticleSnapshot;
        version: ArticleContentVersion;
    }>(`${base}/items/${encoded(id)}/apply`, {
        method: 'POST',
        json: { expectedUpdatedAt },
    });
export const dismissEnrichmentProposal = (id: string) =>
    apiClient<{ item: EnrichmentItem }>(
        `${base}/items/${encoded(id)}/dismiss`,
        { method: 'POST' },
    );
export const getArticleContentVersions = (id: string, signal?: AbortSignal) =>
    apiClient<EnrichmentVersionsResponse>(
        `${base}/articles/${encoded(id)}/versions`,
        { signal },
    );
export const restoreArticleContentVersion = ({
    id,
    expectedUpdatedAt,
}: {
    id: string;
    expectedUpdatedAt: string;
}) =>
    apiClient<{
        article: EnrichmentArticleSnapshot;
        version: ArticleContentVersion;
    }>(`${base}/versions/${encoded(id)}/restore`, {
        method: 'POST',
        json: { expectedUpdatedAt },
    });
