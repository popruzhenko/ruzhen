import type {
    PublicArticlesPublishedDateFilter,
    PublicArticlesSourceCountFilter,
} from './TypesPublicArticlesFilters';

export const getPublishedDateRange = (
    filter: PublicArticlesPublishedDateFilter,
    now = new Date(),
): { publishedFrom?: string; publishedTo?: string } => {
    if (filter === 'ALL') {
        return {};
    }

    // Send the reader's local calendar boundaries, independent of server timezone.
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    if (filter === 'YESTERDAY') {
        to.setDate(to.getDate() - 1);
        from.setDate(from.getDate() - 1);
    } else if (filter === 'LAST_7_DAYS') {
        from.setDate(from.getDate() - 7);
    } else if (filter === 'LAST_30_DAYS') {
        from.setDate(from.getDate() - 30);
    }

    return {
        publishedFrom: from.toISOString(),
        publishedTo: to.toISOString(),
    };
};

export const getPublicSourceCountThreshold = (
    filter: PublicArticlesSourceCountFilter,
): number | null => {
    if (filter === 'GTE_2') {
        return 2;
    }

    if (filter === 'GTE_3') {
        return 3;
    }

    if (filter === 'GTE_5') {
        return 5;
    }

    if (filter === 'GTE_10') {
        return 10;
    }

    return null;
};
