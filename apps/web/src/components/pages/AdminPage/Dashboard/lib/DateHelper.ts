import { type RawNewsDateFilter } from '../RawNewsPage/RawNewsFilters/TypesRawNewsFilters';

const getStartOfDay = (date: Date) => {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
};

const getEndOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
};

export const isDateInFetchedRange = (
    dateValue: string | null | undefined,
    filter: RawNewsDateFilter,
) => {
    if (filter === 'ALL') {
        return true;
    }

    if (!dateValue) {
        return false;
    }

    const articleDate = new Date(dateValue);

    if (Number.isNaN(articleDate.getTime())) {
        return false;
    }

    const now = new Date();

    if (filter === 'TODAY') {
        return (
            articleDate >= getStartOfDay(now) && articleDate <= getEndOfDay(now)
        );
    }

    if (filter === 'YESTERDAY') {
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        return (
            articleDate >= getStartOfDay(yesterday) &&
            articleDate <= getEndOfDay(yesterday)
        );
    }

    if (filter === 'LAST_7_DAYS') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);

        return articleDate >= start && articleDate <= now;
    }

    if (filter === 'LAST_30_DAYS') {
        const start = new Date(now);
        start.setDate(now.getDate() - 30);
        start.setHours(0, 0, 0, 0);

        return articleDate >= start && articleDate <= now;
    }

    return true;
};

export default isDateInFetchedRange;
