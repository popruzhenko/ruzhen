import { useEffect, useMemo, useState } from 'react';

import {
    recalculateCandidates,
    recalculateClusterArticles,
    useGenerateArticleEmbeddingsMutation,
    type ClusterArticleItem,
    type EmbeddedArticleItem,
} from '../../../../../entities/clustering';

import {
    useClusterCandidatesQuery,
    useGenerateClusterCandidatesMutation,
    useAcceptClusterCandidateMutation,
    useDeleteClusterCandidateMutation,
} from '../../../../../entities/cluster-candidate';

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
import { ClusterListFilters } from './ClusterListFilters/ClusterListFilters';
import { ExistingClusterSuggestions } from './ExistingClusterSuggestions/ExistingClusterSuggestions';

import type { ClusterListFiltersState } from './ClusterListFilters/TypesClusterListFilters';

import type { ClusteringFiltersState } from './ClusteringFilters/TypesClusteringFilters';

import { isDateInFetchedRange } from '../lib/DateHelper';
import { getSimilarityThreshold } from '../lib/SimilarityThresholdHelper';

import './ClusteringPage.scss';

import {
    ARTICLE_STATUS,
    isClusteringArticleStatus,
    type ClusteringArticleStatus,
    type ArticleStatus,
} from '../../../../../entities/raw-news/model/articleConstants';

import { TOAST_TYPE } from '../../../../ui/Toast/ToastConstants';

const hasClusteringArticleStatus = <T extends { status: ArticleStatus }>(
    article: T,
): article is T & { status: ClusteringArticleStatus } => {
    return isClusteringArticleStatus(article.status);
};

type FilterableCandidateArticle = EmbeddedArticleItem & {
    createdAt: string | null;
    similarityToCluster: number | null;
};

interface ClusterDraft {
    articles: ClusterArticleItem[];
    initialArticleIds: string;
    savedAtDataUpdatedAt?: number;
}

interface ClusterSelection {
    clusterId: string | null;
    candidateId: string | null;
}

const getArticleIdsKey = (articles: ClusterArticleItem[]): string =>
    articles
        .map((article) => article.id)
        .sort()
        .join('|');

const getActiveClusterDraft = (
    draft: ClusterDraft | null,
    dataUpdatedAt: number,
): ClusterDraft | null =>
    draft &&
    (getArticleIdsKey(draft.articles) !== draft.initialArticleIds ||
        draft.savedAtDataUpdatedAt === dataUpdatedAt)
        ? draft
        : null;

const initialClusteringFilters: ClusteringFiltersState = {
    search: '',
    fetchedDate: 'ALL',
    sourceName: 'ALL',
    status: 'READY_FOR_CLUSTERING',
    embedding: 'ALL',
    similarity: 'ALL',
    sort: 'SIMILARITY_DESC',
    onlySelected: false,
};

