import { DropDown } from '../../../../../ui/DropDown/DropDown';
import { Button } from '../../../../../ui/Button/Button';
import type { ClusteringFiltersProps } from './TypesClusteringFilters';
import './ClusteringFilters.scss';
import { Icon } from '../../../../../ui/Icon/Icon';

const dateOptions = [
    { label: 'All dates', value: 'ALL' },
    { label: 'Today', value: 'TODAY' },
    { label: 'Yesterday', value: 'YESTERDAY' },
    { label: 'Last 7 days', value: 'LAST_7_DAYS' },
    { label: 'Last 30 days', value: 'LAST_30_DAYS' },
];

const statusOptions = [
    { label: 'Ready for clustering', value: 'READY_FOR_CLUSTERING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Embedded', value: 'EMBEDDED' },
    { label: 'Clustered', value: 'CLUSTERED' },
    { label: 'All statuses', value: 'ALL' },
];

const embeddingOptions = [
    { label: 'All embeddings', value: 'ALL' },
    { label: 'With embedding', value: 'WITH_EMBEDDING' },
    { label: 'Without embedding', value: 'WITHOUT_EMBEDDING' },
];

const similarityOptions = [
    { label: 'Any similarity', value: 'ALL' },
    { label: '> 0.70', value: 'GT_070' },
    { label: '> 0.75', value: 'GT_075' },
    { label: '> 0.80', value: 'GT_080' },
    { label: '> 0.85', value: 'GT_085' },
];

const sortOptions = [
    { label: 'Newest first', value: 'NEWEST' },
    { label: 'Oldest first', value: 'OLDEST' },
    { label: 'Similarity high', value: 'SIMILARITY_DESC' },
    { label: 'Similarity low', value: 'SIMILARITY_ASC' },
    { label: 'Title A-Z', value: 'TITLE_ASC' },
];

export const ClusteringFilters = ({
    filters,
    sourceOptions,
    totalCount,
    filteredCount,
    selectedCount,
    hasActiveFilters,
    onChange,
    onClear,
}: ClusteringFiltersProps) => {
    return (
        <section className="clustering_filters">
            <div className="clustering_filters__header">
                <div>
                    <h3>Filters</h3>

                    <span className="clustering_filters__counter">
                        Showing {filteredCount} of {totalCount} articles
                    </span>

                    <span className="clustering_filters__selected">
                        Selected: {selectedCount}
                    </span>
                </div>

                <Button
                    type="button"
                    variants="secondary"
                    onClick={onClear}
                    disabled={!hasActiveFilters}
                    leftIcon={<Icon name="trash"></Icon>}
                >
                    Clear
                </Button>
            </div>
            <div className="clustering_filters__body">
                <label className="clustering_filters__search">
                    <span>Search</span>

                    <input
                        value={filters.search}
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                        placeholder="Search title, source, ID..."
                    />
                </label>
                <div className="clustering_filters__select">
                    <span>Date</span>

                    <DropDown
                        label="Date"
                        options={dateOptions}
                        value={filters.fetchedDate}
                        onChange={(value) =>
                            onChange(
                                'fetchedDate',
                                value as typeof filters.fetchedDate,
                            )
                        }
                    />
                </div>

                <div className="clustering_filters__select">
                    <span>Source</span>

                    <DropDown
                        label="Source"
                        options={sourceOptions}
                        value={filters.sourceName}
                        onChange={(value) => onChange('sourceName', value)}
                    />
                </div>

                <div className="clustering_filters__select">
                    <span>Status</span>

                    <DropDown
                        label="Status"
                        options={statusOptions}
                        value={filters.status}
                        onChange={(value) =>
                            onChange('status', value as typeof filters.status)
                        }
                    />
                </div>

                <div className="clustering_filters__select">
                    <span>Embedding</span>

                    <DropDown
                        label="Embedding"
                        options={embeddingOptions}
                        value={filters.embedding}
                        onChange={(value) =>
                            onChange(
                                'embedding',
                                value as typeof filters.embedding,
                            )
                        }
                    />
                </div>

                <div className="clustering_filters__select">
                    <span>Similarity</span>

                    <DropDown
                        label="Similarity"
                        options={similarityOptions}
                        value={filters.similarity}
                        onChange={(value) =>
                            onChange(
                                'similarity',
                                value as typeof filters.similarity,
                            )
                        }
                    />
                </div>

                <div className="clustering_filters__select clustering_filters__select--wide">
                    <span>Sort</span>

                    <DropDown
                        label="Sort"
                        options={sortOptions}
                        value={filters.sort}
                        onChange={(value) =>
                            onChange('sort', value as typeof filters.sort)
                        }
                    />
                </div>

                <label className="clustering_filters__checkbox">
                    <input
                        type="checkbox"
                        checked={filters.onlySelected}
                        onChange={(event) =>
                            onChange('onlySelected', event.target.checked)
                        }
                    />

                    <span>Selected only</span>
                </label>
            </div>
        </section>
    );
};
