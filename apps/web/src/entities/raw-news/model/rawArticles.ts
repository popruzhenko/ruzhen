import type { ArticleStatus, ContentAvailability } from './articleConstants';
import type { ArticleApiItem } from './types';

export type RawArticleBulkAction = 'RECHECK' | 'APPROVE' | 'REJECT';
export type RawArticleEligibility = Record<RawArticleBulkAction, boolean>;

export interface RawArticlesFilters {
    search?: string;
    status?: ArticleStatus;
    contentAvailability?: ContentAvailability;
    sourceName?: string;
    fetchedFrom?: string;
    fetchedTo?: string;
    onlyProblematic?: boolean;
}

export type RawArticlesPageSize = 25 | 50 | 100;

export interface RawArticlesListPagination {
    page: number;
    limit: RawArticlesPageSize;
}

export interface RawArticlesPagination extends RawArticlesListPagination {
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface RawArticlesResponse {
    articles: (ArticleApiItem & {
        bulkEligibility: RawArticleEligibility;
        enrichmentEligible?: boolean;
    })[];
    total: number;
    totalAll: number;
    sourceNames: string[];
    eligibility: Record<RawArticleBulkAction, number>;
    enrichmentEligibleCount?: number;
    pagination: RawArticlesPagination;
}

export type RawArticleBulkScope =
    | { type: 'FILTERED'; filters: RawArticlesFilters }
    | { type: 'SELECTED'; ids: string[] };

export interface RawArticleBulkItem {
    id: string;
    title: string | null;
    updatedAt: string | null;
    eligible: boolean;
    reason?: string;
}

export interface RawArticleBulkPreview {
    action: RawArticleBulkAction;
    total: number;
    eligible: number;
    items: RawArticleBulkItem[];
}

export interface RawArticleBulkResult {
    id: string;
    title: string | null;
    outcome: 'UPDATED' | 'UNCHANGED' | 'SKIPPED' | 'ERROR';
    reason: string;
    status?: ArticleStatus;
    contentAvailability?: ContentAvailability | null;
}
