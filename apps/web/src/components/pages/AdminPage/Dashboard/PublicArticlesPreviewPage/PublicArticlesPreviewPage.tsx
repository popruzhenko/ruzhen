import { Pagination } from '../../../../ui/Pagination/Pagination';
import { PageState } from '../../../../ui/PageState/PageState';

import { PublicArticleCard } from '../../../PublicArticlesPage/PublicArticleCard/PublicArticleCard';
import { PublicArticlesFilters } from '../../../PublicArticlesPage/PublicArticlesFilters/PublicArticlesFilters';
import { usePublicArticlesFeed } from '../../../PublicArticlesPage/usePublicArticlesFeed';

import './PublicArticlesPreviewPage.scss';

export const PublicArticlesPreviewPage = () => {
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
        <div className="admin-public-articles">
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
                    description="Please wait while Ruzhen loads public article previews."
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
                    description="Publish articles from the Publication section and they will appear here."
                    actionLabel="Go to publication"
                    actionTo="/admin/publication"
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
                    <div className="admin-public-articles__list">
                        {articles.map((article) => (
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
        </div>
    );
};
