import type {
    PublicArticlesPublishedDateFilter,
    PublicArticlesSourceCountFilter,
} from './TypesPublicArticlesFilters';

export const isDateInPublishedRange = (
    value: string | null | undefined,
    filter: PublicArticlesPublishedDateFilter,
): boolean => {
    if (filter === 'ALL') {
        return true;
    }

    if (!value) {
        return false;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const now = new Date();

    const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );

    const startOfTargetDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );

    const diffMs = startOfToday.getTime() - startOfTargetDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (filter === 'TODAY') {
        return diffDays === 0;
    }

    if (filter === 'YESTERDAY') {
        return diffDays === 1;
    }

    if (filter === 'LAST_7_DAYS') {
        return diffDays >= 0 && diffDays <= 7;
    }

    if (filter === 'LAST_30_DAYS') {
        return diffDays >= 0 && diffDays <= 30;
    }

    return true;
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
