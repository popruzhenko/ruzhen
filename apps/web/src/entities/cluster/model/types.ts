export interface ClusterApiItem {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    mainCountry: string | null;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    clusterTags: Array<{
        id: string;
        name: string;
    }>;
    _count: {
        blocks: number;
        articleLinks: number;
    };
}

export interface ClusterFeedItem {
    id: string;
    title: string;
    summary: string;
    country: string;
    publishedAt: string;
    tags: string[];
    badges: Array<'fact' | 'context' | 'opinion'>;
    imageUrl?: string;
}

export interface GetClustersParams {
    page?: number;
    limit?: number;
}

export interface GetClustersApiResponse {
    clusters: ClusterApiItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}

export interface ClusterDetailsArticleApiItem {
    id: string;
    title: string;
    summary: string | null;
    url: string;
    publishedAt: string | null;
    country: string | null;
    embedding: number[] | null;
    confidence: number | null;
    method: 'AUTO' | 'MANUAL';
    isPrimary: boolean;
    addedAt: string;
    source: {
        id: string;
        name: string;
        baseUrl: string;
    };
}

export interface ClusterDetailsApiItem {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    mainCountry: string | null;
    startDate: string | null;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    publishedAt: string | null;
    createdAt: string;
    createdByUserId: string;
    updatedAt: string;
    createdBy: {
        id: string;
        email: string;
        role: 'USER' | 'ADMIN';
    };
    blocks: Array<{
        id: string;
        type: 'FACT' | 'CONTEXT' | 'OPINION';
        title: string | null;
        content: string;
        position: number;
        sourceName: string | null;
        sourceUrl: string | null;
        authorName: string | null;
        stance: 'PRO' | 'CONTRA' | 'NEUTRAL' | null;
        createdAt: string;
        updatedAt: string;
    }>;
    tags: Array<{
        id: string;
        name: string;
    }>;
    articles: ClusterDetailsArticleApiItem[];
}

