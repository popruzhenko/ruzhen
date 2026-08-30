import type { PublicArticlesFiltersState } from './TypesPublicArticlesFilters';

export const initialPublicArticlesFilters: PublicArticlesFiltersState = {
    search: '',
    publishedDate: 'ALL',
    sourceCount: 'ALL',
    blockType: 'ALL',
    sort: 'NEWEST',
};

export const hasActivePublicArticlesFilters = (
    filters: PublicArticlesFiltersState,
) => {
    return (
        filters.search.trim() !== '' ||
        filters.publishedDate !== 'ALL' ||
        filters.sourceCount !== 'ALL' ||
        filters.blockType !== 'ALL' ||
        filters.sort !== 'NEWEST'
    );
};
