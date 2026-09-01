import 'dotenv/config';
import { ArticleStatus, ContentAvailability } from '@prisma/client';
import { prisma } from '../../../shared/lib/prismaClient';
import { MIN_FULL_TEXT_CONTENT_LENGTH } from '../../../core/normalize/article/contentAvailability.constants';

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

interface UpdateArticleInput {
    title?: string;
    summary?: string;
    content?: string;
    cleanedAccessibleText?: string;
    status?: ArticleStatus;
}

export async function updateArticle(
    articleId: string,
    data: UpdateArticleInput,
) {
    const currentArticle = await prisma.article.findUnique({
        where: {
            id: articleId,
        },
        select: {
            id: true,
            title: true,
            summary: true,
            content: true,
            cleanedAccessibleText: true,
            url: true,
            sourceId: true,
            contentAvailability: true,
        },
    });

    if (!currentArticle) {
        throw new Error('Article not found');
    }

    const nextTitle = data.title ?? currentArticle.title;
    const nextSummary = data.summary ?? currentArticle.summary;
    const nextContent = data.content ?? currentArticle.content;
    const nextCleanedAccessibleText =
        data.cleanedAccessibleText ?? currentArticle.cleanedAccessibleText;

    if (data.status === ArticleStatus.APPROVED) {
        const errors: string[] = [];

        if (!nextTitle?.trim()) {
            errors.push('Title is required before approval.');
        }

        if (!currentArticle.url?.trim()) {
            errors.push('Original article URL is required before approval.');
        }

        if (!currentArticle.sourceId) {
            errors.push('Source is required before approval.');
        }

        if (!nextSummary?.trim()) {
            errors.push('Summary is required before approval.');
        }

        const hasTextForEmbedding =
            Boolean(nextContent?.trim()) ||
            Boolean(nextCleanedAccessibleText?.trim());

        if (!hasTextForEmbedding) {
            errors.push(
                'Content or cleaned accessible text is required before approval.',
            );
        }

        if (
            currentArticle.contentAvailability !== ContentAvailability.FULL_TEXT
        )
            errors.push(
                `Article must have FULL_TEXT content before approval. Current content availability: ${currentArticle.contentAvailability}. Minimum required content length for FULL_TEXT: ${MIN_FULL_TEXT_CONTENT_LENGTH} characters.`,
            );
        if (errors.length > 0) {
            throw new Error(errors.join(' '));
        }
    }

    return prisma.article.update({
        where: {
            id: articleId,
        },
        data: {
            title: data.title,
            summary: data.summary,
            content: data.content,
            cleanedAccessibleText: data.cleanedAccessibleText,
            status: data.status,
        },
        include: {
            source: true,
            raw: true,
            _count: {
                select: {
                    clusterLinks: true,
                    articleClusterCandidates: true,
                    clusterCandidateLinks: true,
                },
            },
        },
    });
}
