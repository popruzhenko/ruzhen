import 'dotenv/config';
import { ArticleStatus } from '@prisma/client';
import { prisma } from '../../../shared/lib/prismaClient';
import {
    updateArticleSafely,
    type UpdateArticleInput,
} from '../../../core/articles/updateArticle';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

type ListArticlesInput = {
    page: number;
    limit: number;
    status?: ArticleStatus;
    sourceId?: string;
};

export async function getArticleById(id: string) {
    const article = await prisma.article.findUnique({
        where: { id },
        select: {
            id: true,
            sourceId: true,
            url: true,
            title: true,
            summary: true,
            content: true,
            imageUrl: true,
            publishedAt: true,
            language: true,
            country: true,
            status: true,
            embedding: true,
            createdAt: true,
            updatedAt: true,
            contentAvailability: true,
            contentAssessment: true,
            contentProvenance: true,
            cleanedAccessibleText: true,
            cleaningMethod: true,
            embeddingBasis: true,
            embeddingModel: true,

            source: {
                select: {
                    id: true,
                    name: true,
                    baseUrl: true,
                    language: true,
                    country: true,
                    type: true,
                },
            },
            raw: {
                select: {
                    id: true,
                    rawContent: true,
                    fetchedAt: true,
                    parserVersion: true,
                },
            },
            clusterLinks: {
                select: {
                    clusterId: true,
                    confidence: true,
                    method: true,
                    isPrimary: true,
                    addedAt: true,
                    cluster: {
                        select: {
                            id: true,
                            humanId: true,
                            title: true,
                            status: true,
                        },
                    },
                },
            },
            clusterCandidateLinks: {
                select: {
                    candidateId: true,
                    confidence: true,
                    isPrimary: true,
                    position: true,
                    candidate: {
                        select: {
                            id: true,
                            title: true,
                            status: true,
                            averageSimilarity: true,
                            articlesCount: true,
                            createdAt: true,
                        },
                    },
                },
            },
        },
    });

    if (!article) {
        throw new Error('Article not found');
    }

    return article;
}

export async function listArticles(input: ListArticlesInput) {
    const { page, limit, status, sourceId } = input;
    const skip = (page - 1) * limit;

    const where = {
        ...(status ? { status } : {}),
        ...(sourceId ? { sourceId } : {}),
    };

    const [articles, total] = await Promise.all([
        prisma.article.findMany({
            where,
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: limit,
            select: {
                id: true,
                sourceId: true,
                url: true,
                title: true,
                summary: true,
                content: true,
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
                cleanedAccessibleText: true,
                cleaningMethod: true,
                embeddingBasis: true,
                embedding: true,
                embeddingModel: true,
                source: {
                    select: {
                        id: true,
                        name: true,
                        baseUrl: true,
                    },
                },
                raw: {
                    select: {
                        id: true,
                        fetchedAt: true,
                        parserVersion: true,
                    },
                },
                _count: {
                    select: {
                        clusterLinks: true,
                        articleClusterCandidates: true,
                        clusterCandidateLinks: true,
                    },
                },
            },
        }),
        prisma.article.count({ where }),
    ]);

    return {
        articles,
        pagination: {
            page,
            limit: 9999,
            total,
            pages: Math.ceil(total / limit),
        },
    };
}

export async function deleteAllArticles() {
    await prisma.article.deleteMany({});
}

export async function updateArticle(
    articleId: string,
    data: UpdateArticleInput,
    actorUserId?: string,
) {
    return updateArticleSafely(prisma, articleId, data, actorUserId);
}
