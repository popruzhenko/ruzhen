import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useRawArticlesQuery } from '../../../../../entities/raw-news/hooks/useRawArticlesQuery';
import { mapArticleToRawNewsItem } from '../../../../../entities/raw-news/lib/mapArticleToRawNewsItem';
import { useFetchNewArticlesMutation } from '../../../../../entities/raw-news/hooks/useFetchNewArticlesMutation';
import type {
    RawArticleBulkAction,
    RawArticlesPageSize,
    RawArticlesResponse,
} from '../../../../../entities/raw-news/model/rawArticles';
import { PageState } from '../../../../ui/PageState/PageState';
import { useToast } from '../../../../ui/Toast/ToastProvider';
import { TOAST_TYPE } from '../../../../ui/Toast/ToastConstants';
import { RawArticleCard } from './RawArticleCard/RawArticleCard';
import { RawNewsFilters } from './RawNewsFilters/RawNewsFilters';
import type { RawNewsFiltersState } from './RawNewsFilters/TypesRawNewsFilters';
import {
    getRawArticlesFilters,
    initialRawNewsFilters,
} from './RawNewsFilters/getRawArticlesFilters';
import { RawArticleBulkPanel } from './RawArticleBulkPanel/RawArticleBulkPanel';
import { useRawArticleBulk } from './RawArticleBulkPanel/useRawArticleBulk';
import { RawArticleEnrichmentPanel } from './RawArticleEnrichmentPanel/RawArticleEnrichmentPanel';
import type { RawArticleEnrichmentHandle } from './RawArticleEnrichmentPanel/TypesRawArticleEnrichmentPanel';
import { RawArticlesPagination } from './RawArticlesPagination/RawArticlesPagination';
import './RawNewsPage.scss';

