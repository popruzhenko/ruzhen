import { useMemo, useState } from 'react';

import { useArticlesQuery } from '../../../../../entities/raw-news/hooks/useArticlesQuery';
import { mapArticleToRawNewsItem } from '../../../../../entities/raw-news/lib/mapArticleToRawNewsItem';
import { useFetchNewArticlesMutation } from '../../../../../entities/raw-news/hooks/useFetchNewArticlesMutation';

import { PageState } from '../../../../ui/PageState/PageState';
import { useToast } from '../../../../ui/Toast/ToastProvider';

import { RawArticleCard } from './RawArticleCard/RawArticleCard';
import { RawNewsFilters } from './RawNewsFilters/RawNewsFilters';

import type { RawNewsFiltersState } from './RawNewsFilters/TypesRawNewsFilters';

import { isDateInFetchedRange } from '../lib/DateHelper';
import {
    ARTICLE_STATUS,
    CONTENT_AVAILABILITY,
} from '../../../../../entities/raw-news/model/articleConstants';
import { TOAST_TYPE } from '../../../../ui/Toast/ToastConstants';

const initialRawNewsFilters: RawNewsFiltersState = {
    search: '',
    status: 'ALL',
    contentAvailability: 'ALL',
    sourceName: 'ALL',
    fetchedDate: 'ALL',
    onlyProblematic: false,
};

export const RawNewsPage = () => {
    const [filters, setFilters] = useState<RawNewsFiltersState>(
        initialRawNewsFilters,
    );

    const { showToast } = useToast();

    const articlesQuery = useArticlesQuery();
    const fetchNewArticlesMutation = useFetchNewArticlesMutation();

    const articles =
        articlesQuery.data?.articles.map(mapArticleToRawNewsItem) ?? [];

    const isLoading = articlesQuery.isLoading;
    const isError = articlesQuery.isError;

    const filteredArticles = useMemo(() => {
        return articles.filter((article) => {
            const search = filters.search.trim().toLowerCase();

            const sourceName = article.sourceName ?? '';

            const matchesSearch =
                search.length === 0 ||
                article.title?.toLowerCase().includes(search) ||
                article.summary?.toLowerCase().includes(search) ||
                article.url?.toLowerCase().includes(search) ||
                article.id.toLowerCase().includes(search) ||
                sourceName.toLowerCase().includes(search);

            const matchesStatus =
                filters.status === 'ALL' || article.status === filters.status;

            const matchesContent =
                filters.contentAvailability === 'ALL' ||
                article.contentAvailability === filters.contentAvailability;

            const matchesSource =
                filters.sourceName === 'ALL' ||
                sourceName === filters.sourceName;

            const matchesFetchedDate = isDateInFetchedRange(
                article.createdAt,
                filters.fetchedDate,
            );

            const matchesProblematic =
                !filters.onlyProblematic ||
                article.status === ARTICLE_STATUS.NEEDS_REVIEW ||
                article.contentAvailability !==
                    CONTENT_AVAILABILITY.FULL_TEXT ||
                !article.title?.trim() ||
                !article.summary?.trim() ||
                !article.url?.trim();

            return (
                matchesSearch &&
                matchesStatus &&
                matchesContent &&
                matchesSource &&
                matchesFetchedDate &&
                matchesProblematic
            );
        });
    }, [articles, filters]);

    const sourceOptions = useMemo(() => {
        const sourceNames = articles
            .map((article) => article.sourceName)
            .filter((sourceName): sourceName is string =>
                Boolean(sourceName && sourceName.trim()),
            );

        const uniqueSourceNames = Array.from(new Set(sourceNames)).sort(
            (a, b) => a.localeCompare(b),
        );

        return [
            {
                label: 'All sources',
                value: 'ALL',
            },
            ...uniqueSourceNames.map((sourceName) => ({
                label: sourceName,
                value: sourceName,
            })),
        ];
    }, [articles]);

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.status !== 'ALL' ||
        filters.contentAvailability !== 'ALL' ||
        filters.sourceName !== 'ALL' ||
        filters.fetchedDate !== 'ALL' ||
        filters.onlyProblematic;

    const handleChangeFilter = <K extends keyof RawNewsFiltersState>(
        key: K,
        value: RawNewsFiltersState[K],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearFilters = () => {
        setFilters(initialRawNewsFilters);
    };

    const handleFetchNewArticles = async () => {
        try {
            const response = await fetchNewArticlesMutation.mutateAsync();

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Articles fetched',
                message:
                    response.message ??
                    'New articles were fetched successfully.',
            });

            await articlesQuery.refetch();
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to fetch articles',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    if (isLoading) {
        return (
            <div className="raw_news">
                <PageState
                    variant="loading"
                    title="Loading raw articles"
                    description="Please wait while Ruzhen loads collected articles."
                />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="raw_news">
                <PageState
                    variant="error"
                    title="Failed to load raw articles"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void articlesQuery.refetch();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="raw_news">
            <RawNewsFilters
                filters={filters}
                sourceOptions={sourceOptions}
                totalCount={articles.length}
                filteredCount={filteredArticles.length}
                hasActiveFilters={hasActiveFilters}
                onChange={handleChangeFilter}
                onClear={handleClearFilters}
                onFetchNewArticles={handleFetchNewArticles}
                isFetchingNewArticles={fetchNewArticlesMutation.isPending}
            />

            {articles.length === 0 ? (
                <PageState
                    variant="empty"
                    title="No raw articles yet"
                    description="Fetch new articles from connected sources to start the editorial pipeline."
                    actionLabel="Fetch articles"
                    onAction={handleFetchNewArticles}
                />
            ) : filteredArticles.length === 0 ? (
                <PageState
                    variant="empty"
                    title="No articles match filters"
                    description="Try changing search, status, source, date or problematic-only filters."
                    actionLabel="Clear filters"
                    onAction={handleClearFilters}
                />
            ) : (
                <div className="raw_news__list">
                    {filteredArticles.map((article) => (
                        <RawArticleCard key={article.id} article={article} />
                    ))}
                </div>
            )}
        </div>
    );
};
