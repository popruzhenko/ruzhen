import type { ArticleApiItem, RawNewsFeedItem } from '../model/types';

export function mapArticleToRawNewsItem(
    article: ArticleApiItem,
): RawNewsFeedItem {
    return {
        id: article.id,
        sourceId: article.sourceId,
        url: article.url,

        title: article.title ?? 'Untitled article',
        summary: article.summary ?? null,
        content: article.content ?? null,
        preview: buildArticlePreview(article),
        imageUrl: article.imageUrl,

        status: article.status,

        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        publishedAt: article.publishedAt,
        fetchedAt: article.raw?.fetchedAt ?? null,

        sourceName: article.source?.name ?? 'Unknown source',
        sourceBaseUrl: article.source?.baseUrl ?? null,

        country: article.country ?? 'Unknown',
        language: article.language ?? 'Unknown',

        embedding: article.embedding ?? [0],

        contentAvailability: article.contentAvailability ?? 'Unknown',
        embeddingBasis: article.embeddingBasis ?? '—',
        cleaningMethod: article.cleaningMethod ?? '—',
        embeddingModel: article.embeddingModel ?? '—',

        parserVersion: article.raw?.parserVersion ?? '—',

        clusterLinksCount: article._count.clusterLinks,
        clusterCandidatesCount: article._count.clusterCandidates,

        pipeline: {
            fetched: Boolean(article.raw?.fetchedAt),
            cleaned: Boolean(article.cleanedAccessibleText),
            embedded:
                article.status === 'EMBEDDED' || article.status === 'CLUSTERED',
            clustered:
                article.status === 'CLUSTERED' ||
                article._count.clusterLinks > 0,
        },
    };
}

function buildArticlePreview(article: ArticleApiItem): string {
    const text =
        article.summary ||
        article.cleanedAccessibleText ||
        article.content ||
        '';

    const normalizedText = text.trim();

    if (!normalizedText) {
        return 'No article text available.';
    }

    if (normalizedText.length <= 260) {
        return normalizedText;
    }

    return `${normalizedText.slice(0, 260)}...`;
}
