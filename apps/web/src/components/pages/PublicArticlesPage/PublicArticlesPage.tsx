import { ReadableLayout } from '../../layouts/ReadableLayout/ReadableLayout';
import { Pagination } from '../../ui/Pagination/Pagination';
import { PageState } from '../../ui/PageState/PageState';

import { PublicArticleCard } from './PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from './PublicArticlesFilters/PublicArticlesFilters';

import { usePublicArticlesFeed } from './usePublicArticlesFeed';

import './PublicArticlesPage.scss';

export const PublicArticlesPage = () => {
    const {
        publicClustersQuery,
        articles,
        pagination,
        filters,
        hasActiveFilters,
        handlePageChange,
        handleChangeFilter,
        handleClearFilters,
    } = usePublicArticlesFeed();

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
                            {pagination?.totalPublished ?? '—'} published
                            material
                            {pagination?.totalPublished === 1 ? '' : 's'}
                        </p>
                    </div>
                </section>

                <PublicArticlesFilters
                    filters={filters}
                    totalCount={pagination?.totalPublished}
                    filteredCount={pagination?.total}
                    hasActiveFilters={hasActiveFilters}
                    onChange={handleChangeFilter}
                    onClear={handleClearFilters}
                />

                {publicClustersQuery.isLoading ? (
                    <PageState
                        variant="loading"
                        title="Loading published articles"
                        description="Please wait while Ruzhen loads the latest published materials."
                    />
                ) : publicClustersQuery.isError ? (
                    <PageState
                        variant="error"
                        title="Failed to load published articles"
                        description="Please refresh the page or try again later."
                        actionLabel="Retry"
                        onAction={() => {
                            void publicClustersQuery.refetch();
                        }}
                    />
                ) : pagination?.totalPublished === 0 ? (
                    <PageState
                        variant="empty"
                        title="No published articles yet"
                        description="Published articles will appear here after editorial review."
                    />
                ) : articles.length === 0 ? (
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
                            {articles.map((article) => (
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
                                hasPreviousPage={pagination.hasPreviousPage}
                                onPageChange={handlePageChange}
                            />
                        )}
                    </>
                )}
            </div>
        </ReadableLayout>
    );
};
