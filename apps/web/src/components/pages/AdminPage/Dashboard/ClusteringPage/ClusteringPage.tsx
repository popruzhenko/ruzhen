import { useEffect, useMemo, useState } from 'react';

import {
    recalculateCandidates,
    recalculateClusterArticles,
    useGenerateArticleEmbeddingsMutation,
    type ClusterArticleItem,
    type EmbeddedArticleItem,
} from '../../../../../entities/clustering';

import {
    useClusterByIdQuery,
    useClustersQuery,
    useCreateClusterFromArticlesMutation,
    useDeleteClusterMutation,
    useUpdateClusterArticlesMutation,
} from '../../../../../entities/cluster';

import { useArticlesQuery } from '../../../../../entities/raw-news/hooks/useArticlesQuery';

import { Button } from '../../../../ui/Button/Button';
import { PageState } from '../../../../ui/PageState/PageState';
import { ConfirmModal } from '../../../../ui/Modal/ConfirmModal/ConfirmModal';
import { useToast } from '../../../../ui/Toast/ToastProvider';

import { ArticleCandidateCard } from './ClusteringCards/ArticleCandidateCard';
import { ClusterArticleCard } from './ClusteringCards/ClusterArticleCard';
import { ClusterCard } from './ClusteringCards/ClusterCard';
import { ClusteringFilters } from './ClusteringFilters/ClusteringFilters';

import type { ClusteringFiltersState } from './ClusteringFilters/TypesClusteringFilters';

import { isDateInFetchedRange } from '../lib/DateHelper';
import { getSimilarityThreshold } from '../lib/SimilarityThresholdHelper';

import './ClusteringPage.scss';

type FilterableCandidateArticle = EmbeddedArticleItem & {
    createdAt: string | null;
    similarityToCluster: number | null;
};

const initialClusteringFilters: ClusteringFiltersState = {
    search: '',
    fetchedDate: 'ALL',
    sourceName: 'ALL',
    embedding: 'ALL',
    similarity: 'ALL',
    sort: 'SIMILARITY_DESC',
    onlySelected: false,
};

const toNumberArray = (value: unknown): number[] | null => {
    if (!Array.isArray(value)) {
        return null;
    }

    const isNumberArray = value.every((item) => typeof item === 'number');

    if (!isNumberArray) {
        return null;
    }

    return value;
};

const hasEmbedding = (
    article: FilterableCandidateArticle,
): article is FilterableCandidateArticle & { embedding: number[] } => {
    return Array.isArray(article.embedding);
};

