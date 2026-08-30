import { CandidateStatus, Prisma, PrismaClient } from '@prisma/client';
import type { Article } from '@prisma/client';

import type { BuildClustersResult } from './clustering.types';
import { buildClusterTitle } from './buildClusterTitle';
import { buildClusterSummary } from './buildClusterSummary';
import { cosineSimilarity } from './calculateArticleSimilarity';

interface SaveClusterCandidatesInput {
    prisma: PrismaClient | Prisma.TransactionClient;
    buildResult: BuildClustersResult;
    articles: Article[];
    similarityThreshold: number;
    timeWindowDays: number;
    minClusterSize: number;
    maxClusterSize: number;
}

function parseEmbedding(value: Prisma.JsonValue): number[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const embedding = value.filter((item): item is number => {
        return typeof item === 'number' && Number.isFinite(item);
    });

    if (embedding.length !== value.length || embedding.length === 0) {
        return null;
    }

    return embedding;
}

function calculateAverageSimilarity(articles: Article[]): number | null {
    const embeddings = articles
        .map((article) => parseEmbedding(article.embedding))
        .filter((embedding): embedding is number[] => embedding !== null);

    if (embeddings.length < 2) {
        return null;
    }

    const similarities: number[] = [];

    for (let i = 0; i < embeddings.length; i += 1) {
        for (let j = i + 1; j < embeddings.length; j += 1) {
            similarities.push(cosineSimilarity(embeddings[i], embeddings[j]));
        }
    }

    if (similarities.length === 0) {
        return null;
    }

    return (
        similarities.reduce((sum, similarity) => sum + similarity, 0) /
        similarities.length
    );
}

export async function saveClusterCandidates(input: SaveClusterCandidatesInput) {
    const {
        prisma,
        buildResult,
        articles,
        similarityThreshold,
        timeWindowDays,
        minClusterSize,
        maxClusterSize,
    } = input;

    const articleMap = new Map(
        articles.map((article) => [article.id, article]),
    );

    await prisma.clusterCandidate.deleteMany({
        where: {
            status: CandidateStatus.PENDING,
        },
    });

    const savedCandidates = [];

    for (const clusterDraft of buildResult.clusters) {
        const clusterArticles = clusterDraft.articleIds
            .map((articleId) => articleMap.get(articleId))
            .filter((article): article is Article => Boolean(article));

        if (clusterArticles.length < minClusterSize) {
            continue;
        }

        const averageSimilarity = calculateAverageSimilarity(clusterArticles);

        const candidate = await prisma.clusterCandidate.create({
            data: {
                title: buildClusterTitle({
                    articles: clusterArticles.map((article) => ({
                        title: article.title,
                        publishedAt: article.publishedAt,
                        createdAt: article.createdAt,
                    })),
                }),
                summary: buildClusterSummary({
                    articles: clusterArticles.map((article) => ({
                        summary: article.summary,
                        cleanedAccessibleText: article.cleanedAccessibleText,
                        content: article.content,
                    })),
                }),
                status: CandidateStatus.PENDING,
                algorithm: 'TIME_WINDOW_COSINE_DFS',
                similarityThreshold,
                timeWindowDays,
                minClusterSize,
                maxClusterSize,
                articlesCount: clusterArticles.length,
                averageSimilarity,
                startDate: clusterDraft.startDate,
                endDate: clusterDraft.endDate,
                articles: {
                    create: clusterArticles.map((article, index) => ({
                        articleId: article.id,
                        confidence: null,
                        isPrimary: index === 0,
                        position: index + 1,
                    })),
                },
            },
            select: {
                id: true,
                title: true,
                summary: true,
                status: true,
                algorithm: true,
                similarityThreshold: true,
                timeWindowDays: true,
                minClusterSize: true,
                maxClusterSize: true,
                articlesCount: true,
                averageSimilarity: true,
                startDate: true,
                endDate: true,
                createdAt: true,
                updatedAt: true,
                articles: {
                    orderBy: {
                        position: 'asc',
                    },
                    select: {
                        articleId: true,
                        confidence: true,
                        isPrimary: true,
                        position: true,
                        article: {
                            select: {
                                id: true,
                                title: true,
                                summary: true,
                                publishedAt: true,
                                createdAt: true,
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
            },
        });

        savedCandidates.push(candidate);
    }

    return savedCandidates;
}
