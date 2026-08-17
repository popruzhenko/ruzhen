import { Button } from '../../../../../ui/Button/Button';
import { DropDown } from '../../../../../ui/DropDown/DropDown';
import { Icon } from '../../../../../ui/Icon/Icon';

import type { PublicationFiltersProps } from './TypesPublicationFilters';

import './PublicationFilters.scss';
import { CLUSTER_STATUS } from '../../../../../../entities/cluster/model/clusterConstants';

const statusOptions = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'Draft', value: CLUSTER_STATUS.DRAFT },
    { label: 'Published', value: CLUSTER_STATUS.PUBLISHED },
    { label: 'Archived', value: CLUSTER_STATUS.ARCHIVED },
];

const dateOptions = [
    { label: 'All dates', value: 'ALL' },
    { label: 'Today', value: 'TODAY' },
    { label: 'Yesterday', value: 'YESTERDAY' },
    { label: 'Last 7 days', value: 'LAST_7_DAYS' },
    { label: 'Last 30 days', value: 'LAST_30_DAYS' },
];

const sourceCountOptions = [
    { label: 'Any sources', value: 'ALL' },
    { label: '2+ articles', value: 'GTE_2' },
    { label: '3+ articles', value: 'GTE_3' },
    { label: '5+ articles', value: 'GTE_5' },
    { label: '10+ articles', value: 'GTE_10' },
];

export const PublicationFilters = ({
    filters,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onChange,
    onClear,
}: PublicationFiltersProps) => {
    return (
        <section className="publication_filters">
            <div className="publication_filters__header">
                <div>
                    <h3>Filters</h3>

                    <span className="publication_filters__counter">
                        Showing {filteredCount} of {totalCount} articles
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

            <div className="publication_filters__body">
                <label className="publication_filters__search">
                    <span>Search</span>

                    <input
                        value={filters.search}
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                        placeholder="Search title, summary, ID..."
                    />
                </label>

                <div className="publication_filters__select">
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

                <div className="publication_filters__select">
                    <span>Updated</span>

                    <DropDown
                        label="Updated"
                        options={dateOptions}
                        value={filters.updatedDate}
                        onChange={(value) =>
                            onChange(
                                'updatedDate',
                                value as typeof filters.updatedDate,
                            )
                        }
                    />
                </div>

                <div className="publication_filters__select">
                    <span>Sources</span>

                    <DropDown
                        label="Sources"
                        options={sourceCountOptions}
                        value={filters.sourceCount}
                        onChange={(value) =>
                            onChange(
                                'sourceCount',
                                value as typeof filters.sourceCount,
                            )
                        }
                    />
                </div>
            </div>
        </section>
    );
};
