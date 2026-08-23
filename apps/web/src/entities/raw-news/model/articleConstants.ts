export const ARTICLE_STATUS = {
    NEW: 'NEW',
    NEEDS_REVIEW: 'NEEDS_REVIEW',
    REVIEWED: 'REVIEWED',
    EMBEDDED: 'EMBEDDED',
    CLUSTERED: 'CLUSTERED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;

export type ClusteringArticleStatus =
    | typeof ARTICLE_STATUS.APPROVED
    | typeof ARTICLE_STATUS.EMBEDDED
    | typeof ARTICLE_STATUS.CLUSTERED;

export function isClusteringArticleStatus(
    status: ArticleStatus,
): status is ClusteringArticleStatus {
    return (
        status === ARTICLE_STATUS.APPROVED ||
        status === ARTICLE_STATUS.EMBEDDED ||
        status === ARTICLE_STATUS.CLUSTERED
    );
}

export type ArticleStatus =
    (typeof ARTICLE_STATUS)[keyof typeof ARTICLE_STATUS];

export const CONTENT_AVAILABILITY = {
    FULL_TEXT: 'FULL_TEXT',
    PARTIAL_TEXT: 'PARTIAL_TEXT',
    SUMMARY_ONLY: 'SUMMARY_ONLY',
    TITLE_ONLY: 'TITLE_ONLY',
    PREVIEW_ONLY: 'PREVIEW_ONLY',
} as const;

export type ContentAvailability =
    (typeof CONTENT_AVAILABILITY)[keyof typeof CONTENT_AVAILABILITY];
