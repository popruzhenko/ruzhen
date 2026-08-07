export type PublicClusterBlockType = 'FACT' | 'CONTEXT' | 'OPINION';
export type PublicOpinionStance = 'PRO' | 'CONTRA' | 'NEUTRAL';

export interface PublicClusterBlock {
    id: string;
    type: PublicClusterBlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: PublicOpinionStance | null;
}

export interface PublicClusterListItem {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    mainCountry: string | null;
    startDate: string | null;
    publishedAt: string | null;
    updatedAt: string;
    blocks: PublicClusterBlock[];
    _count: {
        articleLinks: number;
        blocks: number;
    };
}

export interface PublicClusterSource {
    id: string;
    title: string;
    summary: string | null;
    url: string | null;
    publishedAt: string | null;
    isPrimary: boolean;
    confidence: number | null;
    addedAt: string;
    source: {
        id: string;
        name: string;
        baseUrl: string | null;
    } | null;
}

export interface PublicClusterDetails {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    mainCountry: string | null;
    startDate: string | null;
    publishedAt: string | null;
    updatedAt: string;
    blocks: PublicClusterBlock[];
    sources: PublicClusterSource[];
}

export interface PublicClustersPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface GetPublicClustersResponse {
    items: PublicClusterListItem[];
    pagination: PublicClustersPagination;
}

export interface GetPublicClusterByHumanIdResponse {
    cluster: PublicClusterDetails;
}