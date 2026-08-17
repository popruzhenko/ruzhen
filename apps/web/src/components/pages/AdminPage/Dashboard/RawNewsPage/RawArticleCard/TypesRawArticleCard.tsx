import type { ArticleStatus } from '../../../../../../entities/raw-news/model/articleConstants';

export interface RawArticleCardData {
    id: string;
    title: string;
    content?: string | null;
    summary?: string | null;
    preview?: string | null;
    cleanedAccessibleText?: string | null;

    status: ArticleStatus;

    contentAvailability?: string | null;
    embeddingBasis?: string | null;
    cleaningMethod?: string | null;
    embeddingModel?: string | null;

    hasEmbedding: boolean;

    createdAt: string;
    publishedAt?: string | null;
    sourceName?: string | null;
}
