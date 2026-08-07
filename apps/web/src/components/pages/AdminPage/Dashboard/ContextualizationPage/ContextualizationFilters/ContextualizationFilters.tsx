import { Button } from '../../../../../ui/Button/Button';
import { DropDown } from '../../../../../ui/DropDown/DropDown';
import type { ContextualizationFiltersProps } from './TypesContextualizationFilters';
import './ContextualizationFilters.scss';
import { Icon } from '../../../../../ui/Icon/Icon';

const statusOptions = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'Draft', value: 'DRAFT' },
    { label: 'Published', value: 'PUBLISHED' },
    { label: 'Archived', value: 'ARCHIVED' },
];

const draftStateOptions = [
    { label: 'All drafts', value: 'ALL' },
    { label: 'Without blocks', value: 'WITHOUT_BLOCKS' },
    { label: 'With blocks', value: 'WITH_BLOCKS' },
    { label: 'Ready to review', value: 'READY_TO_REVIEW' },
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

export const ContextualizationFilters = ({
    filters,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onChange,
    onClear,
}: ContextualizationFiltersProps) => {
    return (
        <section className="contextualization_filters">
            <div className="contextualization_filters__header">
                <div>
                    <h3>Filters</h3>

                    <span className="contextualization_filters__counter">
                        Showing {filteredCount} of {totalCount} clusters
                    </span>
                </div>

                <Button
                    type="button"
                    variants="secondary"
                    onClick={onClear}
                    disabled={!hasActiveFilters}
                    leftIcon={<Icon name='trash'></Icon>}
                >
                    Clear
                </Button>
            </div>

            <div className="contextualization_filters__body">
                <label className="contextualization_filters__search">
                    <span>Search</span>

                    <input
                        value={filters.search}
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                        placeholder="Search title, summary, ID..."
                    />
                </label>
                <div className="contextualization_filters__select">
                    <span>Status</span>

                    <DropDown
                        label="Status"
                        options={statusOptions}
                        value={filters.status}
                        onChange={(value) =>
                            onChange(
                                'status',
                                value as typeof filters.status,
                            )
                        }
                    />
                </div>

                <div className="contextualization_filters__select">
                    <span>Draft state</span>

                    <DropDown
                        label="Draft state"
                        options={draftStateOptions}
                        value={filters.draftState}
                        onChange={(value) =>
                            onChange(
                                'draftState',
                                value as typeof filters.draftState,
                            )
                        }
                    />
                </div>

                <div className="contextualization_filters__select">
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

                <div className="contextualization_filters__select">
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