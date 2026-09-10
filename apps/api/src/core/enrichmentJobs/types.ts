import { ArticleStatus, Prisma } from '@prisma/client';
import { isCurrentFullTextAssessment } from '../ingestionNews/enrich/articleContentQuality';
import type { RawArticlesPreviewInput } from '../rawArticles';
import type {
    RetrievedArticleContent,
    retrieveArticleContent,
} from '../ingestionNews/enrich/retrieveArticleContent';

export type EnrichmentScope = RawArticlesPreviewInput['scope'];
export type EnrichmentRetriever = (
    input: Parameters<typeof retrieveArticleContent>[0],
    signal?: AbortSignal,
) => ReturnType<typeof retrieveArticleContent>;
export type EnrichmentCandidate = RetrievedArticleContent;
export const enrichmentArticleSelect = {
    id: true,
    sourceId: true,
    url: true,
    title: true,
    summary: true,
    content: true,
    cleanedAccessibleText: true,
    imageUrl: true,
    publishedAt: true,
    status: true,
    contentAvailability: true,
    cleaningMethod: true,
    contentProvenance: true,
    contentAssessment: true,
    createdAt: true,
    updatedAt: true,
    _count: { select: { clusterLinks: true } },
} satisfies Prisma.ArticleSelect;
export type EnrichmentArticle = Prisma.ArticleGetPayload<{
    select: typeof enrichmentArticleSelect;
}>;
export type EnrichmentClock = () => Date;

export class EnrichmentError extends Error {
    constructor(
        message: string,
        public readonly statusCode = 400,
    ) {
        super(message);
    }
}

export function getEnrichmentEligibility(article: {
    status: ArticleStatus;
    content?: string | null;
    contentAssessment?: unknown;
    _count: { clusterLinks: number };
}): { eligible: boolean; reason?: string } {
    if (article.status === ArticleStatus.REJECTED)
        return { eligible: false, reason: 'Rejected articles are excluded.' };
    if (
        article.status === ArticleStatus.CLUSTERED ||
        article._count.clusterLinks > 0
    ) {
        return {
            eligible: false,
            reason: 'Articles linked to clusters are excluded.',
        };
    }
    if (
        isCurrentFullTextAssessment(
            article.content ?? '',
            article.contentAssessment,
        )
    ) {
        return {
            eligible: false,
            reason: 'Article already has verified full text.',
        };
    }
    return { eligible: true };
}

export function nextArticleTimestamp(previous: Date, now: Date): Date {
    return new Date(Math.max(now.getTime(), previous.getTime() + 1));
}
