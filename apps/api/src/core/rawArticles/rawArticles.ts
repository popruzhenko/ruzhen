import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import { detectContentAvailability } from '../normalize/article/detectContentAvailability';
import { buildRawArticleFilterSql, buildRawArticlePageSql } from './filters';
import { getRawArticleListSummary } from './listSummary';
import { getNextReviewStatus, getRawArticleActionEligibility } from './policy';
import { isCurrentFullTextAssessment } from '../ingestionNews/enrich/articleContentQuality';
import {
    parseRawArticlePagination,
    type RawArticleAction,
    type RawArticleFilters,
    type RawArticlesBatchInput,
    type RawArticlesPreviewInput,
} from './validation';

const articleSelect = {
    id: true,
    sourceId: true,
    url: true,
    title: true,
    summary: true,
    content: true,
    cleanedAccessibleText: true,
    imageUrl: true,
    publishedAt: true,
    language: true,
    country: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    contentAvailability: true,
    contentAssessment: true,
    contentProvenance: true,
    cleaningMethod: true,
    embeddingBasis: true,
    embedding: true,
    embeddingModel: true,
    source: { select: { id: true, name: true, baseUrl: true } },
    raw: { select: { id: true, fetchedAt: true, parserVersion: true } },
    _count: {
        select: {
            clusterLinks: true,
            articleClusterCandidates: true,
            clusterCandidateLinks: true,
        },
    },
} satisfies Prisma.ArticleSelect;

type RawArticle = Prisma.ArticleGetPayload<{ select: typeof articleSelect }>;

async function matchingArticles(
    tx: Prisma.TransactionClient,
    filters: RawArticleFilters,
    selectedIds?: string[],
) {
    const matches = await tx.$queryRaw<Array<{ id: string }>>(
        buildRawArticleFilterSql(filters, selectedIds),
    );
    const articles: RawArticle[] = [];
    // Keep the complete scope while bounding the number of SQL parameters.
    // Both queries use the same order and repeatable-read snapshot.
    for (let offset = 0; offset < matches.length; offset += 5000) {
        articles.push(
            ...(await tx.article.findMany({
                where: {
                    id: {
                        in: matches
                            .slice(offset, offset + 5000)
                            .map(({ id }) => id),
                    },
                },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                select: articleSelect,
            })),
        );
    }
    return articles;
}

function bulkEligibility(article: RawArticle) {
    return {
        RECHECK: getRawArticleActionEligibility(article, 'RECHECK').eligible,
        APPROVE: getRawArticleActionEligibility(article, 'APPROVE').eligible,
        REJECT: getRawArticleActionEligibility(article, 'REJECT').eligible,
    };
}

