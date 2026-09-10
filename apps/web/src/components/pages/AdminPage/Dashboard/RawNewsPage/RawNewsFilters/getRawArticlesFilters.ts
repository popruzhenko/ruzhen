import type { RawArticlesFilters } from '../../../../../../entities/raw-news/model/rawArticles';
import type { RawNewsFiltersState } from './TypesRawNewsFilters';

export const initialRawNewsFilters: RawNewsFiltersState = {
    search: '',
    status: 'ALL',
    contentAvailability: 'ALL',
    sourceName: 'ALL',
    fetchedDate: 'ALL',
    onlyProblematic: false,
};

export function getRawArticlesFilters(
    filters: RawNewsFiltersState,
    now = new Date(),
): RawArticlesFilters {
    const result: RawArticlesFilters = {};
    if (filters.search.trim()) result.search = filters.search.trim();
    if (filters.status !== 'ALL') result.status = filters.status;
    if (filters.contentAvailability !== 'ALL') {
        result.contentAvailability = filters.contentAvailability;
    }
    if (filters.sourceName !== 'ALL') result.sourceName = filters.sourceName;
    if (filters.onlyProblematic) result.onlyProblematic = true;
    if (filters.fetchedDate !== 'ALL') {
        const from = new Date(now);
        from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setDate(to.getDate() + 1);
        if (filters.fetchedDate === 'YESTERDAY') {
            to.setTime(from.getTime());
            from.setDate(from.getDate() - 1);
        } else if (
            filters.fetchedDate === 'LAST_7_DAYS' ||
            filters.fetchedDate === 'LAST_30_DAYS'
        ) {
            from.setDate(
                from.getDate() -
                    (filters.fetchedDate === 'LAST_7_DAYS' ? 7 : 30),
            );
        }
        result.fetchedFrom = from.toISOString();
        result.fetchedTo = to.toISOString();
    }
    return result;
}
