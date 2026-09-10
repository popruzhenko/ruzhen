import { ArticleStatus, ContentAvailability } from '@prisma/client';
import { detectContentAvailability } from '../normalize/article/detectContentAvailability';
import type { RawArticleAction } from './validation';

export interface RawArticleText {
    title: string | null;
    summary: string | null;
    content: string | null;
    cleanedAccessibleText: string | null;
    contentAssessment?: unknown;
}

export interface RawArticleReadiness extends RawArticleText {
    url: string | null;
    sourceId: string | null;
}

export interface RawArticleEligibilityInput extends RawArticleReadiness {
    status: ArticleStatus;
    _count: { clusterLinks: number };
}

// Keep the existing review rules; completeness changes belong to enrichment.
export function getNextReviewStatus(input: RawArticleText): ArticleStatus {
    const title = input.title?.trim() ?? '';
    const summary = input.summary?.trim() ?? '';
    const content = input.content?.trim() ?? '';
    const cleaned = input.cleanedAccessibleText?.trim() ?? '';
    return title.length >= 10 &&
        summary.length >= 40 &&
        (cleaned.length >= 80 || content.length >= 120 || summary.length >= 80)
        ? ArticleStatus.REVIEWED
        : ArticleStatus.NEEDS_REVIEW;
}

export function getRawArticleApprovalErrors(
    input: RawArticleReadiness,
): string[] {
    const errors: string[] = [];
    if (!input.title?.trim()) errors.push('Title is required before approval.');
    if (!input.summary?.trim())
        errors.push('Summary is required before approval.');
    if (!input.sourceId?.trim())
        errors.push('Source is required before approval.');
    try {
        const url = new URL(input.url?.trim() ?? '');
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new Error();
    } catch {
        errors.push('A valid HTTP(S) article URL is required before approval.');
    }
    if (detectContentAvailability(input) !== ContentAvailability.FULL_TEXT) {
        errors.push('Article must have FULL_TEXT content before approval.');
    }
    return errors;
}

export function getRawArticleActionEligibility(
    article: RawArticleEligibilityInput,
    action: RawArticleAction,
): { eligible: boolean; reason?: string } {
    if (
        article.status === ArticleStatus.CLUSTERED ||
        article._count.clusterLinks > 0
    ) {
        return {
            eligible: false,
            reason: 'Articles linked to clusters cannot be changed by this action.',
        };
    }
    if (action === 'RECHECK') {
        return (
            [
                ArticleStatus.NEW,
                ArticleStatus.NEEDS_REVIEW,
                ArticleStatus.REVIEWED,
            ] as ArticleStatus[]
        ).includes(article.status)
            ? { eligible: true }
            : {
                  eligible: false,
                  reason: 'Only new articles and articles under review can be rechecked.',
              };
    }
    if (action === 'APPROVE') {
        if (article.status !== ArticleStatus.REVIEWED) {
            return {
                eligible: false,
                reason: 'Only reviewed articles can be approved.',
            };
        }
        const errors = getRawArticleApprovalErrors(article);
        return errors.length
            ? { eligible: false, reason: errors.join(' ') }
            : { eligible: true };
    }
    if (article.status === ArticleStatus.REJECTED) {
        return { eligible: false, reason: 'Article is already rejected.' };
    }
    return { eligible: true };
}
