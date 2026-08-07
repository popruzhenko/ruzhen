export interface ClusteringArticle {
  id: string;
  publishedAt: Date | null;
  embedding: number[];
}

export interface SimilarityEdge {
  to: string;
  score: number;
}

export interface SimilarityGraph {
  [articleId: string]: SimilarityEdge[];
}

export interface ClusterGroup {
  articleIds: string[];
}

export interface ClusterDraft {
  articleIds: string[];
  startDate: Date | null;
  endDate: Date | null;
}

export interface ClusterRelationDraft {
  fromClusterIndex: number;
  toClusterIndex: number;
  type: 'CONTINUES';
}

export interface BuildClustersResult {
  clusters: ClusterDraft[];
  relations: ClusterRelationDraft[];
}