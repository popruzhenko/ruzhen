import type {
    ArticleRetrievalAttempt,
    ArticleRetrievalProvider,
} from './articleRetrievalTypes';

const providerLabels: Record<ArticleRetrievalProvider, string> = {
    PUBLISHER_HTTP: 'Publisher HTML',
    PUBLISHER_BROWSER: 'Publisher browser',
    ARCHIVE_TODAY: 'Archive',
};

export function formatArticleRetrievalAttempts(
    attempts: ArticleRetrievalAttempt[],
): string {
    return attempts
        .map(
            (attempt) =>
                `${providerLabels[attempt.provider]}: ${attempt.outcome}${attempt.reasons.length ? ` (${attempt.reasons.join(', ').slice(0, 400)})` : ''}`,
        )
        .join('; ');
}
