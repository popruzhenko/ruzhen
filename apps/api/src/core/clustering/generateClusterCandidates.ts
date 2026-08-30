import { ArticleStatus, Prisma, PrismaClient } from '@prisma/client';

import { buildClusters } from './buildClusters';
import { saveClusterCandidates } from './saveClusterCandidates';
import type { ClusteringArticle } from './clustering.types';
import {
    CLUSTER_TIME_WINDOW_HOURS,
    MAX_CLUSTER_ARTICLES,
    MIN_CLUSTER_SIZE,
    MIN_SIMILARITY_TO_LINK,
} from './clustering.constants';

interface GenerateClusterCandidatesInput {
    prisma: PrismaClient | Prisma.TransactionClient;
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

export async function generateClusterCandidates(
    input: GenerateClusterCandidatesInput,
) {
    const { prisma } = input;

    const articles = await prisma.article.findMany({
        where: {
            status: {
                in: [ArticleStatus.APPROVED, ArticleStatus.EMBEDDED],
            },
            embedding: {
                not: Prisma.JsonNull,
            },
        },
        orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const preparedArticles = articles
        .map((article): ClusteringArticle | null => {
            const embedding = parseEmbedding(article.embedding);

            if (!embedding) {
                return null;
            }

            return {
                id: article.id,
                publishedAt: article.publishedAt,
                createdAt: article.createdAt,
                embedding,
            };
        })
        .filter((article): article is ClusteringArticle => article !== null);

    if (preparedArticles.length === 0) {
        return {
            candidates: [],
            meta: {
                articlesChecked: 0,
                clustersBuilt: 0,
                candidatesCreated: 0,
            },
        };
    }

    const buildResult = buildClusters(preparedArticles);

    if (buildResult.clusters.length === 0) {
        return {
            candidates: [],
            meta: {
                articlesChecked: preparedArticles.length,
                clustersBuilt: 0,
                candidatesCreated: 0,
            },
        };
    }

    const candidates = await saveClusterCandidates({
        prisma,
        buildResult,
        articles,
        similarityThreshold: MIN_SIMILARITY_TO_LINK,
        timeWindowDays: CLUSTER_TIME_WINDOW_HOURS / 24,
        minClusterSize: MIN_CLUSTER_SIZE,
        maxClusterSize: MAX_CLUSTER_ARTICLES,
    });

    return {
        candidates,
        meta: {
            articlesChecked: preparedArticles.length,
            clustersBuilt: buildResult.clusters.length,
            candidatesCreated: candidates.length,
        },
    };
}
