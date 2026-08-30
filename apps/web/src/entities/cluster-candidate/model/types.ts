export type CandidateStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ClusterCandidateArticleSource {
    id: string;
    name: string;
    baseUrl?: string | null;
}

export interface ClusterCandidateArticleItem {
    articleId: string;
    confidence: number | null;
    isPrimary: boolean;
    position: number;
    article: {
        id: string;
        title: string;
        summary: string | null;
        publishedAt: string | null;
        createdAt: string;
        status?: string;
        embedding?: number[] | null;
        source: ClusterCandidateArticleSource | null;
    };
}

export interface ClusterCandidate {
    id: string;
    title: string | null;
    summary: string | null;
    status: CandidateStatus;
    algorithm: string;
    similarityThreshold: number;
    timeWindowDays: number;
    minClusterSize: number;
    maxClusterSize: number | null;
    articlesCount: number;
    averageSimilarity: number | null;
    startDate: string | null;
    endDate: string | null;
    createdAt: string;
    updatedAt: string;
    articles: ClusterCandidateArticleItem[];
}

export interface ClusterCandidatesResponse {
    candidates: ClusterCandidate[];
}

export interface GenerateClusterCandidatesResponse {
    message: string;
    candidates: ClusterCandidate[];
    meta: {
        articlesChecked: number;
        clustersBuilt: number;
        candidatesCreated: number;
    };
}

export interface AcceptClusterCandidateResponse {
    message: string;
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        status: string;
        startDate: string | null;
        createdAt: string;
        updatedAt: string;
        _count?: {
            articleLinks: number;
        };
    };
}

export interface DeleteClusterCandidateResponse {
    message: string;
    candidate: {
        id: string;
    };
}
