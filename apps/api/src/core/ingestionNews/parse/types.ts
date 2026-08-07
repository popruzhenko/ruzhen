export type SourceFetchMode = 'RSS' | 'SECTION_HTML';
export type SourceAccessMode = 'FULL_OPEN' | 'METADATA_ONLY';

export interface ParseSourceInput {
    id: string;
    name: string;
    baseUrl: string;
    language?: string | null;
    country?: string | null;
    fetchMode: SourceFetchMode;
    accessMode: SourceAccessMode;
    politicsOnly?: boolean;
}

export interface ParsedFeedItem {
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
    content?: string;
    summary?: string;
    description?: string;
    imageUrl?: string;
    raw?: unknown;
}

export interface SectionArticleCandidate {
    title: string;
    url: string;
    summary?: string | null;
    publishedAt?: Date | null;
    imageUrl?: string | null;
    raw?: unknown;
}

export interface ArticleCreateCandidate {
    sourceId: string;
    url: string;
    title: string;
    summary: string | null;
    content: string | null;
    cleanedAccessibleText?: string | null;
    imageUrl: string | null;
    publishedAt: Date | null;
    country: string | null;
    language: string | null;
    rawPayload?: unknown;
}

export interface RunParseResult {
    sourceId: string;
    sourceName: string;
    fetchedItems: number;
    created: number;
    updated: number;
    skippedDuplicates: number;
    skippedInvalid: number;
}
