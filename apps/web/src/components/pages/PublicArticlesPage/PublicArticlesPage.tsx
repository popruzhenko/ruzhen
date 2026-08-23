import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
    usePublicClustersQuery,
    type PublicClusterListItem,
} from '../../../entities/public-clusters';

import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { Pagination } from '../../ui/Pagination/Pagination';
import { PageState } from '../../ui/PageState/PageState';

import { PublicArticleCard } from './PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from './PublicArticlesFilters/PublicArticlesFilters';

import type { PublicArticlesFiltersState } from './PublicArticlesFilters/TypesPublicArticlesFilters';

import { filterPublicArticles } from './PublicArticlesFilters/filterPublicArticles';

import {
    hasActivePublicArticlesFilters,
    initialPublicArticlesFilters,
} from './PublicArticlesFilters/publicArticlesFiltersConfig';

import './PublicArticlesPage.scss';

const DEFAULT_LIMIT = 10;

const getPageFromSearchParams = (value: string | null) => {
    const page = Number(value);

    if (!Number.isFinite(page) || page < 1) {
        return 1;
    }

    return page;
};

export const PublicArticlesPage = () => {
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
            <ReadableLayout>
                <PageState
                    variant="loading"
                    title="Loading published articles"
                    description="Please wait while Ruzhen loads the latest published materials."
                />
            </ReadableLayout>
        );
    }

    if (publicClustersQuery.isError) {
        return (
            <ReadableLayout>
                <PageState
                    variant="error"
                    title="Failed to load published articles"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void publicClustersQuery.refetch();
                    }}
                />
            </ReadableLayout>
        );
    }

    return (
        <ReadableLayout>
            <div className="public-articles-page">
                <section className="public-articles-page__hero">
                    <div>
                        <span className="public-articles-page__eyebrow">
                            Structured news intelligence
                        </span>

                        <h1>Latest analysis</h1>

                        <p>
                            Ruzhen separates what happened, why it matters, and
                            how different sides interpret it — without mixing
                            facts, context and opinions.
                        </p>
                    </div>

                    <aside className="public-articles-page__format-card">
                        <span>Reading format</span>

                        <div>
                            <strong>Facts</strong>
                            <p>Verified event-level information.</p>
                        </div>

                        <div>
                            <strong>Context</strong>
                            <p>Background, timeline and causes.</p>
                        </div>

                        <div>
                            <strong>Opinions</strong>
                            <p>Separated viewpoints and interpretations.</p>
                        </div>
                    </aside>
                </section>

                <section className="public-articles-page__feed-header">
                    <div>
                        <h2>Published articles</h2>

                        <p>
                            {pagination?.total ?? 0} published material
                            {(pagination?.total ?? 0) === 1 ? '' : 's'}
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
                                <div className="public-articles-page__list">
                                    {filteredArticles.map((article) => (
                                        <PublicArticleCard
                                            key={article.id}
                                            article={article}
                                        />
                                    ))}
                                </div>

                                {pagination && pagination.totalPages > 1 && (
                                    <Pagination
                                        className="public-articles-page__pagination"
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
        </ReadableLayout>
    );
};
