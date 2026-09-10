import {
    ArticleStatus,
    CandidateStatus,
    ClusterArticleMethod,
    ClusterStatus,
    Prisma,
    type PrismaClient,
} from '@prisma/client';
import { calculateCentroid } from '../../shared/lib/calculateCentroid';
import {
    buildClusterSimilarityReference,
    calculateArticleClusterScore,
    parseCandidateVector,
} from './articleClusterCandidateSimilarity';
import {
    CLUSTER_TIME_WINDOW_HOURS,
    MIN_SIMILARITY_TO_LINK,
} from './clustering.constants';

const readyStatuses = [ArticleStatus.APPROVED, ArticleStatus.EMBEDDED];
const activeClusterStatuses = [
    ClusterStatus.DRAFT,
    ClusterStatus.UPDATED,
    ClusterStatus.PUBLISHED,
];
const readyArticleWhere: Prisma.ArticleWhereInput = {
    status: { in: readyStatuses },
    clusterLinks: { none: {} },
};
const similarityArticleSelect = {
    id: true,
    embedding: true,
    publishedAt: true,
    createdAt: true,
} satisfies Prisma.ArticleSelect;
const targetClusterSelect = {
    id: true,
    humanId: true,
    title: true,
    status: true,
    articleLinks: {
        select: { article: { select: similarityArticleSelect } },
    },
} satisfies Prisma.ClusterSelect;

export class ArticleClusterCandidateError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number = 409,
    ) {
        super(message);
        this.name = 'ArticleClusterCandidateError';
    }
}

interface ReviewInput {
    prisma: PrismaClient;
    candidateId: string;
    reviewedByUserId: string;
}

function validateReviewInput(candidateId: string, reviewedByUserId: string) {
    if (!candidateId.trim()) {
        throw new ArticleClusterCandidateError('Candidate ID is required', 400);
    }
    if (!reviewedByUserId.trim()) {
        throw new ArticleClusterCandidateError('Reviewer ID is required', 400);
    }
}

async function throwUnavailableCandidate(
    tx: Prisma.TransactionClient,
    candidateId: string,
): Promise<never> {
    const candidate = await tx.articleClusterCandidate.findUnique({
        where: { id: candidateId },
        select: { id: true },
    });
    throw new ArticleClusterCandidateError(
        candidate
            ? 'Only pending article suggestions can be reviewed'
            : 'Article suggestion not found. Generate suggestions again.',
        candidate ? 409 : 404,
    );
}

export async function generateArticleClusterCandidates({
    prisma,
}: {
    prisma: PrismaClient;
}) {
    const [articles, clusters] = await Promise.all([
        prisma.article.findMany({
            where: {
                ...readyArticleWhere,
                embedding: { not: Prisma.AnyNull },
            },
            select: similarityArticleSelect,
            orderBy: { id: 'asc' },
        }),
        prisma.cluster.findMany({
            where: {
                status: { in: activeClusterStatuses },
                articleLinks: { some: {} },
            },
            select: targetClusterSelect,
            orderBy: { id: 'asc' },
        }),
    ]);
    const preparedArticles = articles.filter((article) =>
        parseCandidateVector(article.embedding),
    );
    const references = clusters.flatMap((cluster) => {
        const reference = buildClusterSimilarityReference(
            cluster.articleLinks.map((link) => link.article),
        );
        return reference ? [{ clusterId: cluster.id, reference }] : [];
    });
    const proposals: Prisma.ArticleClusterCandidateCreateManyInput[] = [];
    for (const article of preparedArticles) {
        for (const { clusterId, reference } of references) {
            const score = calculateArticleClusterScore(article, reference);
            if (score !== null) {
                proposals.push({
                    articleId: article.id,
                    clusterId,
                    score,
                    status: CandidateStatus.PENDING,
                });
            }
        }
    }

    const candidatesCreated = await prisma.$transaction(async (tx) => {
        await tx.articleClusterCandidate.deleteMany({
            where: { status: CandidateStatus.PENDING },
        });
        if (proposals.length === 0) return 0;

        // Reviewed pairs keep their unique (articleId, clusterId) entry. A
        // concurrent review/generation cannot turn them back into pending rows.
        const saved = await tx.articleClusterCandidate.createMany({
            data: proposals,
            skipDuplicates: true,
        });
        return saved.count;
    });

    return {
        meta: {
            articlesChecked: preparedArticles.length,
            clustersChecked: references.length,
            candidatesCreated,
            similarityThreshold: MIN_SIMILARITY_TO_LINK,
            timeWindowHours: CLUSTER_TIME_WINDOW_HOURS,
        },
    };
}

function readPageNumber(
    value: unknown,
    name: string,
    fallback: number,
): number {
    if (value === undefined) return fallback;
    if (
        (typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'string' && !value.trim())
    ) {
        throw new ArticleClusterCandidateError(
            `${name} must be a positive integer`,
            400,
        );
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) {
        throw new ArticleClusterCandidateError(
            `${name} must be a positive integer`,
            400,
        );
    }
    return number;
}