export const ClusteringPage = () => {
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
        null,
    );

    const [clusterArticles, setClusterArticles] = useState<
        ClusterArticleItem[]
    >([]);

    const [candidateArticles, setCandidateArticles] = useState<
        FilterableCandidateArticle[]
    >([]);

    const [selectedClusterArticleIds, setSelectedClusterArticleIds] = useState<
        string[]
    >([]);

    const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>(
        [],
    );

    const [filters, setFilters] = useState<ClusteringFiltersState>(
        initialClusteringFilters,
    );

    const [isDeleteClusterConfirmOpen, setIsDeleteClusterConfirmOpen] =
        useState(false);

    const { showToast } = useToast();

    const clustersQuery = useClustersQuery({ page: 1, limit: 500 });
    const selectedClusterQuery = useClusterByIdQuery(selectedClusterId);
    const articlesQuery = useArticlesQuery();

    const deleteClusterMutation = useDeleteClusterMutation();

    const generateArticleEmbeddingsMutation =
        useGenerateArticleEmbeddingsMutation();

    const createClusterFromArticlesMutation =
        useCreateClusterFromArticlesMutation();

    const updateClusterArticlesMutation = useUpdateClusterArticlesMutation();

    const clusters = clustersQuery.data?.clusters ?? [];
    const selectedCluster = selectedClusterQuery.data ?? null;
    const articles = articlesQuery.data?.articles ?? [];

    const clusterArticleIdsKey = useMemo(() => {
        return clusterArticles
            .map((article) => article.id)
            .sort()
            .join('|');
    }, [clusterArticles]);

    useEffect(() => {
        const cluster = selectedClusterQuery.data;

        if (!selectedClusterId || !cluster) {
            setClusterArticles([]);
            setSelectedClusterArticleIds([]);
            return;
        }

        const mappedArticles: ClusterArticleItem[] = cluster.articles.map(
            (article) => {
                const embedding = toNumberArray(article.embedding);

                return {
                    id: article.id,
                    title: article.title,
                    summary: article.summary ?? null,
                    sourceName: article.source?.name ?? null,
                    country: article.country ?? null,
                    publishedAt: article.publishedAt ?? null,
                    embedding,
                    similarityToCentroid: article.confidence ?? null,
                    confidence: article.confidence ?? null,
                    isPrimary: article.isPrimary,
                    status: 'CLUSTERED',
                };
            },
        );

        setClusterArticles(mappedArticles);
        setSelectedClusterArticleIds([]);
        setSelectedCandidateIds([]);
    }, [selectedClusterId, selectedClusterQuery.dataUpdatedAt]);

    useEffect(() => {
        const clusterArticleIds = new Set(
            clusterArticles.map((article) => article.id),
        );

        const mappedCandidates: FilterableCandidateArticle[] = articles
            .filter((article) => {
                const isAllowedStatus =
                    article.status === 'APPROVED' ||
                    article.status === 'EMBEDDED';

                const hasTitle = Boolean(article.title?.trim());
                const isAlreadyInCluster = clusterArticleIds.has(article.id);

                return isAllowedStatus && hasTitle && !isAlreadyInCluster;
            })
            .map((article) => ({
                id: article.id,
                title: article.title as string,
                summary: article.summary ?? null,
                sourceName: article.source?.name ?? null,
                country: article.country ?? null,
                publishedAt: article.publishedAt ?? null,
                createdAt: article.createdAt ?? null,
                status: article.status as 'APPROVED' | 'EMBEDDED' | 'CLUSTERED',
                embedding: toNumberArray(article.embedding),
                similarityToCluster: null,
            }));

        setCandidateArticles(mappedCandidates);
        setSelectedCandidateIds([]);
    }, [articles, clusterArticleIdsKey]);

    const clusterMetrics = useMemo(() => {
        return recalculateClusterArticles(clusterArticles);
    }, [clusterArticles]);

    const candidatesWithSimilarity = useMemo(() => {
        return recalculateCandidates(
            candidateArticles,
            clusterMetrics.centroid,
        ) as FilterableCandidateArticle[];
    }, [candidateArticles, clusterMetrics.centroid]);

    const sourceOptions = useMemo(() => {
        const sourceNames = candidatesWithSimilarity
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
    }, [candidatesWithSimilarity]);

    const filteredCandidateArticles = useMemo(() => {
        const similarityThreshold = getSimilarityThreshold(filters.similarity);

        const filtered = candidatesWithSimilarity.filter((article) => {
            const search = filters.search.trim().toLowerCase();
            const sourceName = article.sourceName ?? '';

            const matchesSearch =
                search.length === 0 ||
                article.title.toLowerCase().includes(search) ||
                article.id.toLowerCase().includes(search) ||
                article.summary?.toLowerCase().includes(search) ||
                sourceName.toLowerCase().includes(search);

            const matchesDate = isDateInFetchedRange(
                article.createdAt,
                filters.fetchedDate,
            );

            const matchesSource =
                filters.sourceName === 'ALL' ||
                sourceName === filters.sourceName;

            const articleHasEmbedding = Array.isArray(article.embedding);

            const matchesEmbedding =
                filters.embedding === 'ALL' ||
                (filters.embedding === 'WITH_EMBEDDING' &&
                    articleHasEmbedding) ||
                (filters.embedding === 'WITHOUT_EMBEDDING' &&
                    !articleHasEmbedding);

            const similarity = article.similarityToCluster;

            const matchesSimilarity =
                similarityThreshold === null ||
                (typeof similarity === 'number' &&
                    similarity >= similarityThreshold);

            const matchesSelected =
                !filters.onlySelected ||
                selectedCandidateIds.includes(article.id);

            return (
                matchesSearch &&
                matchesDate &&
                matchesSource &&
                matchesEmbedding &&
                matchesSimilarity &&
                matchesSelected
            );
        });

        return [...filtered].sort((a, b) => {
            if (filters.sort === 'NEWEST') {
                return (
                    new Date(b.createdAt ?? 0).getTime() -
                    new Date(a.createdAt ?? 0).getTime()
                );
            }

            if (filters.sort === 'OLDEST') {
                return (
                    new Date(a.createdAt ?? 0).getTime() -
                    new Date(b.createdAt ?? 0).getTime()
                );
            }

            if (filters.sort === 'SIMILARITY_DESC') {
                return (
                    (b.similarityToCluster ?? -1) -
                    (a.similarityToCluster ?? -1)
                );
            }

            if (filters.sort === 'SIMILARITY_ASC') {
                return (
                    (a.similarityToCluster ?? 999) -
                    (b.similarityToCluster ?? 999)
                );
            }

            if (filters.sort === 'TITLE_ASC') {
                return a.title.localeCompare(b.title);
            }

            return (
                (b.similarityToCluster ?? -1) - (a.similarityToCluster ?? -1)
            );
        });
    }, [candidatesWithSimilarity, filters, selectedCandidateIds]);

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.fetchedDate !== 'ALL' ||
        filters.sourceName !== 'ALL' ||
        filters.embedding !== 'ALL' ||
        filters.similarity !== 'ALL' ||
        filters.sort !== 'SIMILARITY_DESC' ||
        filters.onlySelected;

    const handleChangeFilter = <K extends keyof ClusteringFiltersState>(
        key: K,
        value: ClusteringFiltersState[K],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearFilters = () => {
        setFilters(initialClusteringFilters);
    };

    const buildClusterTitle = (articles: ClusterArticleItem[]): string => {
        const firstArticleTitle = articles[0]?.title?.trim();

        if (firstArticleTitle && firstArticleTitle.length >= 5) {
            return firstArticleTitle.slice(0, 140);
        }

        return `Cluster ${new Date().toISOString().slice(0, 10)}`;
    };

    const handleSelectCluster = (clusterId: string) => {
        const isSameCluster = clusterId === selectedClusterId;

        if (isSameCluster) {
            setSelectedClusterId(null);
            setClusterArticles([]);
            setSelectedClusterArticleIds([]);
            setSelectedCandidateIds([]);
            return;
        }

        setSelectedClusterId(clusterId);
        setClusterArticles([]);
        setSelectedClusterArticleIds([]);
        setSelectedCandidateIds([]);
    };

    const handleToggleClusterArticle = (articleId: string) => {
        setSelectedClusterArticleIds((currentIds) =>
            currentIds.includes(articleId)
                ? currentIds.filter((id) => id !== articleId)
                : [...currentIds, articleId],
        );
    };

    const handleToggleCandidate = (articleId: string) => {
        setSelectedCandidateIds((currentIds) =>
            currentIds.includes(articleId)
                ? currentIds.filter((id) => id !== articleId)
                : [...currentIds, articleId],
        );
    };

    const hasAddableSelectedCandidates = candidateArticles.some((article) => {
        return (
            selectedCandidateIds.includes(article.id) &&
            Array.isArray(article.embedding)
        );
    });

    const handleAddToCluster = () => {
        const articlesToAdd = candidateArticles
            .filter((article) => selectedCandidateIds.includes(article.id))
            .filter(hasEmbedding);

        if (articlesToAdd.length === 0) {
            showToast({
                type: 'warning',
                title: 'No articles added',
                message: 'Select embedded candidate articles first.',
            });

            return;
        }

        const currentClusterArticleIds = new Set(
            clusterArticles.map((article) => article.id),
        );

        const uniqueArticlesToAdd = articlesToAdd.filter(
            (article) => !currentClusterArticleIds.has(article.id),
        );

        if (uniqueArticlesToAdd.length === 0) {
            setSelectedCandidateIds([]);

            showToast({
                type: 'info',
                title: 'Nothing to add',
                message: 'Selected articles are already in the cluster.',
            });

            return;
        }

        const clusterArticlesToAdd: ClusterArticleItem[] =
            uniqueArticlesToAdd.map((article) => ({
                ...article,
                embedding: article.embedding,
                isPrimary: false,
                confidence: null,
                similarityToCentroid: 0,
                status: 'CLUSTERED',
            }));

        setClusterArticles((currentArticles) => [
            ...currentArticles,
            ...clusterArticlesToAdd,
        ]);

        setSelectedCandidateIds([]);

        showToast({
            type: 'success',
            title: 'Articles added',
            message: `${clusterArticlesToAdd.length} article(s) added to the cluster draft.`,
        });
    };

    const handleCreateCluster = async () => {
        if (clusterArticles.length === 0) {
            showToast({
                type: 'warning',
                title: 'Cannot create cluster',
                message: 'Add at least one article before creating a cluster.',
            });

            return;
        }

        try {
            const response =
                await createClusterFromArticlesMutation.mutateAsync({
                    articleIds: clusterArticles.map((article) => article.id),
                    title: buildClusterTitle(clusterArticles),
                    summary: null,
                    mainCountry: null,
                    startDate: clusterArticles[0]?.publishedAt ?? null,
                });

            const createdCluster = response.cluster;

            setSelectedClusterId(createdCluster.id);
            setSelectedClusterArticleIds([]);
            setSelectedCandidateIds([]);

            await clustersQuery.refetch();
            await articlesQuery.refetch();

            showToast({
                type: 'success',
                title: 'Cluster created',
                message: 'New cluster was created successfully.',
            });
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Failed to create cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleSaveCluster = async () => {
        if (!selectedClusterId) {
            showToast({
                type: 'warning',
                title: 'No cluster selected',
                message: 'Select a cluster before saving.',
            });

            return;
        }

        if (clusterArticles.length === 0) {
            showToast({
                type: 'warning',
                title: 'Cannot save empty cluster',
                message: 'Add at least one article before saving the cluster.',
            });

            return;
        }

        try {
            await updateClusterArticlesMutation.mutateAsync({
                clusterId: selectedClusterId,
                payload: {
                    articles: clusterMetrics.articles.map((article, index) => ({
                        articleId: article.id,
                        confidence:
                            typeof article.similarityToCentroid === 'number'
                                ? article.similarityToCentroid
                                : null,
                        isPrimary: article.isPrimary || index === 0,
                    })),
                },
            });

            showToast({
                type: 'success',
                title: 'Cluster saved',
                message: 'Cluster articles were saved successfully.',
            });

            await selectedClusterQuery.refetch();
            await clustersQuery.refetch();
            await articlesQuery.refetch();
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Failed to save cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleGenerateEmbedding = async () => {
        try {
            await generateArticleEmbeddingsMutation.mutateAsync();
            await articlesQuery.refetch();

            showToast({
                type: 'success',
                title: 'Embeddings generated',
                message: 'Article embeddings were generated successfully.',
            });
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Failed to generate embeddings',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleRemoveFromCluster = () => {
        const articlesToRemove = clusterArticles.filter((article) =>
            selectedClusterArticleIds.includes(article.id),
        );

        setClusterArticles((currentArticles) =>
            currentArticles.filter(
                (article) => !selectedClusterArticleIds.includes(article.id),
            ),
        );

        setCandidateArticles((currentArticles) => [
            ...currentArticles,
            ...articlesToRemove.map(
                ({
                    similarityToCentroid,
                    confidence,
                    isPrimary,
                    ...article
                }) => ({
                    ...article,
                    createdAt: null,
                    similarityToCluster: null,
                    status: 'EMBEDDED' as const,
                    embedding: Array.isArray(article.embedding)
                        ? article.embedding
                        : null,
                }),
            ),
        ]);

        setSelectedClusterArticleIds([]);

        if (articlesToRemove.length > 0) {
            showToast({
                type: 'success',
                title: 'Articles removed',
                message: `${articlesToRemove.length} article(s) removed from the cluster draft.`,
            });
        }
    };

    const handleOpenDeleteClusterConfirm = () => {
        if (!selectedClusterId) {
            showToast({
                type: 'warning',
                title: 'No cluster selected',
                message: 'Select a cluster before deleting.',
            });

            return;
        }

        setIsDeleteClusterConfirmOpen(true);
    };

    const handleConfirmDeleteCluster = async () => {
        if (!selectedClusterId) {
            return;
        }

        try {
            await deleteClusterMutation.mutateAsync(selectedClusterId);

            setSelectedClusterId(null);
            setClusterArticles([]);
            setSelectedClusterArticleIds([]);
            setSelectedCandidateIds([]);
            setIsDeleteClusterConfirmOpen(false);

            await clustersQuery.refetch();
            await articlesQuery.refetch();

            showToast({
                type: 'success',
                title: 'Cluster deleted',
                message: 'The cluster was deleted successfully.',
            });
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Failed to delete cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const isLoading =
        clustersQuery.isLoading ||
        selectedClusterQuery.isLoading ||
        articlesQuery.isLoading;

    const isError =
        clustersQuery.isError ||
        selectedClusterQuery.isError ||
        articlesQuery.isError;

    if (isLoading) {
        return (
            <div className="clustering">
                <PageState
                    variant="loading"
                    title="Loading clustering data"
                    description="Please wait while Ruzhen loads clusters, articles and candidate data."
                />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="clustering">
                <PageState
                    variant="error"
                    title="Failed to load clustering data"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void clustersQuery.refetch();
                        void articlesQuery.refetch();

                        if (selectedClusterId) {
                            void selectedClusterQuery.refetch();
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="clustering">
            <ClusteringFilters
                filters={filters}
                sourceOptions={sourceOptions}
                totalCount={candidatesWithSimilarity.length}
                filteredCount={filteredCandidateArticles.length}
                selectedCount={selectedCandidateIds.length}
                hasActiveFilters={hasActiveFilters}
                onChange={handleChangeFilter}
                onClear={handleClearFilters}
            />

            <div className="clustering__workspace">
                <aside className="clustering__clusters">
                    <div className="clustering__panel-header">
                        <h2>Clusters</h2>
                    </div>

                    <div className="clustering__article-list">
                        {clusters.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No clusters yet"
                                description="Create a cluster from embedded candidate articles to start grouping related news."
                                className="clustering__side-state"
                            />
                        ) : (
                            clusters.map((cluster) => (
                                <ClusterCard
                                    key={cluster.id}
                                    cluster={{
                                        id: cluster.id,
                                        humanId: cluster.humanId,
                                        title: cluster.title,
                                        summary: cluster.summary ?? null,
                                        status: cluster.status,
                                        articlesCount:
                                            cluster._count?.articleLinks ?? 0,
                                        averageSimilarity:
                                            clusterMetrics.averageSimilarity,
                                    }}
                                    isActive={cluster.id === selectedClusterId}
                                    onSelect={handleSelectCluster}
                                />
                            ))
                        )}
                    </div>
                </aside>

                <section className="clustering__selected-cluster">
                    <div className="clustering__panel-header">
                        <div>
                            <h2>
                                {selectedCluster?.title ??
                                    (clusterArticles.length > 0
                                        ? 'New cluster draft'
                                        : 'Cluster draft')}
                            </h2>

                            <p>
                                Average similarity:{' '}
                                <strong>
                                    {clusterMetrics.averageSimilarity.toFixed(
                                        3,
                                    )}
                                </strong>
                            </p>
                        </div>
                    </div>

                    <div className="clustering__article-list">
                        {clusterMetrics.articles.length > 0 ? (
                            clusterMetrics.articles.map((article) => (
                                <ClusterArticleCard
                                    key={article.id}
                                    article={article}
                                    isSelected={selectedClusterArticleIds.includes(
                                        article.id,
                                    )}
                                    onToggle={handleToggleClusterArticle}
                                />
                            ))
                        ) : selectedClusterId ? (
                            <PageState
                                variant="empty"
                                title="Move articles into this cluster"
                                description="Select embedded candidate articles on the right and click Add to cluster."
                                className="clustering__main-state"
                            />
                        ) : (
                            <PageState
                                variant="empty"
                                title="No cluster selected"
                                description="Select a cluster from the left panel to review its articles, or select candidates on the right to build a new cluster draft."
                                className="clustering__main-state"
                            />
                        )}
                    </div>

                    <div className="clustering__actions">
                        <Button
                            onClick={handleRemoveFromCluster}
                            disabled={selectedClusterArticleIds.length === 0}
                        >
                            Remove selected
                        </Button>

                        <Button
                            onClick={handleCreateCluster}
                            disabled={
                                clusterArticles.length === 0 ||
                                createClusterFromArticlesMutation.isPending
                            }
                        >
                            {createClusterFromArticlesMutation.isPending
                                ? 'Creating...'
                                : 'Create cluster'}
                        </Button>

                        <Button
                            onClick={handleSaveCluster}
                            disabled={
                                !selectedClusterId ||
                                clusterArticles.length === 0 ||
                                updateClusterArticlesMutation.isPending
                            }
                        >
                            {updateClusterArticlesMutation.isPending
                                ? 'Saving...'
                                : 'Save cluster'}
                        </Button>

                        <Button
                            onClick={handleOpenDeleteClusterConfirm}
                            disabled={
                                !selectedClusterId ||
                                deleteClusterMutation.isPending
                            }
                        >
                            {deleteClusterMutation.isPending
                                ? 'Deleting...'
                                : 'Delete cluster'}
                        </Button>
                    </div>
                </section>

                <section className="clustering__candidates">
                    <div className="clustering__panel-header">
                        <div>
                            <h2>Candidate Articles</h2>

                            <p>
                                Approved articles need embeddings before they
                                can be added.
                            </p>
                        </div>
                    </div>

                    <div className="clustering__article-list">
                        {candidateArticles.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No candidate articles"
                                description="Approved or embedded articles will appear here before being added to clusters."
                                className="clustering__side-state"
                            />
                        ) : filteredCandidateArticles.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No candidates match filters"
                                description="Try changing search, date, source, embedding, similarity or selected-only filters."
                                actionLabel="Clear filters"
                                onAction={handleClearFilters}
                                className="clustering__side-state"
                            />
                        ) : (
                            filteredCandidateArticles.map((article) => (
                                <ArticleCandidateCard
                                    key={article.id}
                                    article={article}
                                    isSelected={selectedCandidateIds.includes(
                                        article.id,
                                    )}
                                    onToggle={handleToggleCandidate}
                                />
                            ))
                        )}
                    </div>

                    <div className="clustering__actions">
                        <Button
                            onClick={handleAddToCluster}
                            disabled={!hasAddableSelectedCandidates}
                        >
                            Add to cluster
                        </Button>

                        <Button
                            onClick={handleGenerateEmbedding}
                            disabled={
                                generateArticleEmbeddingsMutation.isPending
                            }
                        >
                            {generateArticleEmbeddingsMutation.isPending
                                ? 'Generating...'
                                : 'Generate embeddings'}
                        </Button>
                    </div>
                </section>
            </div>

            <ConfirmModal
                isOpen={isDeleteClusterConfirmOpen}
                title="Delete cluster?"
                description="This action will permanently delete the selected cluster and its links. This cannot be undone."
                confirmLabel="Delete cluster"
                cancelLabel="Cancel"
                variant="danger"
                isLoading={deleteClusterMutation.isPending}
                onConfirm={handleConfirmDeleteCluster}
                onCancel={() => setIsDeleteClusterConfirmOpen(false)}
            />
        </div>
    );
};
