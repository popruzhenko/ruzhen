import type { ClusterStatus } from '../../cluster/model/clusterConstants';

export type ArticleClusterCandidateStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ArticleClusterCandidate {
    id: string;
    score: number;
    status: ArticleClusterCandidateStatus;
    createdAt: string;
    article: {
        id: string;
        title: string | null;
        summary: string | null;
        publishedAt: string | null;
        createdAt: string;
        source: { id: string; name: string } | null;
    };
    cluster: {
        id: string;
        humanId: string;
        title: string;
        status: ClusterStatus;
        _count: { articleLinks: number };
    };
}

export interface ArticleClusterCandidatesParams {
    page: number;
    limit: number;
}

export interface ArticleClusterCandidatesResponse {
    candidates: ArticleClusterCandidate[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}

export interface GenerateArticleClusterCandidatesResponse {
    message: string;
    meta: {
        articlesChecked: number;
        clustersChecked: number;
        candidatesCreated: number;
        similarityThreshold: number;
        timeWindowHours: number;
    };
}

export interface AcceptArticleClusterCandidateResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        status: ClusterStatus;
    };
}

export interface RejectArticleClusterCandidateResponse {
    message: string;
    candidate: { id: string; status: ArticleClusterCandidateStatus };
}
