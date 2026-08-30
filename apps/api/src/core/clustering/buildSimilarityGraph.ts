import type { ClusteringArticle, SimilarityGraph } from './clustering.types';
import { cosineSimilarity } from './calculateArticleSimilarity';
import { MIN_SIMILARITY_TO_LINK } from './clustering.constants';

export function buildSimilarityGraph(
    articles: ClusteringArticle[],
): SimilarityGraph {
    const graph: SimilarityGraph = {};

    for (const article of articles) {
        graph[article.id] = [];
    }

    for (let i = 0; i < articles.length; i += 1) {
        for (let j = i + 1; j < articles.length; j += 1) {
            const a = articles[i];
            const b = articles[j];

            const score = cosineSimilarity(a.embedding, b.embedding);

            if (score < MIN_SIMILARITY_TO_LINK) {
                continue;
            }

            graph[a.id].push({ to: b.id, score });
            graph[b.id].push({ to: a.id, score });
        }
    }

    return graph;
}