export const RawNewsPage = () => {
    const [filters, setFilters] = useState(initialRawNewsFilters);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [dateAnchor, setDateAnchor] = useState(() => new Date());
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState<RawArticlesPageSize>(50);
    const [lastPagination, setLastPagination] = useState<
        RawArticlesResponse['pagination'] | null
    >(null);
    const [sourceNames, setSourceNames] = useState<string[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [scope, setScope] = useState<'FILTERED' | 'SELECTED'>('FILTERED');
    const [operation, setOperation] = useState<string | null>(null);
    const [fetchedEnrichmentJobId, setFetchedEnrichmentJobId] = useState<
        string | null
    >(null);
    const operationRef = useRef<string | null>(null);
    const enrichmentRef = useRef<RawArticleEnrichmentHandle>(null);
    const lockedArticles = useRef<RawArticlesResponse['articles']>([]);
    const { showToast } = useToast();

    useEffect(() => {
        const timeout = window.setTimeout(
            () => setDebouncedSearch(filters.search.trim()),
            300,
        );
        return () => window.clearTimeout(timeout);
    }, [filters.search]);

    useEffect(() => {
        const nextDay = new Date();
        nextDay.setHours(24, 0, 0, 0);
        const timeout = window.setTimeout(
            () => {
                setDateAnchor(new Date());
                if (filters.fetchedDate !== 'ALL') {
                    setPage(1);
                    setSelectedIds(new Set());
                }
            },
            nextDay.getTime() - Date.now() + 10,
        );
        return () => window.clearTimeout(timeout);
    }, [dateAnchor, filters.fetchedDate]);

    const queryFilters = useMemo(
        () =>
            getRawArticlesFilters(
                {
                    search: debouncedSearch,
                    status: filters.status,
                    contentAvailability: filters.contentAvailability,
                    sourceName: filters.sourceName,
                    fetchedDate: filters.fetchedDate,
                    onlyProblematic: filters.onlyProblematic,
                },
                dateAnchor,
            ),
        [
            dateAnchor,
            debouncedSearch,
            filters.status,
            filters.contentAvailability,
            filters.sourceName,
            filters.fetchedDate,
            filters.onlyProblematic,
        ],
    );
    const isSearchPending = filters.search.trim() !== debouncedSearch;
    const articlesQuery = useRawArticlesQuery(
        queryFilters,
        { page, limit },
        !isSearchPending,
    );
    const fetchNewArticlesMutation = useFetchNewArticlesMutation();

    useEffect(() => {
        if (articlesQuery.data) setSourceNames(articlesQuery.data.sourceNames);
    }, [articlesQuery.data]);

    useEffect(() => {
        if (
            !articlesQuery.data ||
            articlesQuery.isPlaceholderData ||
            articlesQuery.isError ||
            articlesQuery.isFetching
        )
            return;
        setLastPagination(articlesQuery.data.pagination);
        if (operation === null && articlesQuery.data.pagination.page !== page) {
            setPage(articlesQuery.data.pagination.page);
            setSelectedIds(new Set());
        }
    }, [
        articlesQuery.data,
        articlesQuery.isPlaceholderData,
        articlesQuery.isError,
        articlesQuery.isFetching,
        operation,
        page,
    ]);

    useEffect(() => {
        if (
            operation !== null ||
            !articlesQuery.data ||
            articlesQuery.isError ||
            articlesQuery.isPlaceholderData ||
            articlesQuery.isFetching
        )
            return;
        const matches = new Set(
            articlesQuery.data.articles.map(({ id }) => id),
        );
        setSelectedIds((current) => {
            const next = new Set([...current].filter((id) => matches.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [
        operation,
        articlesQuery.data,
        articlesQuery.isError,
        articlesQuery.isPlaceholderData,
        articlesQuery.isFetching,
    ]);

    const acquireLock = useCallback(
        (owner: string) => {
            if (
                operationRef.current !== null ||
                isSearchPending ||
                articlesQuery.isFetching ||
                articlesQuery.isPlaceholderData
            )
                return false;
            operationRef.current = owner;
            lockedArticles.current = articlesQuery.data?.articles ?? [];
            setOperation(owner);
            return true;
        },
        [
            articlesQuery.data,
            articlesQuery.isFetching,
            articlesQuery.isPlaceholderData,
            isSearchPending,
        ],
    );
    const releaseLock = useCallback((owner: string) => {
        if (operationRef.current !== owner) return;
        operationRef.current = null;
        setOperation(null);
    }, []);
    const bulk = useRawArticleBulk(
        () => acquireLock('bulk'),
        () => releaseLock('bulk'),
    );
    const articles = useMemo(
        () =>
            operation?.startsWith('card:')
                ? lockedArticles.current
                : (articlesQuery.data?.articles ?? []),
        [operation, articlesQuery.data],
    );
    const selectionDisabled =
        operation !== null ||
        isSearchPending ||
        articlesQuery.isFetching ||
        articlesQuery.isPlaceholderData ||
        articlesQuery.isError;
    const pagination = articlesQuery.data?.pagination ?? lastPagination;
    const total = articlesQuery.data?.total ?? 0;
    const enrichmentEligibleCount =
        scope === 'FILTERED'
            ? (articlesQuery.data?.enrichmentEligibleCount ?? 0)
            : articles.filter(
                  (article) =>
                      selectedIds.has(article.id) && article.enrichmentEligible,
              ).length;

    const eligibleCounts = useMemo(() => {
        if (scope === 'FILTERED') {
            return (
                articlesQuery.data?.eligibility ?? {
                    RECHECK: 0,
                    APPROVE: 0,
                    REJECT: 0,
                }
            );
        }
        const counts = { RECHECK: 0, APPROVE: 0, REJECT: 0 };
        articles.forEach((article) => {
            if (!selectedIds.has(article.id)) return;
            (Object.keys(counts) as RawArticleBulkAction[]).forEach(
                (action) => {
                    if (article.bulkEligibility[action]) counts[action]++;
                },
            );
        });
        return counts;
    }, [scope, articlesQuery.data, articles, selectedIds]);

    const handleChangeFilter = <K extends keyof RawNewsFiltersState>(
        key: K,
        value: RawNewsFiltersState[K],
    ) => {
        if (operationRef.current !== null) return;
        setPage(1);
        setSelectedIds(new Set());
        setFilters((current) => ({ ...current, [key]: value }));
    };
    const handleClearFilters = () => {
        if (operationRef.current !== null) return;
        setPage(1);
        setSelectedIds(new Set());
        setDebouncedSearch('');
        setFilters(initialRawNewsFilters);
    };
    const handlePageChange = (nextPage: number) => {
        if (
            selectionDisabled ||
            operationRef.current !== null ||
            !pagination ||
            !Number.isInteger(nextPage) ||
            nextPage < 1 ||
            nextPage > pagination.totalPages ||
            nextPage === page
        )
            return;
        setSelectedIds(new Set());
        setPage(nextPage);
    };
    const handlePageSizeChange = (nextLimit: RawArticlesPageSize) => {
        if (
            selectionDisabled ||
            operationRef.current !== null ||
            nextLimit === limit
        )
            return;
        setSelectedIds(new Set());
        setPage(1);
        setLimit(nextLimit);
    };
    const handleFetchNewArticles = async () => {
        if (!acquireLock('fetch')) return;
        try {
            const response = await fetchNewArticlesMutation.mutateAsync();
            const { parseResults, enrichment } = response.result;
            const created = parseResults.reduce(
                (count, source) => count + source.created,
                0,
            );
            if (enrichment.jobId) setFetchedEnrichmentJobId(enrichment.jobId);
            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Articles fetched',
                message:
                    `Fetched ${created} new article${created === 1 ? '' : 's'}. ` +
                    (enrichment.jobId && enrichment.status
                        ? `Automatic Enrich for ${enrichment.total} article${enrichment.total === 1 ? '' : 's'}: ${enrichment.status.toLowerCase()}. See Article enrichment for progress and results.`
                        : 'No new articles need automatic enrichment.'),
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to fetch articles',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            releaseLock('fetch');
        }
    };
    const prepare = (action: RawArticleBulkAction) => {
        if (selectionDisabled) return;
        void bulk.prepare(
            action,
            scope === 'FILTERED'
                ? { type: 'FILTERED', filters: queryFilters }
                : { type: 'SELECTED', ids: [...selectedIds] },
        );
    };
    const hasActiveFilters = Object.entries(filters).some(
        ([key, value]) =>
            value !== initialRawNewsFilters[key as keyof RawNewsFiltersState],
    );
    const sourceOptions = [
        { label: 'All sources', value: 'ALL' },
        ...(articlesQuery.data?.sourceNames ?? sourceNames).map((name) => ({
            label: name,
            value: name,
        })),
    ];

    return (
        <div className="raw_news">
            <fieldset
                disabled={operation !== null}
                className="raw_news__filters_lock"
            >
                <RawNewsFilters
                    filters={filters}
                    sourceOptions={sourceOptions}
                    totalCount={articlesQuery.data?.totalAll}
                    filteredCount={articlesQuery.data?.total}
                    hasActiveFilters={hasActiveFilters}
                    onChange={handleChangeFilter}
                    onClear={handleClearFilters}
                    onFetchNewArticles={handleFetchNewArticles}
                    isFetchingNewArticles={fetchNewArticlesMutation.isPending}
                    isFetchDisabled={selectionDisabled}
                />
            </fieldset>
            {operation?.startsWith('card:') && (
                <p className="raw_news__lock_message" role="status">
                    Finish or close the article review before changing filters
                    or starting a bulk action.
                </p>
            )}
            <RawArticleBulkPanel
                scope={scope}
                onScopeChange={(value) => {
                    if (!selectionDisabled) setScope(value);
                }}
                total={total}
                selectedCount={selectedIds.size}
                eligibility={eligibleCounts}
                disabled={selectionDisabled}
                selectionDisabled={selectionDisabled}
                onSelectShown={() => {
                    if (!selectionDisabled) {
                        setSelectedIds(new Set(articles.map(({ id }) => id)));
                        setScope('SELECTED');
                    }
                }}
                onClearSelection={() => {
                    if (!selectionDisabled) setSelectedIds(new Set());
                }}
                onPrepare={prepare}
                enrichmentEligibleCount={enrichmentEligibleCount}
                onEnrich={() => {
                    if (selectionDisabled) return;
                    enrichmentRef.current?.start(
                        scope === 'FILTERED'
                            ? { type: 'FILTERED', filters: queryFilters }
                            : { type: 'SELECTED', ids: [...selectedIds] },
                    );
                }}
                bulk={bulk}
            />
            <RawArticleEnrichmentPanel
                ref={enrichmentRef}
                preferredJobId={fetchedEnrichmentJobId}
                disabled={selectionDisabled}
                onAcquireInteraction={() => acquireLock('enrichment')}
                onReleaseInteraction={() => releaseLock('enrichment')}
            />
            {articlesQuery.isError && (
                <PageState
                    variant="error"
                    title={
                        articlesQuery.data
                            ? 'Could not refresh raw articles'
                            : 'Failed to load raw articles'
                    }
                    description="The latest article list could not be loaded. Completed bulk results remain in the report."
                    actionLabel="Retry loading articles"
                    onAction={() => void articlesQuery.refetch()}
                />
            )}
            {(articlesQuery.isLoading ||
                articlesQuery.isPlaceholderData ||
                isSearchPending) && (
                <PageState
                    variant="loading"
                    title="Loading raw articles"
                    description="Please wait while Ruzhen loads collected articles."
                />
            )}
            {!articlesQuery.isLoading &&
                !articlesQuery.isError &&
                !articlesQuery.isPlaceholderData &&
                !isSearchPending &&
                articles.length === 0 && (
                    <PageState
                        variant="empty"
                        title={
                            hasActiveFilters
                                ? 'No articles match filters'
                                : 'No raw articles yet'
                        }
                        description={
                            hasActiveFilters
                                ? 'Try changing search, status, source, date or problematic-only filters.'
                                : 'Fetch new articles from connected sources to start the editorial pipeline.'
                        }
                        actionLabel={
                            operation
                                ? undefined
                                : hasActiveFilters
                                  ? 'Clear filters'
                                  : 'Fetch articles'
                        }
                        onAction={
                            operation
                                ? undefined
                                : hasActiveFilters
                                  ? handleClearFilters
                                  : handleFetchNewArticles
                        }
                    />
                )}
            {pagination && (
                <RawArticlesPagination
                    pagination={pagination}
                    disabled={selectionDisabled}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                />
            )}
            <div className="raw_news__list">
                {articles.map((article) => (
                    <RawArticleCard
                        key={article.id}
                        article={mapArticleToRawNewsItem(article)}
                        eligibility={article.bulkEligibility}
                        onOpenHistory={() =>
                            enrichmentRef.current?.openHistory(
                                article.id,
                                article.updatedAt,
                            )
                        }
                        selected={selectedIds.has(article.id)}
                        selectionDisabled={selectionDisabled}
                        onSelectionChange={(checked) => {
                            if (
                                selectionDisabled ||
                                operationRef.current !== null
                            )
                                return;
                            if (checked) setScope('SELECTED');
                            setSelectedIds((current) => {
                                const next = new Set(current);
                                if (checked) next.add(article.id);
                                else next.delete(article.id);
                                return next;
                            });
                        }}
                        disabled={
                            operation !== null
                                ? operation !== `card:${article.id}`
                                : selectionDisabled
                        }
                        onAcquireInteraction={() =>
                            acquireLock(`card:${article.id}`)
                        }
                        onReleaseInteraction={() =>
                            releaseLock(`card:${article.id}`)
                        }
                    />
                ))}
            </div>
            {pagination && pagination.totalPages > 1 && (
                <RawArticlesPagination
                    pagination={pagination}
                    disabled={selectionDisabled}
                    onPageChange={handlePageChange}
                />
            )}
        </div>
    );
};
