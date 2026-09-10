import { calculateCentroid } from '../../shared/lib/calculateCentroid';
import { cosineSimilarity } from './calculateArticleSimilarity';
import {
    CLUSTER_TIME_WINDOW_HOURS,
    MIN_SIMILARITY_TO_LINK,
} from './clustering.constants';

export interface SimilarityArticle {
    embedding: unknown;
    publishedAt: Date | null;
    createdAt: Date;
}

export interface ClusterSimilarityReference {
    centroid: number[];
    articleVectors: number[][];
    latestArticleTime: number;
}

export function parseCandidateVector(value: unknown): number[] | null {
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every(
            (item) => typeof item === 'number' && Number.isFinite(item),
        ) ||
        !value.some((item) => item !== 0)
    ) {
        return null;
    }
    return value;
}

export function buildClusterSimilarityReference(
    articles: SimilarityArticle[],
): ClusterSimilarityReference | null {
    const articleVectors = articles
        .map((article) => parseCandidateVector(article.embedding))
        .filter((vector): vector is number[] => vector !== null);
    const centroid = parseCandidateVector(calculateCentroid(articleVectors));
    const articleTimes = articles
        .map((article) => (article.publishedAt ?? article.createdAt).getTime())
        .filter(Number.isFinite);
    if (!centroid || articleTimes.length === 0) return null;

    return {
        centroid,
        articleVectors,
        latestArticleTime: Math.max(...articleTimes),
    };
}

export function calculateArticleClusterScore(
    article: SimilarityArticle,
    reference: ClusterSimilarityReference,
): number | null {
    const vector = parseCandidateVector(article.embedding);
    const articleTime = (article.publishedAt ?? article.createdAt).getTime();
    if (
        !vector ||
        vector.length !== reference.centroid.length ||
        !Number.isFinite(articleTime) ||
        Math.abs(articleTime - reference.latestArticleTime) >
            CLUSTER_TIME_WINDOW_HOURS * 60 * 60 * 1000
    ) {
        return null;
    }

    const score = cosineSimilarity(vector, reference.centroid);
    return Number.isFinite(score) && score >= MIN_SIMILARITY_TO_LINK
        ? Math.min(score, 1)
        : null;
}
