import { type ContextualizationFiltersState } from '../ContextualizationPage/ContextualizationFilters/TypesContextualizationFilters'

export const getSourceCountThreshold = (
    value: ContextualizationFiltersState['sourceCount'],
): number | null => {
    if (value === 'GTE_2') return 2;
    if (value === 'GTE_3') return 3;
    if (value === 'GTE_5') return 5;
    if (value === 'GTE_10') return 10;

    return null;
};