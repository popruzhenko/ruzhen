import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import { retrieveCompleteArticleContent } from './retrieveCompleteArticleContent';
import {
    candidateDecision,
    persistEnrichmentCandidate,
    enrichmentArticleSelect,
    getEnrichmentEligibility,
    type EnrichmentRetriever,
} from '../../enrichmentJobs';

interface DirectEnrichmentOptions {
    expectedUpdatedAt?: Date;
    actorUserId?: string;
    retrieve?: EnrichmentRetriever;
}

export async function enrichArticleById(
    prisma: PrismaClient,
    articleId: string,
    options: DirectEnrichmentOptions = {},
) {
    const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: enrichmentArticleSelect,
    });
    if (!article)
        return { articleId, outcome: 'SKIPPED', reason: 'Article not found.' };
    if (
        options.expectedUpdatedAt &&
        article.updatedAt.getTime() !== options.expectedUpdatedAt.getTime()
    ) {
        return {
            articleId,
            outcome: 'SKIPPED',
            reason: 'Article changed after selection.',
        };
    }
    const eligibility = getEnrichmentEligibility(article);
    if (!eligibility.eligible)
        return { articleId, outcome: 'SKIPPED', reason: eligibility.reason };
    const retrieve =
        options.retrieve ??
        ((input, signal) => retrieveCompleteArticleContent(input, { signal }));
    const result = await retrieve({
        url: article.url,
        title: article.title,
        summary: article.summary,
        publishedAt: article.publishedAt,
        content: article.content,
    });
    return prisma.$transaction(async (tx) => {
        const current = await tx.article.findUnique({
            where: { id: articleId },
            select: enrichmentArticleSelect,
        });
        if (
            !current ||
            current.updatedAt.getTime() !== article.updatedAt.getTime() ||
            !getEnrichmentEligibility(current).eligible
        ) {
            return {
                articleId,
                outcome: 'SKIPPED',
                reason: 'Article changed while text was being retrieved.',
            };
        }
        if (!result.candidate)
            return {
                articleId,
                outcome: 'UNCHANGED',
                reason: result.reasons.join(', '),
            };
        const decision = candidateDecision(current, result.candidate);
        if (decision.type === 'UNCHANGED')
            return { articleId, outcome: 'UNCHANGED', reason: decision.reason };
        if (decision.type === 'PROPOSE') {
            return {
                articleId,
                outcome: 'PROPOSED',
                reason: 'Existing text was preserved. Use Enrich articles to review a replacement proposal.',
            };
        }
        const saved = await persistEnrichmentCandidate(tx, {
            article: current,
            candidate: decision.candidate,
            metadataOnly: decision.metadataOnly,
            actorUserId: options.actorUserId,
            now: new Date(),
        });
        return {
            articleId,
            outcome: saved.article.contentAvailability,
            article: saved.article,
        };
    });
}

// The CLI processes the complete starting selection by default. The existing
// Fetch workflow's explicit limit remains until its separate automation step.
export async function enrichLatestArticles(
    prisma: PrismaClient,
    limit?: number,
    options: Pick<DirectEnrichmentOptions, 'retrieve' | 'actorUserId'> = {},
) {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0)) {
        throw new Error('Enrichment limit must be a non-negative integer.');
    }
    if (limit === 0) return [];
    const articles = await prisma.$transaction(
        async (tx) => {
            const selected: Array<{ id: string; updatedAt: Date }> = [];
            let after: { id: string; createdAt: Date } | undefined;
            const batchSize = 250;
            while (limit === undefined || selected.length < limit) {
                const where: Prisma.ArticleWhereInput = {
                    status: {
                        notIn: [
                            ArticleStatus.REJECTED,
                            ArticleStatus.CLUSTERED,
                        ],
                    },
                    clusterLinks: { none: {} },
                    ...(after
                        ? {
                              OR: [
                                  { createdAt: { gt: after.createdAt } },
                                  {
                                      createdAt: after.createdAt,
                                      id: { gt: after.id },
                                  },
                              ],
                          }
                        : {}),
                };
                const batch = await tx.article.findMany({
                    where,
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    take: batchSize,
                    select: {
                        id: true,
                        createdAt: true,
                        updatedAt: true,
                        status: true,
                        content: true,
                        contentAssessment: true,
                        _count: { select: { clusterLinks: true } },
                    },
                });
                for (const article of batch) {
                    if (getEnrichmentEligibility(article).eligible) {
                        selected.push({
                            id: article.id,
                            updatedAt: article.updatedAt,
                        });
                        if (selected.length === limit) break;
                    }
                }
                if (batch.length < batchSize) break;
                const last = batch[batch.length - 1];
                after = { id: last.id, createdAt: last.createdAt };
            }
            return selected;
        },
        {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
            timeout: 30000,
        },
    );
    // Retrieval starts only after the entire ID/version selection is fixed.
    const results = [];
    for (const article of articles) {
        try {
            const result = await enrichArticleById(prisma, article.id, {
                ...options,
                expectedUpdatedAt: article.updatedAt,
            });
            results.push({ articleId: article.id, success: true, result });
        } catch (error) {
            results.push({
                articleId: article.id,
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Unknown enrichment error',
            });
        }
    }
    return results;
}
