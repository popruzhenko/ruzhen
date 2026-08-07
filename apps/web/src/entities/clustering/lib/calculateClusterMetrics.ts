import type {
    CandidateArticleItem,
    ClusterArticleItem,
    EmbeddedArticleItem,
} from '../model/types';
import { calculateCentroid } from './calculateCentroid';
import { cosineSimilarity } from './cosineSimilarity';

export function recalculateClusterArticles(
    articles: ClusterArticleItem[],
): {
    centroid: number[] | null;
    articles: ClusterArticleItem[];
    averageSimilarity: number;
} {
    const articlesWithEmbedding = articles.filter(
        (article): article is ClusterArticleItem & { embedding: number[] } =>
            Array.isArray(article.embedding),
    );

    const centroid = calculateCentroid(
        articlesWithEmbedding.map((article) => article.embedding),
    );

    if (!centroid) {
        return {
            centroid: null,
            articles: articles.map((article) => ({
                ...article,
                similarityToCentroid: null,
            })),
            averageSimilarity: 0,
        };
    }

    const recalculatedArticles = articles.map((article) => {
        if (!Array.isArray(article.embedding)) {
            return {
                ...article,
                similarityToCentroid: null,
            };
        }

        return {
            ...article,
            similarityToCentroid: cosineSimilarity(article.embedding, centroid),
        };
    });

    const similarities = recalculatedArticles
        .map((article) => article.similarityToCentroid)
        .filter((value): value is number => typeof value === 'number');

    const averageSimilarity =
        similarities.length > 0
            ? similarities.reduce((sum, value) => sum + value, 0) /
              similarities.length
            : 0;

    return {
        centroid,
        articles: recalculatedArticles,
        averageSimilarity,
    };
}

export function recalculateCandidates(
    candidates: EmbeddedArticleItem[],
    centroid: number[] | null,
): CandidateArticleItem[] {
    return candidates
        .map((article) => {
            if (!Array.isArray(article.embedding) || !centroid) {
                return {
                    ...article,
                    similarityToCluster: null,
                };
            }

            return {
                ...article,
                similarityToCluster: cosineSimilarity(
                    article.embedding,
                    centroid,
                ),
            };
        })
        .sort((a, b) => {
            const aScore = a.similarityToCluster ?? -1;
            const bScore = b.similarityToCluster ?? -1;

            return bScore - aScore;
        });
}