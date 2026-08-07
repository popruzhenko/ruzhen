import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { usePublicClustersQuery } from '../../../entities/public-clusters';

import { UserLayout } from '../../layouts/UserLayout/UserLayout';
import { PageState } from '../../ui/PageState/PageState';
import { Pagination } from '../../ui/Pagination/Pagination';

import { PublicArticleCard } from '../PublicArticlesPage/PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from '../PublicArticlesPage/PublicArticlesFilters/PublicArticlesFilters';

import type { PublicArticlesFiltersState } from '../PublicArticlesPage/PublicArticlesFilters/TypesPublicArticlesFilters';

import { filterPublicArticles } from '../PublicArticlesPage/PublicArticlesFilters/filterPublicArticles';

import {
    hasActivePublicArticlesFilters,
    initialPublicArticlesFilters,
} from '../PublicArticlesPage/PublicArticlesFilters/publicArticlesFiltersConfig';

import './UserPage.scss';

const DEFAULT_LIMIT = 10;

const getPageFromSearchParams = (value: string | null) => {
    const page = Number(value);

    if (!Number.isFinite(page) || page < 1) {
        return 1;
    }

    return page;
};

export const UserPage = () => {
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
    const articles = data?.items ?? [];
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
            <UserLayout>
                <PageState
                    variant="loading"
                    title="Loading your news feed"
                    description="Please wait while Ruzhen loads the latest published materials."
                />
            </UserLayout>
        );
    }

    if (publicClustersQuery.isError) {
        return (
            <UserLayout>
                <PageState
                    variant="error"
                    title="Failed to load your news feed"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void publicClustersQuery.refetch();
                    }}
                />
            </UserLayout>
        );
    }

    return (
        <UserLayout>
            <div className="user-page">
                <section className="user-page__hero">
                    <div>
                        <span className="user-page__eyebrow">
                            Personal news feed
                        </span>

                        <h1>Your Ruzhen feed</h1>

                        <p>
                            Read published materials in a structured format:
                            facts, context and opinions are separated so you can
                            understand the event without unnecessary noise.
                        </p>
                    </div>
                </section>

                {articles.length === 0 ? (
                    <PageState
                        variant="empty"
                        title="No published articles yet"
                        description="Published articles will appear here after editorial review."
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
                                <div className="user-page__list">
                                    {filteredArticles.map((article) => (
                                        <PublicArticleCard
                                            key={article.id}
                                            article={article}
                                            detailsBasePath="/articles"
                                        />
                                    ))}
                                </div>

                                {pagination && pagination.totalPages > 1 && (
                                    <Pagination
                                        className="user-page__pagination"
                                        page={pagination.page}
                                        totalPages={pagination.totalPages}
                                        hasNextPage={pagination.hasNextPage}
                                        hasPreviousPage={
                                            pagination.hasPreviousPage
                                        }
                                        onPageChange={handlePageChange}
                                    />
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </UserLayout>
    );
};