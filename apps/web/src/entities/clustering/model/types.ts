import type { ClusterStatus } from "../../cluster/model/clusterConstants";
import type { ClusteringArticleStatus } from "../../raw-news/model/articleConstants";

export interface EmbeddedArticleItem {
    id: string;
    title: string;
    summary: string | null;
    sourceName: string | null;
    country: string | null;
    publishedAt: string | null;
    status: ClusteringArticleStatus;
    embedding: number[] | null;
}

export interface ClusterArticleItem extends EmbeddedArticleItem {
    embedding: number[] | null;
    similarityToCentroid: number | null;
    isPrimary: boolean;
    confidence: number | null;
}

export interface CandidateArticleItem extends EmbeddedArticleItem {
    similarityToCluster: number | null;
}

export interface GetClusterCandidatesResponse {
    candidates: EmbeddedArticleItem[];
}

export interface SaveClusterArticlesPayload {
    clusterId: string;
    articleIds: string[];
}

export interface ClusterListItem {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    status: ClusterStatus;
    articlesCount: number;
    averageSimilarity: number;
}