const initialClusterListFilters: ClusterListFiltersState = {
    search: '',
    status: 'ALL',
    sort: 'NEWEST',
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

const matchesStatusFilter = (
    articleStatus: ArticleStatus,
    statusFilter: ClusteringFiltersState['status'],
): boolean => {
    if (statusFilter === 'ALL') {
        return true;
    }

    if (statusFilter === 'READY_FOR_CLUSTERING') {
        return (
            articleStatus === ARTICLE_STATUS.APPROVED ||
            articleStatus === ARTICLE_STATUS.EMBEDDED
        );
    }

    return articleStatus === statusFilter;
};

const formatSimilarity = (value: number | null | undefined): string => {
    if (typeof value !== 'number') {
        return '—';
    }

    return value.toFixed(3);
};

export const ClusteringPage = () => {
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
        null,
    );

    const [clusterListFilters, setClusterListFilters] =
        useState<ClusterListFiltersState>(initialClusterListFilters);

    const [selectedClusterCandidateId, setSelectedClusterCandidateId] =
        useState<string | null>(null);

    const [clusterDraft, setClusterDraft] = useState<ClusterDraft | null>(null);
    const [pendingClusterSelection, setPendingClusterSelection] =
        useState<ClusterSelection | null>(null);
    const [isClusterActionPending, setIsClusterActionPending] = useState(false);

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

    const [
        isDeleteClusterCandidateConfirmOpen,
        setIsDeleteClusterCandidateConfirmOpen,
    ] = useState(false);

    const { showToast } = useToast();

    const clustersQuery = useClustersQuery({ page: 1, limit: 500 });
    const selectedClusterQuery = useClusterByIdQuery(selectedClusterId);
    const articlesQuery = useArticlesQuery();
    const clusterCandidatesQuery = useClusterCandidatesQuery();

    const deleteClusterMutation = useDeleteClusterMutation();

    const generateArticleEmbeddingsMutation =
        useGenerateArticleEmbeddingsMutation();

    const generateClusterCandidatesMutation =
        useGenerateClusterCandidatesMutation();

    const acceptClusterCandidateMutation = useAcceptClusterCandidateMutation();

    const deleteClusterCandidateMutation = useDeleteClusterCandidateMutation();

    const createClusterFromArticlesMutation =
        useCreateClusterFromArticlesMutation();

    const updateClusterArticlesMutation = useUpdateClusterArticlesMutation();

    const clusters = clustersQuery.data?.clusters ?? [];
    const selectedCluster = selectedClusterQuery.data ?? null;
    const articles = articlesQuery.data?.articles ?? [];
    const clusterCandidates = clusterCandidatesQuery.data?.candidates ?? [];

    const selectedClusterCandidate = useMemo(() => {
        if (!selectedClusterCandidateId) {
            return null;
        }

        return (
            clusterCandidates.find(
                (candidate) => candidate.id === selectedClusterCandidateId,
            ) ?? null
        );
    }, [clusterCandidates, selectedClusterCandidateId]);

    const sourceClusterArticles = useMemo<ClusterArticleItem[]>(() => {
        if (selectedClusterId && selectedCluster) {
            return selectedCluster.articles.map((article) => ({
                id: article.id,
                title: article.title,
                summary: article.summary ?? null,
                sourceName: article.source?.name ?? null,
                country: article.country ?? null,
                publishedAt: article.publishedAt ?? null,
                embedding: toNumberArray(article.embedding),
                similarityToCentroid: article.confidence ?? null,
                confidence: article.confidence ?? null,
                isPrimary: article.isPrimary,
                status: ARTICLE_STATUS.CLUSTERED,
            }));
        }

        if (selectedClusterCandidate) {
            return selectedClusterCandidate.articles.map((candidateArticle) => {
                const article = candidateArticle.article;
                const embedding = toNumberArray(article.embedding);

                return {
                    id: article.id,
                    title: article.title,
                    summary: article.summary ?? null,
                    sourceName: article.source?.name ?? null,
                    country: null,
                    publishedAt: article.publishedAt ?? null,
                    embedding,
                    similarityToCentroid: candidateArticle.confidence ?? null,
                    confidence: candidateArticle.confidence ?? null,
                    isPrimary: candidateArticle.isPrimary,
                    status: ARTICLE_STATUS.EMBEDDED,
                };
            });
        }

        return [];
    }, [selectedClusterId, selectedCluster, selectedClusterCandidate]);

    // Keep edits separate from query data so a background refetch cannot reset them.
    // A saved snapshot is used only until the next successful detail refresh.
    const activeClusterDraft = getActiveClusterDraft(
        clusterDraft,
        selectedClusterQuery.dataUpdatedAt,
    );
    const clusterArticles =
        activeClusterDraft?.articles ?? sourceClusterArticles;
    const clusterArticleIdsKey = getArticleIdsKey(clusterArticles);
    const hasUnsavedChanges =
        activeClusterDraft !== null &&
        clusterArticleIdsKey !== activeClusterDraft.initialArticleIds;
    const isDraftLocked =
        isClusterActionPending ||
        Boolean(selectedClusterId && !selectedCluster);

    const updateClusterDraft = (
        update: (articles: ClusterArticleItem[]) => ClusterArticleItem[],
    ) => {
        setClusterDraft((currentDraft) => {
            const activeDraft = getActiveClusterDraft(
                currentDraft,
                selectedClusterQuery.dataUpdatedAt,
            );
            const initialArticleIds =
                activeDraft?.initialArticleIds ??
                getArticleIdsKey(sourceClusterArticles);
            const nextArticles = update(
                activeDraft?.articles ?? sourceClusterArticles,
            );

            return getActiveClusterDraft(
                {
                    ...activeDraft,
                    articles: nextArticles,
                    initialArticleIds,
                },
                selectedClusterQuery.dataUpdatedAt,
            );
        });
    };

    useEffect(() => {
        if (!hasUnsavedChanges) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () =>
            window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    useEffect(() => {
        const clusterArticleIds = new Set(
            clusterArticles.map((article) => article.id),
        );

        const mappedCandidates: FilterableCandidateArticle[] = articles
            .filter(hasClusteringArticleStatus)
            .filter((article) => {
                const hasTitle = Boolean(article.title?.trim());
                const isAlreadyInCluster = clusterArticleIds.has(article.id);

                return hasTitle && !isAlreadyInCluster;
            })
            .map((article) => ({
                id: article.id,
                title: article.title as string,
                summary: article.summary ?? null,
                sourceName: article.source?.name ?? null,
                country: article.country ?? null,
                publishedAt: article.publishedAt ?? null,
                createdAt: article.createdAt ?? null,
                status: article.status,
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

            const matchesStatus = matchesStatusFilter(
                article.status,
                filters.status,
            );

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
                matchesStatus &&
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

    const filteredClusterCandidates = useMemo(() => {
        const search = clusterListFilters.search.trim().toLowerCase();

        const filtered = clusterCandidates.filter((candidate) => {
            const matchesStatus =
                clusterListFilters.status === 'ALL' ||
                clusterListFilters.status === 'CANDIDATE';

            const candidateArticlesText = candidate.articles
                .map((candidateArticle) => {
                    const article = candidateArticle.article;

                    return [
                        article.id,
                        article.title,
                        article.summary,
                        article.source?.name,
                    ]
                        .filter(Boolean)
                        .join(' ');
                })
                .join(' ')
                .toLowerCase();

            const matchesSearch =
                search.length === 0 ||
                candidate.id.toLowerCase().includes(search) ||
                candidate.title?.toLowerCase().includes(search) ||
                candidate.summary?.toLowerCase().includes(search) ||
                candidateArticlesText.includes(search);

            return matchesStatus && matchesSearch;
        });

        return [...filtered].sort((a, b) => {
            if (clusterListFilters.sort === 'OLDEST') {
                return (
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );
            }

            if (clusterListFilters.sort === 'TITLE_ASC') {
                return (a.title ?? '').localeCompare(b.title ?? '');
            }

            if (clusterListFilters.sort === 'ARTICLES_DESC') {
                return b.articlesCount - a.articlesCount;
            }

            if (clusterListFilters.sort === 'SIMILARITY_DESC') {
                return (
                    (b.averageSimilarity ?? -1) - (a.averageSimilarity ?? -1)
                );
            }

            return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
        });
    }, [clusterCandidates, clusterListFilters]);

    const filteredSavedClusters = useMemo(() => {
        const search = clusterListFilters.search.trim().toLowerCase();

        const filtered = clusters.filter((cluster) => {
            const matchesStatus =
                clusterListFilters.status === 'ALL' ||
                cluster.status === clusterListFilters.status;

            const matchesSearch =
                search.length === 0 ||
                cluster.id.toLowerCase().includes(search) ||
                cluster.humanId.toLowerCase().includes(search) ||
                cluster.title.toLowerCase().includes(search) ||
                cluster.summary?.toLowerCase().includes(search);

            return matchesStatus && matchesSearch;
        });

        return [...filtered].sort((a, b) => {
            if (clusterListFilters.sort === 'OLDEST') {
                return (
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );
            }

            if (clusterListFilters.sort === 'TITLE_ASC') {
                return a.title.localeCompare(b.title);
            }

            if (clusterListFilters.sort === 'ARTICLES_DESC') {
                return (
                    (b._count?.articleLinks ?? 0) -
                    (a._count?.articleLinks ?? 0)
                );
            }

            if (clusterListFilters.sort === 'SIMILARITY_DESC') {
                return (
                    (b.averageSimilarity ?? -1) - (a.averageSimilarity ?? -1)
                );
            }

            return (
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            );
        });
    }, [clusters, clusterListFilters]);

    const hasActiveClusterListFilters =
        clusterListFilters.search.trim() !== '' ||
        clusterListFilters.status !== 'ALL' ||
        clusterListFilters.sort !== 'NEWEST';

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.fetchedDate !== 'ALL' ||
        filters.sourceName !== 'ALL' ||
        filters.status !== 'READY_FOR_CLUSTERING' ||
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

    const handleChangeClusterListFilter = <
        K extends keyof ClusterListFiltersState,
    >(
        key: K,
        value: ClusterListFiltersState[K],
    ) => {
        setClusterListFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearClusterListFilters = () => {
        setClusterListFilters(initialClusterListFilters);
    };

    const buildClusterTitle = (articles: ClusterArticleItem[]): string => {
        const firstArticleTitle = articles[0]?.title?.trim();

        if (firstArticleTitle && firstArticleTitle.length >= 5) {
            return firstArticleTitle.slice(0, 140);
        }

        return `Cluster ${new Date().toISOString().slice(0, 10)}`;
    };

    const applyClusterSelection = ({
        clusterId,
        candidateId,
    }: ClusterSelection) => {
        setSelectedClusterId(clusterId);
        setSelectedClusterCandidateId(candidateId);
        setClusterDraft(null);
        setSelectedClusterArticleIds([]);
        setSelectedCandidateIds([]);
        setPendingClusterSelection(null);
    };

    const requestClusterSelection = (selection: ClusterSelection) => {
        if (isClusterActionPending) {
            return;
        }

        if (hasUnsavedChanges) {
            setPendingClusterSelection(selection);
            return;
        }

        applyClusterSelection(selection);
    };

    const handleSelectCluster = (clusterId: string) => {
        requestClusterSelection({
            clusterId: clusterId === selectedClusterId ? null : clusterId,
            candidateId: null,
        });
    };

    const handleSelectClusterCandidate = (candidateId: string) => {
        requestClusterSelection({
            clusterId: null,
            candidateId:
                candidateId === selectedClusterCandidateId ? null : candidateId,
        });
    };

    const handleToggleClusterArticle = (articleId: string) => {
        if (isDraftLocked) {
            return;
        }

        setSelectedClusterArticleIds((currentIds) =>
            currentIds.includes(articleId)
                ? currentIds.filter((id) => id !== articleId)
                : [...currentIds, articleId],
        );
    };

    const handleToggleCandidate = (articleId: string) => {
        if (isDraftLocked) {
            return;
        }

        setSelectedCandidateIds((currentIds) =>
            currentIds.includes(articleId)
                ? currentIds.filter((id) => id !== articleId)
                : [...currentIds, articleId],
        );
    };

    const hasAddableSelectedCandidates = filteredCandidateArticles.some(
        (article) => {
            return (
                selectedCandidateIds.includes(article.id) &&
                Array.isArray(article.embedding)
            );
        },
    );

    const handleAddToCluster = () => {
        if (isDraftLocked) {
            return;
        }

        if (selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Candidate cluster selected',
                message:
                    'Accept or delete the cluster candidate. Manual editing will be added later.',
            });

            return;
        }

        const articlesToAdd = filteredCandidateArticles
            .filter((article) => selectedCandidateIds.includes(article.id))
            .filter(hasEmbedding);

        if (articlesToAdd.length === 0) {
            showToast({
                type: TOAST_TYPE.WARNING,
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
                type: TOAST_TYPE.WARNING,
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
                status: ARTICLE_STATUS.EMBEDDED,
            }));

        updateClusterDraft((currentArticles) => [
            ...currentArticles,
            ...clusterArticlesToAdd,
        ]);

        setSelectedCandidateIds([]);

        showToast({
            type: TOAST_TYPE.SUCCESS,
            title: 'Articles added',
            message: `${clusterArticlesToAdd.length} article(s) added to the cluster draft.`,
        });
    };

    const handleCreateCluster = async () => {
        if (isDraftLocked) {
            return;
        }

        if (selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Use Accept candidate',
                message:
                    'This draft comes from an algorithmic cluster candidate. Use Accept candidate instead.',
            });

            return;
        }

        if (clusterArticles.length === 0) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Cannot create cluster',
                message: 'Add at least one article before creating a cluster.',
            });

            return;
        }

        setIsClusterActionPending(true);

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

            applyClusterSelection({
                clusterId: createdCluster.id,
                candidateId: null,
            });

            await clustersQuery.refetch();
            await articlesQuery.refetch();

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Cluster created',
                message: 'New cluster was created successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to create cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const handleSaveCluster = async () => {
        if (isDraftLocked) {
            return;
        }

        if (selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Use Accept candidate',
                message:
                    'This is an algorithmic cluster candidate. Accept it before saving as a normal cluster.',
            });

            return;
        }

        if (!selectedClusterId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No cluster selected',
                message: 'Select a cluster before saving.',
            });

            return;
        }

        if (clusterArticles.length === 0) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Cannot save empty cluster',
                message: 'Add at least one article before saving the cluster.',
            });

            return;
        }

        setIsClusterActionPending(true);

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
                type: TOAST_TYPE.SUCCESS,
                title: 'Cluster saved',
                message: 'Cluster articles were saved successfully.',
            });

            const refreshedCluster = await selectedClusterQuery.refetch();

            // The PATCH response has no article list. Keep the submitted snapshot
            // if reloading details fails, and accept future successful refreshes.
            setClusterDraft(
                refreshedCluster.isSuccess
                    ? null
                    : {
                          articles: clusterArticles,
                          initialArticleIds: getArticleIdsKey(clusterArticles),
                          savedAtDataUpdatedAt: refreshedCluster.dataUpdatedAt,
                      },
            );
            await clustersQuery.refetch();
            await articlesQuery.refetch();
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to save cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const handleGenerateEmbedding = async () => {
        try {
            await generateArticleEmbeddingsMutation.mutateAsync();
            await articlesQuery.refetch();

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Embeddings generated',
                message: 'Article embeddings were generated successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to generate embeddings',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleGenerateClusterCandidates = async () => {
        if (isClusterActionPending) {
            return;
        }

        setIsClusterActionPending(true);

        try {
            const response =
                await generateClusterCandidatesMutation.mutateAsync();

            await clusterCandidatesQuery.refetch();

            if (selectedClusterCandidateId) {
                applyClusterSelection({ clusterId: null, candidateId: null });
            }

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Cluster candidates generated',
                message: `${response.meta.candidatesCreated} candidate cluster(s) created from ${response.meta.articlesChecked} article(s).`,
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to generate cluster candidates',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const handleAcceptClusterCandidate = async () => {
        if (isClusterActionPending) {
            return;
        }

        if (!selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No candidate selected',
                message: 'Select a cluster candidate before accepting.',
            });

            return;
        }

        setIsClusterActionPending(true);

        try {
            const response = await acceptClusterCandidateMutation.mutateAsync(
                selectedClusterCandidateId,
            );

            const createdCluster = response.cluster;

            applyClusterSelection({
                clusterId: createdCluster.id,
                candidateId: null,
            });

            await Promise.all([
                clustersQuery.refetch(),
                clusterCandidatesQuery.refetch(),
                articlesQuery.refetch(),
            ]);

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Candidate accepted',
                message: 'Cluster candidate was saved as a draft cluster.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to accept candidate',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const handleOpenDeleteClusterCandidateConfirm = () => {
        if (!selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No candidate selected',
                message: 'Select a cluster candidate before deleting.',
            });

            return;
        }

        setIsDeleteClusterCandidateConfirmOpen(true);
    };

    const handleConfirmDeleteClusterCandidate = async () => {
        if (isClusterActionPending || !selectedClusterCandidateId) {
            return;
        }

        setIsClusterActionPending(true);

        try {
            await deleteClusterCandidateMutation.mutateAsync(
                selectedClusterCandidateId,
            );

            applyClusterSelection({ clusterId: null, candidateId: null });
            setIsDeleteClusterCandidateConfirmOpen(false);

            await clusterCandidatesQuery.refetch();

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Candidate deleted',
                message: 'Cluster candidate was deleted successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to delete candidate',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const handleRemoveFromCluster = () => {
        if (isDraftLocked) {
            return;
        }

        if (selectedClusterCandidateId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Candidate cluster selected',
                message:
                    'Manual editing of algorithmic candidates will be added later.',
            });

            return;
        }

        const articlesToRemove = clusterArticles.filter((article) =>
            selectedClusterArticleIds.includes(article.id),
        );

        updateClusterDraft((currentArticles) =>
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
                    status: ARTICLE_STATUS.EMBEDDED,
                    embedding: Array.isArray(article.embedding)
                        ? article.embedding
                        : null,
                }),
            ),
        ]);

        setSelectedClusterArticleIds([]);

        if (articlesToRemove.length > 0) {
            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Articles removed',
                message: `${articlesToRemove.length} article(s) removed from the cluster draft.`,
            });
        }
    };

    const handleOpenDeleteClusterConfirm = () => {
        if (!selectedClusterId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No cluster selected',
                message: 'Select a cluster before deleting.',
            });

            return;
        }

        setIsDeleteClusterConfirmOpen(true);
    };

    const handleConfirmDeleteCluster = async () => {
        if (isClusterActionPending || !selectedClusterId) {
            return;
        }

        setIsClusterActionPending(true);

        try {
            await deleteClusterMutation.mutateAsync(selectedClusterId);

            applyClusterSelection({ clusterId: null, candidateId: null });
            setIsDeleteClusterConfirmOpen(false);

            await clustersQuery.refetch();
            await articlesQuery.refetch();

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Cluster deleted',
                message: 'The cluster was deleted successfully.',
            });
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to delete cluster',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        } finally {
            setIsClusterActionPending(false);
        }
    };

    const isLoading =
        clustersQuery.isLoading ||
        selectedClusterQuery.isLoading ||
        articlesQuery.isLoading ||
        clusterCandidatesQuery.isLoading;

    const clusteringQueries = [
        clustersQuery,
        selectedClusterQuery,
        articlesQuery,
        clusterCandidatesQuery,
    ];
    const isError = clusteringQueries.some(
        (query) => query.isError && !query.data,
    );
    const hasRefreshError = clusteringQueries.some(
        (query) => query.isError && query.data,
    );

    const handleRetryQueries = () => {
        void clustersQuery.refetch();
        void articlesQuery.refetch();
        void clusterCandidatesQuery.refetch();

        if (selectedClusterId) {
            void selectedClusterQuery.refetch();
        }
    };

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
                    onAction={handleRetryQueries}
                />
            </div>
        );
    }

    return (
        <div className="clustering">
            {hasRefreshError && (
                <PageState
                    variant="error"
                    title="Could not refresh clustering data"
                    description="Your cluster draft is still available. Retry to load the latest data."
                    actionLabel="Retry"
                    onAction={handleRetryQueries}
                />
            )}

            <div className="clustering__controls-grid">
                <section className="clustering__control-panel">
                    <div className="clustering__control-panel-header">
                        <div>
                            <h2>Cluster actions</h2>

                            <span className="clustering__control-counter">
                                {filteredClusterCandidates.length} candidate(s),{' '}
                                {filteredSavedClusters.length} saved cluster(s)
                            </span>
                        </div>

                        <div className="clustering__control-panel-actions">
                            <Button
                                onClick={handleGenerateClusterCandidates}
                                disabled={isClusterActionPending}
                            >
                                {generateClusterCandidatesMutation.isPending
                                    ? 'Generating...'
                                    : 'Generate candidates'}
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="clustering__control-panel clustering__control-panel--selected">
                    <div className="clustering__control-panel-header">
                        <div>
                            <h2>Selected actions</h2>

                            <span className="clustering__control-counter">
                                {selectedClusterCandidateId
                                    ? 'Candidate selected'
                                    : selectedClusterId
                                      ? 'Saved cluster selected'
                                      : 'No cluster selected'}
                            </span>

                            {hasUnsavedChanges && (
                                <span
                                    className="clustering__control-counter"
                                    role="status"
                                >
                                    Unsaved changes
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="clustering__control-panel-actions">
                        {selectedClusterCandidateId ? (
                            <>
                                <Button
                                    onClick={handleAcceptClusterCandidate}
                                    disabled={isClusterActionPending}
                                >
                                    {acceptClusterCandidateMutation.isPending
                                        ? 'Accepting...'
                                        : 'Accept candidate'}
                                </Button>

                                <Button
                                    onClick={
                                        handleOpenDeleteClusterCandidateConfirm
                                    }
                                    disabled={isClusterActionPending}
                                >
                                    {deleteClusterCandidateMutation.isPending
                                        ? 'Deleting...'
                                        : 'Delete candidate'}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    onClick={handleRemoveFromCluster}
                                    disabled={
                                        isDraftLocked ||
                                        selectedClusterArticleIds.length === 0
                                    }
                                >
                                    Remove
                                </Button>

                                <Button
                                    onClick={handleCreateCluster}
                                    disabled={
                                        isDraftLocked ||
                                        clusterArticles.length === 0 ||
                                        createClusterFromArticlesMutation.isPending
                                    }
                                >
                                    {createClusterFromArticlesMutation.isPending
                                        ? 'Creating...'
                                        : 'Create'}
                                </Button>

                                <Button
                                    onClick={handleSaveCluster}
                                    disabled={
                                        isDraftLocked ||
                                        !selectedClusterId ||
                                        clusterArticles.length === 0 ||
                                        updateClusterArticlesMutation.isPending
                                    }
                                >
                                    {updateClusterArticlesMutation.isPending
                                        ? 'Saving...'
                                        : 'Save'}
                                </Button>

                                <Button
                                    onClick={handleOpenDeleteClusterConfirm}
                                    disabled={
                                        isClusterActionPending ||
                                        !selectedClusterId ||
                                        deleteClusterMutation.isPending
                                    }
                                >
                                    {deleteClusterMutation.isPending
                                        ? 'Deleting...'
                                        : 'Delete'}
                                </Button>
                            </>
                        )}
                    </div>
                </section>

                <section className="clustering__control-panel">
                    <div className="clustering__control-panel-header">
                        <div>
                            <h2>Article actions</h2>

                            <span className="clustering__control-counter">
                                {filteredCandidateArticles.length} visible
                            </span>

                            <span className="clustering__control-counter clustering__control-counter--muted">
                                Selected: {selectedCandidateIds.length}
                            </span>
                        </div>

                        <div className="clustering__control-panel-actions">
                            <Button
                                onClick={handleAddToCluster}
                                disabled={
                                    isDraftLocked ||
                                    !hasAddableSelectedCandidates ||
                                    Boolean(selectedClusterCandidateId)
                                }
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
                    </div>
                </section>
            </div>

            <ExistingClusterSuggestions
                disabled={isDraftLocked}
                hasUnsavedChanges={hasUnsavedChanges}
                dataRevision={`${articlesQuery.dataUpdatedAt}:${clustersQuery.dataUpdatedAt}:${selectedClusterQuery.dataUpdatedAt}`}
                onBusyChange={setIsClusterActionPending}
                onOpenCluster={(clusterId) =>
                    requestClusterSelection({ clusterId, candidateId: null })
                }
            />

            <div
                className="clustering__workspace"
                aria-busy={isClusterActionPending}
            >
                <aside className="clustering__clusters">
                    <div className="clustering__panel-header">
                        <div>
                            <h2>Clusters</h2>
                            <p>
                                {filteredClusterCandidates.length} candidate(s),{' '}
                                {filteredSavedClusters.length} saved cluster(s)
                            </p>
                        </div>
                    </div>
                    <div className="clustering__column-filter">
                        <ClusterListFilters
                            filters={clusterListFilters}
                            totalCount={
                                clusterCandidates.length + clusters.length
                            }
                            filteredCount={
                                filteredClusterCandidates.length +
                                filteredSavedClusters.length
                            }
                            hasActiveFilters={hasActiveClusterListFilters}
                            onChange={handleChangeClusterListFilter}
                            onClear={handleClearClusterListFilters}
                        />
                    </div>

                    <div className="clustering__article-list">
                        {filteredClusterCandidates.length > 0 && (
                            <div className="clustering__candidate-group">
                                <h3 className="clustering__candidate-group-title">
                                    Algorithmic candidates
                                </h3>

                                {filteredClusterCandidates.map((candidate) => (
                                    <ClusterCard
                                        key={candidate.id}
                                        cluster={{
                                            id: candidate.id,
                                            title:
                                                candidate.title ??
                                                'Untitled candidate',
                                            summary: candidate.summary ?? null,
                                            status: 'CANDIDATE',
                                            articlesCount:
                                                candidate.articlesCount,
                                            averageSimilarity:
                                                candidate.averageSimilarity,
                                            similarityThreshold:
                                                candidate.similarityThreshold,
                                            timeWindowDays:
                                                candidate.timeWindowDays,
                                            badgeLabel: 'Candidate',
                                            badgeType: 'candidate',
                                        }}
                                        isActive={
                                            candidate.id ===
                                            selectedClusterCandidateId
                                        }
                                        onSelect={handleSelectClusterCandidate}
                                    />
                                ))}
                            </div>
                        )}

                        <div className="clustering__candidate-group">
                            <h3 className="clustering__candidate-group-title">
                                Saved clusters
                            </h3>

                            {filteredSavedClusters.length === 0 ? (
                                <PageState
                                    variant="empty"
                                    title={
                                        hasActiveClusterListFilters
                                            ? 'No clusters match filters'
                                            : 'No clusters yet'
                                    }
                                    description={
                                        hasActiveClusterListFilters
                                            ? 'Try changing cluster search, status or sorting.'
                                            : 'Create a cluster from embedded candidate articles to start grouping related news.'
                                    }
                                    className="clustering__side-state"
                                />
                            ) : (
                                filteredSavedClusters.map((cluster) => (
                                    <ClusterCard
                                        key={cluster.id}
                                        cluster={{
                                            id: cluster.id,
                                            humanId: cluster.humanId,
                                            title: cluster.title,
                                            summary: cluster.summary ?? null,
                                            status: cluster.status,
                                            articlesCount:
                                                cluster._count?.articleLinks ??
                                                0,
                                            averageSimilarity:
                                                cluster.averageSimilarity ??
                                                null,
                                        }}
                                        isActive={
                                            cluster.id === selectedClusterId
                                        }
                                        onSelect={handleSelectCluster}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </aside>

                <section className="clustering__selected-cluster">
                    <div className="clustering__panel-header">
                        <div>
                            <h2>
                                {selectedClusterCandidate?.title ??
                                    selectedCluster?.title ??
                                    (clusterArticles.length > 0
                                        ? 'New cluster draft'
                                        : 'Cluster draft')}
                            </h2>

                            {selectedClusterCandidate ? (
                                <p>
                                    Candidate ·{' '}
                                    {selectedClusterCandidate.articlesCount}{' '}
                                    article(s) · avg sim{' '}
                                    <strong>
                                        {formatSimilarity(
                                            selectedClusterCandidate.averageSimilarity,
                                        )}
                                    </strong>
                                </p>
                            ) : (
                                <p>
                                    Average similarity:{' '}
                                    <strong>
                                        {clusterMetrics.averageSimilarity.toFixed(
                                            3,
                                        )}
                                    </strong>
                                </p>
                            )}
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
                        ) : selectedClusterCandidateId ? (
                            <PageState
                                variant="empty"
                                title="No candidate articles"
                                description="This cluster candidate has no articles."
                                className="clustering__main-state"
                            />
                        ) : (
                            <PageState
                                variant="empty"
                                title="No cluster selected"
                                description="Select a cluster from the left panel to review its articles, or generate algorithmic candidates."
                                className="clustering__main-state"
                            />
                        )}
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
                    <div className="clustering__column-filter">
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
                                description="Try changing search, date, source, status, embedding, similarity or selected-only filters."
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
                </section>
            </div>

            <ConfirmModal
                isOpen={pendingClusterSelection !== null}
                title="Discard unsaved changes?"
                description="The cluster draft has unsaved changes. Discard them to change the selected cluster, or keep editing to save your work."
                confirmLabel="Discard changes"
                cancelLabel="Keep editing"
                variant="warning"
                onConfirm={() => {
                    if (pendingClusterSelection && !isClusterActionPending) {
                        applyClusterSelection(pendingClusterSelection);
                    }
                }}
                onCancel={() => setPendingClusterSelection(null)}
            />

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

            <ConfirmModal
                isOpen={isDeleteClusterCandidateConfirmOpen}
                title="Delete cluster candidate?"
                description="This action will delete the selected algorithmic cluster candidate. Articles will not be deleted."
                confirmLabel="Delete candidate"
                cancelLabel="Cancel"
                variant="danger"
                isLoading={deleteClusterCandidateMutation.isPending}
                onConfirm={handleConfirmDeleteClusterCandidate}
                onCancel={() => setIsDeleteClusterCandidateConfirmOpen(false)}
            />
        </div>
    );
};
