import 'dotenv/config';
import {
    PrismaClient,
    ClusterStatus,
    ArticleStatus,
    ClusterArticleMethod,
} from '@prisma/client';
import { generateClusterHumanId } from '../../../core/clustering/generateClusterHumanId';

import { parseEmbedding } from '../../../shared/lib/parseEmbedding';
import { calculateCentroid } from '../../../shared/lib/calculateCentroid';
import { buildClusterTitleFromArticles } from '../../../shared/lib/buildClusterTitleFromArticles';
import { prisma } from '../../../shared/lib/prismaClient';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

type CreateClusterInput = {
    title: string;
    summary?: string;
    mainCountry: string;
    startDate: string;
    createdByUserId: string;
};

function calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let index = 0; index < a.length; index += 1) {
        dot += a[index] * b[index];
        normA += a[index] * a[index];
        normB += b[index] * b[index];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function calculateAverageSimilarityFromLinks(
    links: { confidence: number | null }[],
): number | null {
    const confidenceValues = links
        .map((link) => link.confidence)
        .filter((value): value is number => typeof value === 'number');

    if (confidenceValues.length === 0) {
        return null;
    }

    const sum = confidenceValues.reduce((total, value) => total + value, 0);

    return sum / confidenceValues.length;
}

export interface UpdateClusterArticleInput {
    articleId: string;
    confidence: number | null;
    isPrimary: boolean;
}

interface UpdateClusterArticlesInput {
    prisma: PrismaClient;
    clusterId: string;
    addedByUserId: string;
    articles: UpdateClusterArticleInput[];
}

export async function updateClusterArticles({
    prisma,
    clusterId,
    addedByUserId,
    articles,
}: UpdateClusterArticlesInput) {
    if (!clusterId.trim()) {
        throw new Error('Cluster ID is required');
    }

    if (!Array.isArray(articles)) {
        throw new Error('Articles must be an array');
    }

    const uniqueArticles = Array.from(
        new Map(
            articles.map((article) => [article.articleId, article]),
        ).values(),
    );

    return prisma.$transaction(async (tx) => {
        const cluster = await tx.cluster.findUnique({
            where: {
                id: clusterId,
            },
            select: {
                id: true,
                status: true,
            },
        });

        if (!cluster) {
            throw new Error('Cluster not found');
        }

        const existingLinks = await tx.clusterArticle.findMany({
            where: {
                clusterId,
            },
            select: {
                articleId: true,
            },
        });

        const previousArticleIds = existingLinks.map((link) => link.articleId);

        const nextArticleIds = uniqueArticles.map(
            (article) => article.articleId,
        );

        const removedArticleIds = previousArticleIds.filter(
            (articleId) => !nextArticleIds.includes(articleId),
        );

        const addedArticleIds = nextArticleIds.filter(
            (articleId) => !previousArticleIds.includes(articleId),
        );

        const articlesChanged =
            addedArticleIds.length > 0 || removedArticleIds.length > 0;

        await tx.clusterArticle.deleteMany({
            where: {
                clusterId,
            },
        });

        if (uniqueArticles.length > 0) {
            await tx.clusterArticle.createMany({
                data: uniqueArticles.map((article, index) => ({
                    clusterId,
                    articleId: article.articleId,
                    method: ClusterArticleMethod.MANUAL,
                    confidence: article.confidence,
                    isPrimary: article.isPrimary || index === 0,
                    addedByUserId,
                })),
                skipDuplicates: true,
            });

            await tx.article.updateMany({
                where: {
                    id: {
                        in: nextArticleIds,
                    },
                },
                data: {
                    status: ArticleStatus.CLUSTERED,
                },
            });
        }

        if (removedArticleIds.length > 0) {
            await tx.article.updateMany({
                where: {
                    id: {
                        in: removedArticleIds,
                    },
                },
                data: {
                    status: ArticleStatus.EMBEDDED,
                },
            });
        }

        if (cluster.status === ClusterStatus.PUBLISHED && articlesChanged) {
            await tx.cluster.update({
                where: {
                    id: clusterId,
                },
                data: {
                    status: ClusterStatus.UPDATED,
                },
            });
        }

        const updatedCluster = await tx.cluster.findUnique({
            where: {
                id: clusterId,
            },
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                startDate: true,
                status: true,
                publishedAt: true,
                createdAt: true,
                updatedAt: true,
                articleLinks: {
                    orderBy: {
                        addedAt: 'asc',
                    },
                    select: {
                        confidence: true,
                        isPrimary: true,
                        article: {
                            select: {
                                id: true,
                                title: true,
                                summary: true,
                                content: true,
                                cleanedAccessibleText: true,
                                url: true,
                                country: true,
                                language: true,
                                publishedAt: true,
                                status: true,
                                embedding: true,
                                source: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        articleLinks: true,
                        blocks: true,
                    },
                },
            },
        });

        return updatedCluster;
    });
}

export async function createCluster(input: CreateClusterInput) {
    const { title, summary, mainCountry, startDate, createdByUserId } = input;

    if (!title || title.trim().length < 5) {
        throw new Error(
            'Title is required and must be at least 5 characters long',
        );
    }

    const cluster = await prisma.cluster.create({
        data: {
            humanId: generateClusterHumanId(),
            title: title.trim(),
            summary: summary?.trim() || null,
            mainCountry: mainCountry?.trim() || null,
            startDate: startDate ? new Date(startDate) : null,
            status: ClusterStatus.DRAFT,
            createdByUserId,
        },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            status: true,
            createdByUserId: true,
            publishedAt: true,
            updatedAt: true,
        },
    });

    return cluster;
}

type ListClustersInput = {
    page: number;
    limit: number;
};

export async function getClusterById(id: string) {
    const cluster = await prisma.cluster.findUnique({
        where: { id },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            status: true,
            publishedAt: true,
            createdAt: true,
            createdByUserId: true,
            updatedAt: true,
            createdBy: {
                select: {
                    id: true,
                    email: true,
                    role: true,
                },
            },
            clusterTags: {
                select: {
                    tag: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
            blocks: {
                orderBy: {
                    position: 'asc',
                },
                select: {
                    id: true,
                    type: true,
                    title: true,
                    content: true,
                    position: true,
                    sourceName: true,
                    sourceUrl: true,
                    authorName: true,
                    stance: true,
                    createdAt: true,
                    updatedAt: true,
                },
            },
            articleLinks: {
                select: {
                    articleId: true,
                    isPrimary: true,
                    confidence: true,
                    method: true,
                    addedAt: true,
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            url: true,
                            publishedAt: true,
                            country: true,
                            embedding: true,
                            source: {
                                select: {
                                    id: true,
                                    name: true,
                                    baseUrl: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    return {
        id: cluster.id,
        humanId: cluster.humanId,
        title: cluster.title,
        summary: cluster.summary,
        mainCountry: cluster.mainCountry,
        startDate: cluster.startDate,
        status: cluster.status,
        publishedAt: cluster.publishedAt,
        createdAt: cluster.createdAt,
        createdByUserId: cluster.createdByUserId,
        updatedAt: cluster.updatedAt,
        createdBy: cluster.createdBy,
        blocks: cluster.blocks,
        tags: cluster.clusterTags.map((item) => item.tag),
        articles: cluster.articleLinks.map((item) => ({
            ...item.article,
            confidence: item.confidence,
            method: item.method,
            isPrimary: item.isPrimary,
            addedAt: item.addedAt,
        })),
    };
}

export async function listClusters(input: ListClustersInput) {
    const { page, limit } = input;

    const skip = (page - 1) * limit;

    const [clusters, total] = await Promise.all([
        prisma.cluster.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: limit,
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                publishedAt: true,

                clusterTags: {
                    select: {
                        tag: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },

                blocks: {
                    orderBy: {
                        position: 'asc',
                    },
                    select: {
                        id: true,
                        type: true,
                        title: true,
                        content: true,
                        position: true,
                        sourceName: true,
                        sourceUrl: true,
                        authorName: true,
                        stance: true,
                    },
                },

                articleLinks: {
                    select: {
                        confidence: true,
                    },
                },

                _count: {
                    select: {
                        blocks: true,
                        articleLinks: true,
                    },
                },
            },
        }),

        prisma.cluster.count(),
    ]);

    const clustersWithAverageSimilarity = clusters.map((cluster) => {
        const { articleLinks, ...clusterData } = cluster;

        return {
            ...clusterData,
            averageSimilarity:
                calculateAverageSimilarityFromLinks(articleLinks),
        };
    });

    return {
        clusters: clustersWithAverageSimilarity,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
}

export async function updateCluster(
    id: string,
    data: {
        title?: string;
        summary?: string;
        mainCountry?: string;
        status?: ClusterStatus;
    },
) {
    const cluster = await prisma.cluster.update({
        where: { id },
        data,
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return cluster;
}

export async function deleteCluster(clusterId: string) {
    const cluster = await prisma.cluster.findUnique({
        where: {
            id: clusterId,
        },
        select: {
            id: true,
            articleLinks: {
                select: {
                    articleId: true,
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    const articleIds = cluster.articleLinks.map((link) => link.articleId);

    await prisma.$transaction(async (tx) => {
        await tx.cluster.delete({
            where: {
                id: clusterId,
            },
        });

        for (const articleId of articleIds) {
            const remainingLinksCount = await tx.clusterArticle.count({
                where: {
                    articleId,
                },
            });

            if (remainingLinksCount === 0) {
                await tx.article.update({
                    where: {
                        id: articleId,
                    },
                    data: {
                        status: 'EMBEDDED',
                    },
                });
            }
        }
    });

    return {
        id: clusterId,
        affectedArticleIds: articleIds,
    };
}

interface CreateClusterFromArticlesInput {
    articleIds: string[];
    title?: string;
    summary?: string | null;
    mainCountry?: string | null;
    startDate?: string | null;
    createdByUserId: string;
}

export async function createClusterFromArticles(
    input: CreateClusterFromArticlesInput,
) {
    const {
        articleIds,
        title,
        summary,
        mainCountry,
        startDate,
        createdByUserId,
    } = input;

    const uniqueArticleIds = Array.from(new Set(articleIds));

    if (uniqueArticleIds.length === 0) {
        throw new Error('At least one article is required to create cluster');
    }

    const articles = await prisma.article.findMany({
        where: {
            id: {
                in: uniqueArticleIds,
            },
        },
        select: {
            id: true,
            title: true,
            summary: true,
            country: true,
            publishedAt: true,
            embedding: true,
        },
    });

    if (articles.length !== uniqueArticleIds.length) {
        throw new Error('Some selected articles were not found');
    }

    const articlesWithEmbeddings = articles
        .map((article) => {
            const embedding = parseEmbedding(article.embedding);

            if (!embedding) {
                return null;
            }

            return {
                ...article,
                parsedEmbedding: embedding,
            };
        })
        .filter(
            (
                article,
            ): article is (typeof articles)[number] & {
                parsedEmbedding: number[];
            } => article !== null,
        );

    if (articlesWithEmbeddings.length === 0) {
        throw new Error('Selected articles must have embeddings');
    }

    const clusterEmbedding = calculateCentroid(
        articlesWithEmbeddings.map((article) => article.parsedEmbedding),
    );

    if (!clusterEmbedding) {
        throw new Error('Failed to calculate cluster embedding');
    }

    const resolvedTitle =
        title?.trim() || buildClusterTitleFromArticles(articles);

    if (resolvedTitle.length < 5) {
        throw new Error(
            'Title is required and must be at least 5 characters long',
        );
    }

    const resolvedMainCountry = mainCountry?.trim() || null;

    const resolvedStartDate = startDate
        ? new Date(startDate)
        : (articles
              .map((article) => article.publishedAt)
              .filter((date): date is Date => date !== null)
              .sort((a, b) => a.getTime() - b.getTime())[0] ?? null);

    const embeddingByArticleId = new Map(
        articlesWithEmbeddings.map((article) => [
            article.id,
            article.parsedEmbedding,
        ]),
    );

    const cluster = await prisma.$transaction(async (tx) => {
        const createdCluster = await tx.cluster.create({
            data: {
                humanId: generateClusterHumanId(),
                title: resolvedTitle.slice(0, 140),
                summary: summary?.trim() || null,
                mainCountry: resolvedMainCountry,
                startDate: resolvedStartDate,
                status: ClusterStatus.DRAFT,
                createdByUserId,
                embedding: clusterEmbedding as number[],
                articleLinks: {
                    create: uniqueArticleIds.map((articleId, index) => {
                        const articleEmbedding =
                            embeddingByArticleId.get(articleId);

                        const confidence = articleEmbedding
                            ? calculateCosineSimilarity(
                                  articleEmbedding,
                                  clusterEmbedding,
                              )
                            : null;

                        return {
                            articleId,
                            addedByUserId: createdByUserId,
                            isPrimary: index === 0,
                            confidence,
                            method: ClusterArticleMethod.MANUAL,
                        };
                    }),
                },
            },
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                startDate: true,
                status: true,
                createdByUserId: true,
                publishedAt: true,
                embedding: true,
                createdAt: true,
                updatedAt: true,
                articleLinks: {
                    select: {
                        articleId: true,
                        isPrimary: true,
                        confidence: true,
                        method: true,
                        addedAt: true,
                    },
                },
            },
        });

        await tx.article.updateMany({
            where: {
                id: {
                    in: uniqueArticleIds,
                },
            },
            data: {
                status: ArticleStatus.CLUSTERED,
            },
        });

        return createdCluster;
    });

    return {
        ...cluster,
        averageSimilarity: calculateAverageSimilarityFromLinks(
            cluster.articleLinks,
        ),
    };
}

export async function updateClusterStatus(
    clusterId: string,
    status: ClusterStatus,
) {
    const cluster = await prisma.cluster.findUnique({
        where: {
            id: clusterId,
        },
        select: {
            id: true,
            status: true,
            title: true,
            summary: true,
            blocks: {
                select: {
                    id: true,
                    type: true,
                    content: true,
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    if (status === ClusterStatus.PUBLISHED) {
        const errors: string[] = [];

        const facts = cluster.blocks.filter((block) => block.type === 'FACT');
        const context = cluster.blocks.filter(
            (block) => block.type === 'CONTEXT',
        );

        const hasEmptyBlockContent = cluster.blocks.some(
            (block) => !block.content.trim(),
        );

        if (!cluster.title.trim()) {
            errors.push('Title is required before publishing.');
        }

        if (!cluster.summary?.trim()) {
            errors.push('Summary is required before publishing.');
        }

        if (facts.length === 0) {
            errors.push(
                'At least one fact block is required before publishing.',
            );
        }

        if (context.length === 0) {
            errors.push(
                'At least one context block is required before publishing.',
            );
        }

        if (hasEmptyBlockContent) {
            errors.push(
                'All semantic blocks must have content before publishing.',
            );
        }

        if (errors.length > 0) {
            throw new Error(errors.join(' '));
        }
    }

    return prisma.cluster.update({
        where: {
            id: clusterId,
        },
        data: {
            status,
            publishedAt: status === ClusterStatus.PUBLISHED ? new Date() : null,
        },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            status: true,
            mainCountry: true,
            startDate: true,
            publishedAt: true,
            updatedAt: true,
            createdAt: true,
            _count: {
                select: {
                    articleLinks: true,
                    blocks: true,
                },
            },
        },
    });
}
interface ListPublishedClustersInput {
    page: number;
    limit: number;
}

const normalizePagination = (page: number, limit: number) => {
    const normalizedPage = Number.isFinite(page) && page > 0 ? page : 1;
    const normalizedLimit =
        Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 10;

    return {
        page: normalizedPage,
        limit: normalizedLimit,
        skip: (normalizedPage - 1) * normalizedLimit,
    };
};

export async function listPublishedClusters(input: ListPublishedClustersInput) {
    const { page, limit, skip } = normalizePagination(input.page, input.limit);

    const where = {
        status: ClusterStatus.PUBLISHED,
    };

    const [clusters, total] = await Promise.all([
        prisma.cluster.findMany({
            where,
            orderBy: [
                {
                    publishedAt: 'desc',
                },
                {
                    updatedAt: 'desc',
                },
            ],
            skip,
            take: limit,
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                startDate: true,
                publishedAt: true,
                updatedAt: true,
                blocks: {
                    orderBy: {
                        position: 'asc',
                    },
                    select: {
                        id: true,
                        type: true,
                        title: true,
                        content: true,
                        position: true,
                        sourceName: true,
                        sourceUrl: true,
                        authorName: true,
                        stance: true,
                    },
                },
                _count: {
                    select: {
                        articleLinks: true,
                        blocks: true,
                    },
                },
            },
        }),
        prisma.cluster.count({
            where,
        }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        items: clusters,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        },
    };
}

export async function getPublishedClusterByHumanId(humanId: string) {
    if (!humanId.trim()) {
        throw new Error('Cluster humanId is required');
    }

    const cluster = await prisma.cluster.findFirst({
        where: {
            humanId,
            status: ClusterStatus.PUBLISHED,
        },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            publishedAt: true,
            updatedAt: true,
            blocks: {
                orderBy: {
                    position: 'asc',
                },
                select: {
                    id: true,
                    type: true,
                    title: true,
                    content: true,
                    position: true,
                    sourceName: true,
                    sourceUrl: true,
                    authorName: true,
                    stance: true,
                },
            },
            articleLinks: {
                orderBy: {
                    addedAt: 'asc',
                },
                select: {
                    isPrimary: true,
                    confidence: true,
                    addedAt: true,
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            url: true,
                            publishedAt: true,
                            source: {
                                select: {
                                    id: true,
                                    name: true,
                                    baseUrl: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Published cluster not found');
    }

    return {
        id: cluster.id,
        humanId: cluster.humanId,
        title: cluster.title,
        summary: cluster.summary,
        mainCountry: cluster.mainCountry,
        startDate: cluster.startDate,
        publishedAt: cluster.publishedAt,
        updatedAt: cluster.updatedAt,
        blocks: cluster.blocks,
        sources: cluster.articleLinks.map((link) => ({
            ...link.article,
            isPrimary: link.isPrimary,
            confidence: link.confidence,
            addedAt: link.addedAt,
        })),
    };
}
