import { DropDown } from '../../../../../ui/DropDown/DropDown';
import { Button } from '../../../../../ui/Button/Button';
import { Icon } from '../../../../../ui/Icon/Icon';

import type {
    ClusterListFiltersState,
    ClusterListFilterSort,
    ClusterListFilterStatus,
} from './TypesClusterListFilters';

import './ClusterListFilters.scss';

interface ClusterListFiltersProps {
    filters: ClusterListFiltersState;
    totalCount: number;
    filteredCount: number;
    hasActiveFilters: boolean;
    onChange: <K extends keyof ClusterListFiltersState>(
        key: K,
        value: ClusterListFiltersState[K],
    ) => void;
    onClear: () => void;
}

const statusOptions: Array<{
    label: string;
    value: ClusterListFilterStatus;
}> = [
    { label: 'All', value: 'ALL' },
    { label: 'Candidates', value: 'CANDIDATE' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Updated', value: 'UPDATED' },
    { label: 'Published', value: 'PUBLISHED' },
    { label: 'Archived', value: 'ARCHIVED' },
];

const sortOptions: Array<{
    label: string;
    value: ClusterListFilterSort;
}> = [
    { label: 'Newest', value: 'NEWEST' },
    { label: 'Oldest', value: 'OLDEST' },
    { label: 'Title A-Z', value: 'TITLE_ASC' },
    { label: 'Most articles', value: 'ARTICLES_DESC' },
    { label: 'Similarity high', value: 'SIMILARITY_DESC' },
];

export const ClusterListFilters = ({
    filters,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onChange,
    onClear,
}: ClusterListFiltersProps) => {
    return (
        <section className="cluster_list_filters">
            <div className="cluster_list_filters__header">
                <div>
                    <h3>Cluster filters</h3>

                    <span className="cluster_list_filters__counter">
                        Showing {filteredCount} of {totalCount}
                    </span>
                </div>

                <Button
                    type="button"
                    variants="secondary"
                    onClick={onClear}
                    disabled={!hasActiveFilters}
                    leftIcon={<Icon name="trash" />}
                >
                    Clear
                </Button>
            </div>

            <div className="cluster_list_filters__body">
                <label className="cluster_list_filters__search cluster_list_filters__search--wide">
                    <span>Search</span>

                    <input
                        type="search"
                        value={filters.search}
                        placeholder="Title, summary, id, source, article..."
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                    />
                </label>

                <div className="cluster_list_filters__select">
                    <span>Status</span>

                    <DropDown
                        label="Status"
                        options={statusOptions}
                        value={filters.status}
                        onChange={(value) =>
                            onChange('status', value as ClusterListFilterStatus)
                        }
                    />
                </div>

                <div className="cluster_list_filters__select">
                    <span>Sort</span>

                    <DropDown
                        label="Sort"
                        options={sortOptions}
                        value={filters.sort}
                        onChange={(value) =>
                            onChange('sort', value as ClusterListFilterSort)
                        }
                    />
                </div>
            </div>
        </section>
    );
};
