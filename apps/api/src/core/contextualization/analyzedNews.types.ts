import type { BlockType, OpinionStance } from '@prisma/client';

export interface AnalyzedNewsSourceArticle {
    id: string;
    title: string;
    summary: string | null;
    content: string | null;
    cleanedAccessibleText: string | null;
    url: string;
    publishedAt: Date | null;
    sourceName: string | null;
    sourceUrl: string | null;
    country: string | null;
    language: string | null;
}

export interface BuildAnalyzedNewsPromptInput {
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: Date | null;
    };
    articles: AnalyzedNewsSourceArticle[];
}

export interface AnalyzedNewsDraftBlock {
    type: BlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: OpinionStance | null;
}

export interface AnalyzedNewsDraft {
    title: string;
    summary: string;
    blocks: AnalyzedNewsDraftBlock[];
}

export interface GenerateAnalyzedNewsForClusterInput {
    clusterId: string;
    createdByUserId: string;
    replaceExistingBlocks?: boolean;
}

export interface GeneratedClusterBlock {
    id: string;
    clusterId: string;
    type: BlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: OpinionStance | null;
    createdByUserId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface GenerateAnalyzedNewsForClusterResult {
    cluster: {
        id: string;
        humanId: string;
        title: string;
        summary: string | null;
        mainCountry: string | null;
        startDate: Date | null;
        updatedAt: Date;
    };
    blocks: GeneratedClusterBlock[];
}
