import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    usePublicClustersQuery,
    type PublicClusterListItem,
} from '../../../../../entities/public-clusters';

import { Pagination } from '../../../../ui/Pagination/Pagination';
import { PageState } from '../../../../ui/PageState/PageState';

import { PublicArticleCard } from '../../../PublicArticlesPage/PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from '../../../PublicArticlesPage/PublicArticlesFilters/PublicArticlesFilters';

import type { PublicArticlesFiltersState } from '../../../PublicArticlesPage/PublicArticlesFilters/TypesPublicArticlesFilters';

import { filterPublicArticles } from '../../../PublicArticlesPage/PublicArticlesFilters/filterPublicArticles';

import {
    hasActivePublicArticlesFilters,
    initialPublicArticlesFilters,
} from '../../../PublicArticlesPage/PublicArticlesFilters/publicArticlesFiltersConfig';

import './PublicArticlesPreviewPage.scss';

const DEFAULT_LIMIT = 10;

const getPageFromSearchParams = (value: string | null) => {
    const page = Number(value);

    if (!Number.isFinite(page) || page < 1) {
        return 1;
    }

    return page;
};

export const PublicArticlesPreviewPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    const [filters, setFilters] = useState<PublicArticlesFiltersState>(
        initialPublicArticlesFilters,
    );

    const page = getPageFromSearchParams(searchParams.get('page'));

    const publicClustersQuery = usePublicClustersQuery({
        page,
        limit: DEFAULT_LIMIT,
    });

    const data = publicClustersQuery.data;
    const EMPTY_ARTICLES: PublicClusterListItem[] = [];
    const articles = data?.items ?? EMPTY_ARTICLES;
    const pagination = data?.pagination;

    const filteredArticles = useMemo(() => {
        return filterPublicArticles(articles, filters);
    }, [articles, filters]);

    const hasActiveFilters = hasActivePublicArticlesFilters(filters);

    const handlePageChange = (nextPage: number) => {
        setSearchParams({
            page: String(nextPage),
        });

        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    const handleChangeFilter = <K extends keyof PublicArticlesFiltersState>(
        key: K,
        value: PublicArticlesFiltersState[K],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearFilters = () => {
        setFilters(initialPublicArticlesFilters);
    };

    if (publicClustersQuery.isLoading) {
        return (
            <div className="admin-public-articles">
                <PageState
                    variant="loading"
                    title="Loading published articles"
                    description="Please wait while Ruzhen loads public article previews."
                />
            </div>
        );
    }

    if (publicClustersQuery.isError) {
        return (
            <div className="admin-public-articles">
                <PageState
                    variant="error"
                    title="Failed to load published articles"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void publicClustersQuery.refetch();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="admin-public-articles">
            {articles.length === 0 ? (
                <PageState
                    variant="empty"
                    title="No published articles yet"
                    description="Publish articles from the Publication section and they will appear here."
                    actionLabel="Go to publication"
                    actionTo="/admin/publication"
                />
            ) : (
                <>
                    <PublicArticlesFilters
                        filters={filters}
                        totalCount={articles.length}
                        filteredCount={filteredArticles.length}
                        hasActiveFilters={hasActiveFilters}
                        onChange={handleChangeFilter}
                        onClear={handleClearFilters}
                    />

                    {filteredArticles.length === 0 ? (
                        <PageState
                            variant="empty"
                            title="No articles match filters"
                            description="Try changing search, date, source count or block filters."
                            actionLabel="Clear filters"
                            onAction={handleClearFilters}
                        />
                    ) : (
                        <>
                            <div className="admin-public-articles__list">
                                {filteredArticles.map((article) => (
                                    <PublicArticleCard
                                        key={article.id}
                                        article={article}
                                        detailsBasePath="/admin/public-articles"
                                    />
                                ))}
                            </div>

                            {pagination && pagination.totalPages > 1 && (
                                <Pagination
                                    className="admin-public-articles__pagination"
                                    page={pagination.page}
                                    totalPages={pagination.totalPages}
                                    hasNextPage={pagination.hasNextPage}
                                    hasPreviousPage={pagination.hasPreviousPage}
                                    onPageChange={handlePageChange}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
};
