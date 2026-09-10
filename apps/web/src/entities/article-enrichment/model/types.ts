import type { RawArticleBulkScope } from '../../raw-news/model/rawArticles';
import type {
    ArticleStatus,
    ContentAvailability,
} from '../../raw-news/model/articleConstants';

export type EnrichmentJobStatus =
    'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELED';
export type EnrichmentItemStatus =
    | 'PENDING'
    | 'RUNNING'
    | 'FULL_TEXT'
    | 'PARTIAL_TEXT'
    | 'PROPOSED'
    | 'UNCHANGED'
    | 'SKIPPED'
    | 'ERROR'
    | 'CANCELED';
export type EnrichmentProposalStatus = 'PENDING' | 'APPLIED' | 'DISMISSED';

export interface ArticleContentAssessment {
    version: number;
    textHash: string;
    fullText: boolean;
    method: 'READABILITY' | 'JSON_LD' | 'EXISTING' | 'MANUAL';
    sourceUrl?: string | null;
    sourceDate?: string | null;
    qualityScore?: number;
    reasons: string[];
    signals?: Record<string, unknown>;
}

export interface ArticleContentProvenance {
    origin: 'INGESTION' | 'ENRICHMENT' | 'MANUAL' | 'UNKNOWN';
    textHash: string;
    sourceUrl?: string | null;
    sourceDate?: string | null;
    retrievedUrl?: string | null;
    recordedAt?: string | null;
    method?: string;
    retrieval?: ArticleContentRetrieval;
}

export type ArticleRetrievalProvider =
    'PUBLISHER_HTTP' | 'PUBLISHER_BROWSER' | 'ARCHIVE_TODAY';
export type ArticleRetrievalOutcome =
    'FULL_TEXT' | 'PARTIAL_TEXT' | 'NO_CONTENT' | 'ERROR' | 'SKIPPED';

export interface ArticleContentRetrieval {
    provider: ArticleRetrievalProvider;
    originalUrl: string;
    retrievedUrl: string;
    retrievedAt: string;
    archiveCapturedAt: string | null;
    attempts: {
        provider: ArticleRetrievalProvider;
        outcome: ArticleRetrievalOutcome;
        url: string;
        reasons: string[];
    }[];
}

export interface EnrichmentArticleSnapshot {
    id?: string;
    title: string | null;
    summary: string | null;
    content: string | null;
    cleanedAccessibleText: string | null;
    imageUrl?: string | null;
    cleaningMethod?: string | null;
    contentAvailability: ContentAvailability | null;
    status?: ArticleStatus;
    updatedAt?: string;
    _count?: { clusterLinks: number };
    contentAssessment?: ArticleContentAssessment | null;
    contentProvenance?: ArticleContentProvenance | null;
}

export interface EnrichmentJob {
    id: string;
    status: EnrichmentJobStatus;
    total: number;
    counts: Record<EnrichmentItemStatus, number>;
    createdAt: string;
    updatedAt: string;
}

export interface EnrichmentItem {
    id: string;
    articleId: string;
    title: string | null;
    status: EnrichmentItemStatus;
    reason: string | null;
    attempts: number;
    expectedArticleUpdatedAt: string | null;
    proposalStatus: EnrichmentProposalStatus | null;
    hasProposal: boolean;
}

export interface EnrichmentJobDetail {
    job: EnrichmentJob;
    items: EnrichmentItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface EnrichmentProposalResponse {
    item: EnrichmentItem;
    currentArticle: EnrichmentArticleSnapshot | null;
    proposal: {
        content: string;
        summary: string | null;
        imageUrl: string | null;
        sourceUrl: string;
        method: 'READABILITY' | 'JSON_LD';
        assessment: ArticleContentAssessment;
        retrieval?: ArticleContentRetrieval;
    };
}

export interface ArticleContentVersion {
    id: string;
    articleId: string;
    createdAt: string;
    reason: string;
    before: EnrichmentArticleSnapshot;
    after: EnrichmentArticleSnapshot;
    afterArticleUpdatedAt: string;
    actorUserId?: string | null;
    jobItemId?: string | null;
    restoredFromVersionId?: string | null;
}

export interface EnrichmentVersionsResponse {
    currentArticle: EnrichmentArticleSnapshot | null;
    versions: ArticleContentVersion[];
}

export interface StartEnrichmentInput {
    scope: RawArticleBulkScope;
    requestId: string;
}

export const isEnrichmentJobActive = (job?: EnrichmentJob) =>
    job?.status === 'QUEUED' || job?.status === 'RUNNING';
