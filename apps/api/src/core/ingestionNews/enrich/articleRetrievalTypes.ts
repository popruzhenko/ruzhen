export type ArticleRetrievalProvider =
    'PUBLISHER_HTTP' | 'PUBLISHER_BROWSER' | 'ARCHIVE_TODAY';

export interface ArticleRetrievalAttempt {
    provider: ArticleRetrievalProvider;
    outcome: 'FULL_TEXT' | 'PARTIAL_TEXT' | 'NO_CONTENT' | 'ERROR' | 'SKIPPED';
    url: string;
    reasons: string[];
}

export interface ArticleRetrievalMetadata {
    provider: ArticleRetrievalProvider;
    originalUrl: string;
    retrievedUrl: string;
    retrievedAt: string;
    archiveCapturedAt: string | null;
    attempts: ArticleRetrievalAttempt[];
}
