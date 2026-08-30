import { buildSimilarityGraph } from './buildSimilarityGraph';
import { buildClustersFromGraph } from './buildClustersFromGraph';
import { ClusteringArticle, ClusterGroup } from './clustering.types';

interface ClusterArticlesInput {
    articles: ClusteringArticle[];
}

interface ClusterArticlesResult {
    clusters: ClusterGroup[];
}

export function clusterArticles(
    input: ClusterArticlesInput,
): ClusterArticlesResult {
    const { articles } = input;

    if (articles.length === 0) {
        return { clusters: [] };
    }

    const graph = buildSimilarityGraph(articles);
    const clusters = buildClustersFromGraph(graph);

    return { clusters };
}
