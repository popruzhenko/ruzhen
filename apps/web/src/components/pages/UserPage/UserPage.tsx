import { UserLayout } from '../../layouts/UserLayout/UserLayout';
import { PageState } from '../../ui/PageState/PageState';
import { Pagination } from '../../ui/Pagination/Pagination';

import { PublicArticleCard } from '../PublicArticlesPage/PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from '../PublicArticlesPage/PublicArticlesFilters/PublicArticlesFilters';

import { usePublicArticlesFeed } from '../PublicArticlesPage/usePublicArticlesFeed';

import './UserPage.scss';

export const UserPage = () => {
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
        <UserLayout>
            <div className="user-page">
                <section className="user-page__hero">
                    <div>
                        <span className="user-page__eyebrow">
                            Personal news feed
                        </span>

                        <h1>Your Ruzhen feed</h1>

                        <p>
                            Understand the story clearly. Ruzhen separates
                            facts, context, and opinions, so you can quickly see
                            what happened, why it matters, and how different
                            sides interpret it.
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
                        title="Loading your news feed"
                        description="Please wait while Ruzhen loads the latest published materials."
                    />
                ) : publicClustersQuery.isError ? (
                    <PageState
                        variant="error"
                        title="Failed to load your news feed"
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
                        <div className="user-page__list">
                            {articles.map((article) => (
                                <PublicArticleCard
                                    key={article.id}
                                    article={article}
                                    detailsBasePath="/user/articles"
                                />
                            ))}
                        </div>

                        {pagination && pagination.totalPages > 1 && (
                            <Pagination
                                className="user-page__pagination"
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
        </UserLayout>
    );
};
