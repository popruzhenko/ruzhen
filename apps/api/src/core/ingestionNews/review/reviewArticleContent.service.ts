import { Prisma, type PrismaClient } from '@prisma/client';
import { detectContentAvailability } from '../../normalize/article/detectContentAvailability';
import {
    getNextReviewStatus,
    getRawArticleActionEligibility,
} from '../../rawArticles/policy';
import {
    ArticleMutationError,
    parseExpectedUpdatedAt,
} from '../../articles/articleMutationError';

export async function reviewArticleContentById(
    prisma: PrismaClient,
    articleId: string,
    expectedVersion?: unknown,
) {
    const expectedUpdatedAt = parseExpectedUpdatedAt(expectedVersion);
    return prisma.$transaction(async (tx) => {
        const article = await tx.article.findUnique({
            where: { id: articleId },
            include: { _count: { select: { clusterLinks: true } } },
        });
        if (!article) throw new ArticleMutationError('Article not found.', 404);
        if (
            expectedUpdatedAt &&
            article.updatedAt.getTime() !== expectedUpdatedAt.getTime()
        ) {
            throw new ArticleMutationError(
                'Article changed. Reload it before reviewing.',
                409,
            );
        }
        const eligibility = getRawArticleActionEligibility(article, 'RECHECK');
        if (!eligibility.eligible) {
            throw new ArticleMutationError(
                eligibility.reason ?? 'Article cannot be rechecked.',
                409,
            );
        }
        const nextContentAvailability = detectContentAvailability(article);
        const nextStatus = getNextReviewStatus(article);
        const updated = await tx.article.updateMany({
            where: {
                id: article.id,
                updatedAt: article.updatedAt,
                status: article.status,
                clusterLinks: { none: {} },
            },
            data: {
                contentAvailability: nextContentAvailability,
                status: nextStatus,
                updatedAt: new Date(
                    Math.max(Date.now(), article.updatedAt.getTime() + 1),
                ),
                embedding: Prisma.DbNull,
                embeddingBasis: null,
                embeddingModel: null,
            },
        });
        if (updated.count !== 1) {
            throw new ArticleMutationError(
                'Article changed. Reload it before reviewing.',
                409,
            );
        }
        const updatedArticle = await tx.article.findUniqueOrThrow({
            where: { id: article.id },
            include: {
                source: true,
                raw: true,
                _count: {
                    select: { clusterLinks: true, clusterCandidateLinks: true },
                },
            },
        });
        return {
            article: updatedArticle,
            review: {
                previousStatus: article.status,
                nextStatus,
                previousContentAvailability: article.contentAvailability,
                nextContentAvailability,
            },
        };
    });
}