export async function listArticleClusterCandidates({
    prisma,
    page: requestedPage,
    limit: requestedLimit,
}: {
    prisma: PrismaClient;
    page?: unknown;
    limit?: unknown;
}) {
    const page = readPageNumber(requestedPage, 'page', 1);
    const limit = Math.min(readPageNumber(requestedLimit, 'limit', 10), 100);
    return prisma.$transaction(
        async (tx) => {
            const where: Prisma.ArticleClusterCandidateWhereInput = {
                status: CandidateStatus.PENDING,
                article: { is: readyArticleWhere },
                cluster: { is: { status: { in: activeClusterStatuses } } },
            };
            const total = await tx.articleClusterCandidate.count({ where });
            const totalPages = Math.max(1, Math.ceil(total / limit));
            const currentPage = Math.min(page, totalPages);
            const candidates = await tx.articleClusterCandidate.findMany({
                where,
                orderBy: [
                    { score: 'desc' },
                    { createdAt: 'desc' },
                    { id: 'asc' },
                ],
                skip: (currentPage - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    score: true,
                    status: true,
                    createdAt: true,
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            publishedAt: true,
                            createdAt: true,
                            source: { select: { id: true, name: true } },
                        },
                    },
                    cluster: {
                        select: {
                            id: true,
                            humanId: true,
                            title: true,
                            status: true,
                            _count: { select: { articleLinks: true } },
                        },
                    },
                },
            });
            return {
                candidates,
                pagination: {
                    page: currentPage,
                    limit,
                    total,
                    totalPages,
                    hasNextPage: currentPage < totalPages,
                    hasPreviousPage: currentPage > 1,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function acceptArticleClusterCandidate({
    prisma,
    candidateId,
    reviewedByUserId,
}: ReviewInput) {
    validateReviewInput(candidateId, reviewedByUserId);
    return prisma.$transaction(async (tx) => {
        const claimed = await tx.articleClusterCandidate.updateMany({
            where: { id: candidateId, status: CandidateStatus.PENDING },
            data: {
                status: CandidateStatus.ACCEPTED,
                reviewedByUserId,
                reviewedAt: new Date(),
            },
        });
        if (claimed.count !== 1)
            return throwUnavailableCandidate(tx, candidateId);

        const candidate = await tx.articleClusterCandidate.findUnique({
            where: { id: candidateId },
            select: { articleId: true, clusterId: true },
        });
        if (!candidate) return throwUnavailableCandidate(tx, candidateId);

        // Claim the article as well: different suggestions may share an article.
        const claimedArticle = await tx.article.updateMany({
            where: { id: candidate.articleId, ...readyArticleWhere },
            data: { status: ArticleStatus.CLUSTERED },
        });
        if (claimedArticle.count !== 1) {
            throw new ArticleClusterCandidateError(
                'This article is no longer available for clustering. Generate suggestions again.',
            );
        }

        // Lock the target before reading its current composition and status.
        const lockedCluster = await tx.cluster.updateMany({
            where: {
                id: candidate.clusterId,
                status: { in: activeClusterStatuses },
            },
            data: { updatedAt: new Date() },
        });
        if (lockedCluster.count !== 1) {
            throw new ArticleClusterCandidateError(
                'This cluster is no longer available. Generate suggestions again.',
            );
        }
        const [article, cluster] = await Promise.all([
            tx.article.findUnique({
                where: { id: candidate.articleId },
                select: similarityArticleSelect,
            }),
            tx.cluster.findUnique({
                where: { id: candidate.clusterId },
                select: targetClusterSelect,
            }),
        ]);
        const reference =
            cluster &&
            buildClusterSimilarityReference(
                cluster.articleLinks.map((link) => link.article),
            );
        const score =
            article && reference
                ? calculateArticleClusterScore(article, reference)
                : null;
        if (score === null || !article || !cluster || !reference) {
            throw new ArticleClusterCandidateError(
                'This suggestion no longer matches the cluster. Generate suggestions again.',
            );
        }
        const articleVector = parseCandidateVector(article.embedding)!;
        const centroid = parseCandidateVector(
            calculateCentroid([...reference.articleVectors, articleVector]),
        );
        if (!centroid) {
            throw new ArticleClusterCandidateError(
                'Cannot calculate the updated cluster embedding',
            );
        }

        await tx.clusterArticle.create({
            data: {
                clusterId: cluster.id,
                articleId: article.id,
                addedByUserId: reviewedByUserId,
                method: ClusterArticleMethod.AUTO,
                isPrimary: false,
                confidence: score,
            },
        });
        return tx.cluster.update({
            where: { id: cluster.id },
            data: {
                status:
                    cluster.status === ClusterStatus.PUBLISHED
                        ? ClusterStatus.UPDATED
                        : cluster.status,
                embedding: centroid,
            },
            select: { id: true, humanId: true, title: true, status: true },
        });
    });
}

export async function rejectArticleClusterCandidate({
    prisma,
    candidateId,
    reviewedByUserId,
}: ReviewInput) {
    validateReviewInput(candidateId, reviewedByUserId);
    return prisma.$transaction(async (tx) => {
        const reviewed = await tx.articleClusterCandidate.updateMany({
            where: { id: candidateId, status: CandidateStatus.PENDING },
            data: {
                status: CandidateStatus.REJECTED,
                reviewedByUserId,
                reviewedAt: new Date(),
            },
        });
        if (reviewed.count !== 1)
            return throwUnavailableCandidate(tx, candidateId);
        return { id: candidateId, status: CandidateStatus.REJECTED };
    });
}