export async function listRawArticles({
    prisma,
    filters,
    page = 1,
    limit = 50,
}: {
    prisma: PrismaClient;
    filters: RawArticleFilters;
    page?: number;
    limit?: number;
}) {
    const requested = parseRawArticlePagination({ page, limit });
    return prisma.$transaction(
        async (tx) => {
            const summary = await getRawArticleListSummary(tx, filters);
            const totalPages = Math.max(
                1,
                Math.ceil(summary.total / requested.limit),
            );
            const currentPage = Math.min(requested.page, totalPages);
            const matches = summary.total
                ? await tx.$queryRaw<Array<{ id: string }>>(
                      buildRawArticlePageSql(
                          filters,
                          requested.limit,
                          (currentPage - 1) * requested.limit,
                      ),
                  )
                : [];
            const matched = matches.length
                ? await tx.article.findMany({
                      where: { id: { in: matches.map(({ id }) => id) } },
                      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                      select: articleSelect,
                  })
                : [];
            const totalAll = await tx.article.count();
            const sources = await tx.source.findMany({
                where: { articles: { some: {} } },
                select: { name: true },
                distinct: ['name'],
                orderBy: { name: 'asc' },
            });
            const articles = matched.map((article) => {
                const allowed = bulkEligibility(article);
                const fullTextVerified = isCurrentFullTextAssessment(
                    article.content ?? '',
                    article.contentAssessment,
                );
                const enrichmentEligible =
                    article.status !== ArticleStatus.REJECTED &&
                    article.status !== ArticleStatus.CLUSTERED &&
                    article._count.clusterLinks === 0 &&
                    !fullTextVerified;
                return {
                    ...article,
                    bulkEligibility: allowed,
                    enrichmentEligible,
                    fullTextVerified,
                };
            });
            return {
                articles,
                ...summary,
                totalAll,
                sourceNames: sources
                    .map(({ name }) => name)
                    .filter((name) => name.trim()),
                pagination: {
                    page: currentPage,
                    limit: requested.limit,
                    total: summary.total,
                    totalPages,
                    hasNextPage: currentPage < totalPages,
                    hasPreviousPage: currentPage > 1,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export interface RawArticlePreviewItem {
    id: string;
    title: string;
    updatedAt: string | null;
    eligible: boolean;
    reason?: string;
}

export async function previewRawArticles({
    prisma,
    input,
}: {
    prisma: PrismaClient;
    input: RawArticlesPreviewInput;
}) {
    return prisma.$transaction(
        async (tx) => {
            const articles = await matchingArticles(
                tx,
                input.scope.type === 'FILTERED'
                    ? input.scope.filters
                    : { onlyProblematic: false },
                input.scope.type === 'SELECTED' ? input.scope.ids : undefined,
            );
            const existingItems = articles.map((article) => ({
                id: article.id,
                title: article.title,
                updatedAt: article.updatedAt.toISOString(),
                ...getRawArticleActionEligibility(article, input.action),
            }));
            const byId = new Map(existingItems.map((item) => [item.id, item]));
            const items: RawArticlePreviewItem[] =
                input.scope.type === 'SELECTED'
                    ? input.scope.ids.map(
                          (id) =>
                              byId.get(id) ?? {
                                  id,
                                  title: id,
                                  updatedAt: null,
                                  eligible: false,
                                  reason: 'Article no longer exists.',
                              },
                      )
                    : existingItems;
            return {
                action: input.action,
                total: items.length,
                eligible: items.filter((item) => item.eligible).length,
                items,
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export interface RawArticleBatchResult {
    id: string;
    title: string;
    outcome: 'UPDATED' | 'UNCHANGED' | 'SKIPPED' | 'ERROR';
    reason: string;
    status?: ArticleStatus;
    contentAvailability?: RawArticle['contentAvailability'];
}

async function applyAction(
    tx: Prisma.TransactionClient,
    article: RawArticle,
    action: RawArticleAction,
    updatedAt: Date,
): Promise<RawArticleBatchResult> {
    const previous = {
        id: article.id,
        title: article.title,
        status: article.status,
        contentAvailability: article.contentAvailability,
    };
    if (article.updatedAt.getTime() !== updatedAt.getTime()) {
        return {
            ...previous,
            outcome: 'SKIPPED',
            reason: 'Article changed after preview. Refresh the selection and try again.',
        };
    }
    const eligibility = getRawArticleActionEligibility(article, action);
    if (!eligibility.eligible) {
        return { ...previous, outcome: 'SKIPPED', reason: eligibility.reason! };
    }
    const status =
        action === 'RECHECK'
            ? getNextReviewStatus(article)
            : action === 'APPROVE'
              ? ArticleStatus.APPROVED
              : ArticleStatus.REJECTED;
    const contentAvailability =
        action === 'REJECT'
            ? article.contentAvailability
            : detectContentAvailability(article);
    const hasEmbedding =
        article.embedding !== null ||
        article.embeddingModel !== null ||
        article.embeddingBasis !== null;
    if (
        status === article.status &&
        contentAvailability === article.contentAvailability &&
        !hasEmbedding
    ) {
        return {
            ...previous,
            outcome: 'UNCHANGED',
            reason: 'Article already has this review result.',
        };
    }
    const result = await tx.article.updateMany({
        where: {
            id: article.id,
            updatedAt,
            status: article.status,
            clusterLinks: { none: {} },
        },
        data: {
            status,
            contentAvailability,
            embedding: Prisma.DbNull,
            embeddingModel: null,
            embeddingBasis: null,
            updatedAt: new Date(
                Math.max(Date.now(), article.updatedAt.getTime() + 1),
            ),
        },
    });
    if (result.count !== 1) {
        return {
            ...previous,
            outcome: 'SKIPPED',
            reason: 'Article changed or was linked to a cluster. Refresh the selection and try again.',
        };
    }
    return {
        id: article.id,
        title: article.title,
        outcome: 'UPDATED',
        reason:
            action === 'RECHECK'
                ? 'Article rechecked.'
                : action === 'APPROVE'
                  ? 'Article approved.'
                  : 'Article rejected.',
        status,
        contentAvailability,
    };
}

export async function runRawArticlesBatch({
    prisma,
    input,
}: {
    prisma: PrismaClient;
    input: RawArticlesBatchInput;
}) {
    if (input.items.length < 1 || input.items.length > 100)
        throw new Error('Batch must contain between 1 and 100 articles');
    if (new Set(input.items.map(({ id }) => id)).size !== input.items.length)
        throw new Error('Duplicate article IDs');
    const results: RawArticleBatchResult[] = [];
    for (const item of input.items) {
        let title = item.id;
        try {
            results.push(
                await prisma.$transaction(async (tx) => {
                    const article = await tx.article.findUnique({
                        where: { id: item.id },
                        select: articleSelect,
                    });
                    if (!article) {
                        return {
                            id: item.id,
                            title,
                            outcome: 'SKIPPED' as const,
                            reason: 'Article not found.',
                        };
                    }
                    title = article.title;
                    return applyAction(
                        tx,
                        article,
                        input.action,
                        item.updatedAt,
                    );
                }),
            );
        } catch (error) {
            results.push({
                id: item.id,
                title,
                outcome: 'ERROR',
                reason:
                    error instanceof Error
                        ? error.message
                        : 'Failed to process article.',
            });
        }
    }
    return { results };
}
