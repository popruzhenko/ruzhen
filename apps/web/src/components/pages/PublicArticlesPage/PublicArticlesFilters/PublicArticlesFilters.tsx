import { Button } from '../../../ui/Button/Button';
import { DropDown } from '../../../ui/DropDown/DropDown';
import { Icon } from '../../../ui/Icon/Icon';

import type {
    PublicArticlesBlockTypeFilter,
    PublicArticlesFiltersProps,
    PublicArticlesPublishedDateFilter,
    PublicArticlesSortFilter,
    PublicArticlesSourceCountFilter,
} from './TypesPublicArticlesFilters';

import './PublicArticlesFilters.scss';

const publishedDateOptions: {
    label: string;
    value: PublicArticlesPublishedDateFilter;
}[] = [
    { label: 'All dates', value: 'ALL' },
    { label: 'Today', value: 'TODAY' },
    { label: 'Yesterday', value: 'YESTERDAY' },
    { label: 'Last 7 days', value: 'LAST_7_DAYS' },
    { label: 'Last 30 days', value: 'LAST_30_DAYS' },
];

const sourceCountOptions: {
    label: string;
    value: PublicArticlesSourceCountFilter;
}[] = [
    { label: 'Any sources', value: 'ALL' },
    { label: '2+ sources', value: 'GTE_2' },
    { label: '3+ sources', value: 'GTE_3' },
    { label: '5+ sources', value: 'GTE_5' },
    { label: '10+ sources', value: 'GTE_10' },
];

const blockTypeOptions: {
    label: string;
    value: PublicArticlesBlockTypeFilter;
}[] = [
    { label: 'All blocks', value: 'ALL' },
    { label: 'With facts', value: 'WITH_FACTS' },
    { label: 'With context', value: 'WITH_CONTEXT' },
    { label: 'With opinions', value: 'WITH_OPINIONS' },
];

const sortOptions: {
    label: string;
    value: PublicArticlesSortFilter;
}[] = [
    { label: 'Newest first', value: 'NEWEST' },
    { label: 'Oldest first', value: 'OLDEST' },
    { label: 'Most sources', value: 'MOST_SOURCES' },
    { label: 'Title A-Z', value: 'TITLE_ASC' },
];

export const PublicArticlesFilters = ({
    filters,
    totalCount,
    filteredCount,
    hasActiveFilters,
    onChange,
    onClear,
}: PublicArticlesFiltersProps) => {
    return (
        <section className="public_articles_filters">
            <div className="public_articles_filters__header">
                <div>
                    <h3>Filters</h3>

                    <span className="public_articles_filters__counter">
                        Showing {filteredCount} of {totalCount} articles
                    </span>
                </div>

                <Button
                    variants="secondary"
                    onClick={onClear}
                    disabled={!hasActiveFilters}
                    leftIcon={<Icon name='trash'></Icon>}
                >
                    Clear
                </Button>
            </div>

            <div className="public_articles_filters__body">
                <label className="public_articles_filters__search">
                    <span>Search</span>

                    <input
                        value={filters.search}
                        onChange={(event) =>
                            onChange('search', event.target.value)
                        }
                        placeholder="Search title, summary, source, ID..."
                    />
                </label>

                <label className="public_articles_filters__select">
                    <span>Published</span>

                    <DropDown
                        label='Published date'
                        value={filters.publishedDate}
                        options={publishedDateOptions}
                        onChange={(value) =>
                            onChange(
                                'publishedDate',
                                value as PublicArticlesPublishedDateFilter,
                            )
                        }
                    />
                </label>

                <label className="public_articles_filters__select">
                    <span>Sources</span>

                    <DropDown
                        label='Source count'
                        value={filters.sourceCount}
                        options={sourceCountOptions}
                        onChange={(value) =>
                            onChange(
                                'sourceCount',
                                value as PublicArticlesSourceCountFilter,
                            )
                        }
                    />
                </label>

                <label className="public_articles_filters__select">
                    <span>Blocks</span>

                    <DropDown
                        label='Block type'
                        value={filters.blockType}
                        options={blockTypeOptions}
                        onChange={(value) =>
                            onChange(
                                'blockType',
                                value as PublicArticlesBlockTypeFilter,
                            )
                        }
                    />
                </label>

                <label className="public_articles_filters__select">
                    <span>Sort</span>

                    <DropDown
                        label='Sort'
                        value={filters.sort}
                        options={sortOptions}
                        onChange={(value) =>
                            onChange('sort', value as PublicArticlesSortFilter)
                        }
                    />
                </label>
            </div>
        </section>
    );
};