import type { PublicClusterListItem } from '../../../../entities/public-clusters';

import type { PublicArticlesFiltersState } from './TypesPublicArticlesFilters';

import {
    getPublicSourceCountThreshold,
    isDateInPublishedRange,
} from './publicArticlesFilterHelpers';

const getArticleSearchText = (article: PublicClusterListItem) => {
    const blockText = article.blocks
        .map((block) =>
            [
                block.title,
                block.content,
                block.sourceName,
                block.sourceUrl,
                block.authorName,
                block.stance,
            ]
                .filter(Boolean)
                .join(' '),
        )
        .join(' ');

    return [
        article.id,
        article.humanId,
        article.title,
        article.summary,
        article.humanId,
        article.mainCountry,
        blockText,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
};

const hasBlockType = (
    article: PublicClusterListItem,
    type: 'FACT' | 'CONTEXT' | 'OPINION',
) => {
    return article.blocks.some((block) => block.type === type);
};

export const filterPublicArticles = (
    articles: PublicClusterListItem[],
    filters: PublicArticlesFiltersState,
) => {
    const sourceCountThreshold = getPublicSourceCountThreshold(
        filters.sourceCount,
    );

    const filtered = articles.filter((article) => {
        const search = filters.search.trim().toLowerCase();

        const matchesSearch =
            search.length === 0 ||
            getArticleSearchText(article).includes(search);

        const matchesPublishedDate = isDateInPublishedRange(
            article.publishedAt,
            filters.publishedDate,
        );

        const sourcesCount = article._count?.articleLinks ?? 0;

        const matchesSourceCount =
            sourceCountThreshold === null ||
            sourcesCount >= sourceCountThreshold;

        const matchesBlockType =
            filters.blockType === 'ALL' ||
            (filters.blockType === 'WITH_FACTS' &&
                hasBlockType(article, 'FACT')) ||
            (filters.blockType === 'WITH_CONTEXT' &&
                hasBlockType(article, 'CONTEXT')) ||
            (filters.blockType === 'WITH_OPINIONS' &&
                hasBlockType(article, 'OPINION'));

        return (
            matchesSearch &&
            matchesPublishedDate &&
            matchesSourceCount &&
            matchesBlockType
        );
    });

    return filtered.sort((a, b) => {
        if (filters.sort === 'NEWEST') {
            return (
                new Date(b.publishedAt ?? 0).getTime() -
                new Date(a.publishedAt ?? 0).getTime()
            );
        }

        if (filters.sort === 'OLDEST') {
            return (
                new Date(a.publishedAt ?? 0).getTime() -
                new Date(b.publishedAt ?? 0).getTime()
            );
        }

        if (filters.sort === 'MOST_SOURCES') {
            return (
                (b._count?.articleLinks ?? 0) - (a._count?.articleLinks ?? 0)
            );
        }

        if (filters.sort === 'TITLE_ASC') {
            return a.title.localeCompare(b.title);
        }

        return 0;
    });
};
