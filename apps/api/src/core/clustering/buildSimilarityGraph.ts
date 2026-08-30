import type { ClusteringArticle, SimilarityGraph } from './clustering.types';
import { cosineSimilarity } from './calculateArticleSimilarity';
import {
    CLUSTER_TIME_WINDOW_HOURS,
    MIN_SIMILARITY_TO_LINK,
} from './clustering.constants';

const MS_IN_HOUR = 1000 * 60 * 60;

function getArticleDate(article: ClusteringArticle): Date {
    return article.publishedAt ?? article.createdAt;
}

function isInsideTimeWindow(
    articleA: ClusteringArticle,
    articleB: ClusteringArticle,
): boolean {
    const dateA = getArticleDate(articleA);
    const dateB = getArticleDate(articleB);

    const diffHours = Math.abs(dateA.getTime() - dateB.getTime()) / MS_IN_HOUR;

    return diffHours <= CLUSTER_TIME_WINDOW_HOURS;
}

export function buildSimilarityGraph(
    articles: ClusteringArticle[],
): SimilarityGraph {
    const graph: SimilarityGraph = {};

    for (const article of articles) {
        graph[article.id] = [];
    }

    for (let i = 0; i < articles.length; i += 1) {
        for (let j = i + 1; j < articles.length; j += 1) {
            const articleA = articles[i];
            const articleB = articles[j];

            if (!isInsideTimeWindow(articleA, articleB)) {
                continue;
            }

            const score = cosineSimilarity(
                articleA.embedding,
                articleB.embedding,
            );

            if (score < MIN_SIMILARITY_TO_LINK) {
                continue;
            }

            graph[articleA.id].push({
                to: articleB.id,
                score,
            });

            graph[articleB.id].push({
                to: articleA.id,
                score,
            });
        }
    }

    return graph;
}
