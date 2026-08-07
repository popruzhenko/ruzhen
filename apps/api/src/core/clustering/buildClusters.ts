import {
  BuildClustersResult,
  ClusteringArticle,
} from './clustering.types';
import { buildSimilarityGraph } from './buildSimilarityGraph';
import { buildClustersFromGraph } from './buildClustersFromGraph';
import { splitClusterGroupByRules } from './splitClusterGroupByRules';

export function buildClusters(
  articles: ClusteringArticle[],
): BuildClustersResult {
  if (articles.length === 0) {
    return {
      clusters: [],
      relations: [],
    };
  }

  console.log('buildClusters input articles:', articles.length);
  console.log('unique article ids:', new Set(articles.map((article) => article.id)).size);

  const graph = buildSimilarityGraph(articles);

  console.log('graph nodes:', Object.keys(graph).length);

  const edgesCount = Object.values(graph).reduce(
    (sum, edges) => sum + edges.length,
    0,
  );

  console.log('graph edges:', edgesCount);

  const groups = buildClustersFromGraph(graph);

  console.log('groups count:', groups.length);
  console.log(
    'group sizes:',
    groups.map((group) => group.articleIds.length).sort((a, b) => b - a),
  );

  const articlesMap = new Map(articles.map((article) => [article.id, article]));

  const clusters: BuildClustersResult['clusters'] = [];
  const relations: BuildClustersResult['relations'] = [];

  for (const group of groups) {
    const result = splitClusterGroupByRules({
      group,
      articlesMap,
      startClusterIndex: clusters.length,
    });

    clusters.push(...result.clusters);
    relations.push(...result.relations);
  }

  console.log('final clusters count:', clusters.length);

  return {
    clusters,
    relations,
  };
}