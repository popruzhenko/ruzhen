import { Button } from '../../../../../ui/Button/Button';
import { DropDown } from '../../../../../ui/DropDown/DropDown';
import type { RawNewsFiltersProps } from './TypesRawNewsFilters';
import './RawNewsFilters.scss';
import { Icon } from '../../../../../ui/Icon/Icon';

const statusOptions = [
    { label: 'All statuses', value: 'ALL' },
    { label: 'New', value: 'NEW' },
    { label: 'Needs review', value: 'NEEDS_REVIEW' },
    { label: 'Reviewed', value: 'REVIEWED' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Embedded', value: 'EMBEDDED' },
    { label: 'Clustered', value: 'CLUSTERED' },
];

const contentOptions = [
    { label: 'All content', value: 'ALL' },
    { label: 'Full text', value: 'FULL_TEXT' },
    { label: 'Partial text', value: 'PARTIAL_TEXT' },
    { label: 'Summary only', value: 'SUMMARY_ONLY' },
    { label: 'Title only', value: 'TITLE_ONLY' },
    { label: 'Preview only', value: 'PREVIEW_ONLY' },
];

const dateOptions = [
    { label: 'All dates', value: 'ALL' },
    { label: 'Today', value: 'TODAY' },
    { label: 'Yesterday', value: 'YESTERDAY' },
    { label: 'Last 7 days', value: 'LAST_7_DAYS' },
    { label: 'Last 30 days', value: 'LAST_30_DAYS' },
];

export const RawNewsFilters = ({
    filters,
    sourceOptions,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onChange,
    onClear,
    onFetchNewArticles,
    isFetchingNewArticles = false,
}: RawNewsFiltersProps) => {
    return (
        <section className="raw_news_filters">
            <div className="raw_news_filters__header">
                <div>
                    <h2>Filters</h2>

                    <p>Find, review and prepare raw articles for clustering.</p>

                    <span className="raw_news_filters__counter">
                        Showing {filteredCount} of {totalCount} articles
                    </span>
                </div>

                <Button
                    type="button"
                    onClick={onFetchNewArticles}
                    disabled={isFetchingNewArticles}
                >
                    {isFetchingNewArticles
                        ? 'Fetching...'
                        : 'Fetch new articles'}
                </Button>
            </div>

            <div className="raw_news_filters__body">
                <label className="raw_news_filters__search">
                    <span>Search</span>

                    <input
                        value={filters.search}
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                        placeholder="Search title, source, URL, ID..."
                    />
                </label>

                <div className="raw_news_filters__select">
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

                <div className="raw_news_filters__select">
                    <span>Content</span>

                    <DropDown
                        label="Content"
                        options={contentOptions}
                        value={filters.contentAvailability}
                        onChange={(value) =>
                            onChange(
                                'contentAvailability',
                                value as typeof filters.contentAvailability,
                            )
                        }
                    />
                </div>

                <div className="raw_news_filters__select">
                    <span>Source</span>

                    <DropDown
                        label="Source"
                        options={sourceOptions}
                        value={filters.sourceName}
                        onChange={(value) => onChange('sourceName', value)}
                    />
                </div>

                <div className="raw_news_filters__select">
                    <span>Fetched date</span>

                    <DropDown
                        label="Fetched date"
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

                <label className="raw_news_filters__checkbox">
                    <input
                        type="checkbox"
                        checked={filters.onlyProblematic}
                        onChange={(event) =>
                            onChange('onlyProblematic', event.target.checked)
                        }
                    />

                    <span>Only problematic</span>
                </label>

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
        </section>
    );
};
