import type { GetPublicClustersParams } from '../../../../entities/public-clusters';
import type { PublicArticlesFiltersState } from './TypesPublicArticlesFilters';
import {
    getPublishedDateRange,
    getPublicSourceCountThreshold,
} from './publicArticlesFilterHelpers';

const blockTypes = {
    ALL: undefined,
    WITH_FACTS: 'FACT',
    WITH_CONTEXT: 'CONTEXT',
    WITH_OPINIONS: 'OPINION',
} as const;

export const getPublicArticlesQueryParams = (
    filters: PublicArticlesFiltersState,
    page: number,
    limit: number,
): GetPublicClustersParams => ({
    page,
    limit,
    search: filters.search.trim() || undefined,
    ...getPublishedDateRange(filters.publishedDate),
    minSources: getPublicSourceCountThreshold(filters.sourceCount) ?? undefined,
    blockType: blockTypes[filters.blockType],
    sort: filters.sort,
});
