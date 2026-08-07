export type ArticleStatus =
    | 'NEW'
    | 'NEEDS_REVIEW'
    | 'REVIEWED'
    | 'REJECTED'
    | 'APPROVED'
    | 'EMBEDDED'
    | 'CLUSTERED'
    | string;

export type ContentAvailability =
    | 'FULL'
    | 'SUMMARY_ONLY'
    | 'NO_CONTENT'
    | string;

export interface ArticleSourceApiItem {
    id: string;
    name: string;
    baseUrl: string | null;
}

export interface ArticleRawApiItem {
    id: string;
    fetchedAt: string;
    parserVersion: string | null;
}

export interface ArticleApiItem {
    id: string;
    sourceId: string;
    url: string;

    title: string | null;
    summary: string | null;
    content: string | null;
    imageUrl: string | null;

    publishedAt: string | null;
    language: string | null;
    country: string | null;

    status: ArticleStatus;

    createdAt: string;
    updatedAt: string;
    contentAvailability: ContentAvailability | null;
    cleanedAccessibleText: string | null;
    cleaningMethod: string | null;
    embeddingBasis: string | null;
    embeddingModel: string | null;
    embedding: number[] | null;

    source: ArticleSourceApiItem | null;
    raw: ArticleRawApiItem | null;

    _count: {
        clusterLinks: number;
        clusterCandidates: number;
    };
}

export interface RawNewsFeedItem {
    id: string;
    sourceId: string;
    url: string;

    title: string;
    summary: string | null;
    content: string | null;
    preview: string;
    imageUrl: string | null;

    status: ArticleStatus;

    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    fetchedAt: string | null;

    sourceName: string;
    sourceBaseUrl: string | null;

    country: string;
    language: string;
    embedding: number[] | null;
    contentAvailability: string;
    embeddingBasis: string;
    cleaningMethod: string;
    embeddingModel: string;
    parserVersion: string;

    clusterLinksCount: number;
    clusterCandidatesCount: number;

    pipeline: {
        fetched: boolean;
        cleaned: boolean;
        embedded: boolean;
        clustered: boolean;
    };
}

export interface GetArticlesApiResponse {
    articles: ArticleApiItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
    };
}