import { type ClusteringFiltersState } from '../ClusteringPage/ClusteringFilters/TypesClusteringFilters';

export const getSimilarityThreshold = (
    filter: ClusteringFiltersState['similarity'],
) => {
    if (filter === 'GT_070') return 0.7;
    if (filter === 'GT_075') return 0.75;
    if (filter === 'GT_080') return 0.8;
    if (filter === 'GT_085') return 0.85;

    return null;
};
