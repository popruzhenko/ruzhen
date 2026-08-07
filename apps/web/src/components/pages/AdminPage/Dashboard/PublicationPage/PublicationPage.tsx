import { useMemo, useState } from 'react';

import {
    useClusterByIdQuery,
    useClustersQuery,
} from '../../../../../entities/cluster';

import {
    useUpdateClusterStatusMutation,
    type PublicationClusterStatus,
} from '../../../../../entities/publication';

import { ConfirmModal } from '../../../../ui/Modal/ConfirmModal/ConfirmModal';
import { ClusterBlock } from '../../../../ui/ClusterBlock/ClusterBlock';
import { PageState } from '../../../../ui/PageState/PageState';

import { Button } from '../../../../ui/Button/Button';
import { Badge } from '../../../../ui/Badge/Badge';
import type { BadgeVariants } from '../../../../ui/Badge/TypesBadge';

import { ClusterCard } from '../ClusteringPage/ClusteringCards/ClusterCard';

import { PublicationFilters } from './PublicationFilters/PublicationFilters';
import type { PublicationFiltersState } from './PublicationFilters/TypesPublicationFilters';

import { isDateInFetchedRange } from '../lib/DateHelper';
import { getSourceCountThreshold } from '../lib/SourceCountThresholdHelper';

import { useToast } from '../../../../ui/Toast/ToastProvider';

import './PublicationPage.scss';

const initialPublicationFilters: PublicationFiltersState = {
    search: '',
    status: 'ALL',
    updatedDate: 'ALL',
    sourceCount: 'ALL',
};

type PublicationValidationCluster = {
    title?: string | null;
    summary?: string | null;
    blocks?: Array<{
        type: 'FACT' | 'CONTEXT' | 'OPINION';
        content?: string | null;
    }>;
};

const getClusterBlocksSearchText = (cluster: unknown): string => {
    if (typeof cluster !== 'object' || cluster === null) {
        return '';
    }

    if (!('blocks' in cluster) || !Array.isArray(cluster.blocks)) {
        return '';
    }

    return cluster.blocks
        .map((block) => {
            if (typeof block !== 'object' || block === null) {
                return '';
            }

            const values = [
                'title' in block && typeof block.title === 'string'
                    ? block.title
                    : '',
                'content' in block && typeof block.content === 'string'
                    ? block.content
                    : '',
                'sourceName' in block && typeof block.sourceName === 'string'
                    ? block.sourceName
                    : '',
                'sourceUrl' in block && typeof block.sourceUrl === 'string'
                    ? block.sourceUrl
                    : '',
                'authorName' in block && typeof block.authorName === 'string'
                    ? block.authorName
                    : '',
                'stance' in block && typeof block.stance === 'string'
                    ? block.stance
                    : '',
            ];

            return values.join(' ');
        })
        .join(' ')
        .toLowerCase();
};

const getStatusSuccessMessage = (status: PublicationClusterStatus): string => {
    if (status === 'PUBLISHED') {
        return 'Article was published successfully.';
    }

    if (status === 'DRAFT') {
        return 'Article was moved back to draft.';
    }

    return 'Article was archived successfully.';
};

const getStatusSuccessTitle = (status: PublicationClusterStatus): string => {
    if (status === 'PUBLISHED') {
        return 'Article published';
    }

    if (status === 'DRAFT') {
        return 'Moved to draft';
    }

    return 'Article archived';
};

const getPublicationValidationErrors = (
    cluster: PublicationValidationCluster,
) => {
    const errors: string[] = [];

    const blocks = cluster.blocks ?? [];

    const facts = blocks.filter((block) => block.type === 'FACT');
    const context = blocks.filter((block) => block.type === 'CONTEXT');

    const hasEmptyBlockContent = blocks.some((block) => !block.content?.trim());

    if (!cluster.title?.trim()) {
        errors.push('Title is required.');
    }

    if (!cluster.summary?.trim()) {
        errors.push('Summary is required.');
    }

    if (facts.length === 0) {
        errors.push('At least one fact block is required.');
    }

    if (context.length === 0) {
        errors.push('At least one context block is required.');
    }

    if (hasEmptyBlockContent) {
        errors.push('All semantic blocks must have content.');
    }

    return errors;
};

const getPublicationWarnings = (cluster: PublicationValidationCluster) => {
    const warnings: string[] = [];

    const blocks = cluster.blocks ?? [];
    const opinions = blocks.filter((block) => block.type === 'OPINION');

    if (opinions.length === 0) {
        warnings.push('No opinion blocks were added.');
    }

    return warnings;
};

export const PublicationPage = () => {
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
        null,
    );

    const [filters, setFilters] = useState<PublicationFiltersState>(
        initialPublicationFilters,
    );

    const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);

    const { showToast } = useToast();

    const clustersQuery = useClustersQuery({ page: 1, limit: 500 });
    const selectedClusterQuery = useClusterByIdQuery(selectedClusterId);
    const updateStatusMutation = useUpdateClusterStatusMutation();

    const clusters = clustersQuery.data?.clusters ?? [];
    const selectedCluster = selectedClusterQuery.data ?? null;

    const selectedFacts =
        selectedCluster?.blocks
            ?.filter((block) => block.type === 'FACT')
            .sort((a, b) => a.position - b.position) ?? [];

    const selectedContext =
        selectedCluster?.blocks
            ?.filter((block) => block.type === 'CONTEXT')
            .sort((a, b) => a.position - b.position) ?? [];

    const selectedOpinions =
        selectedCluster?.blocks
            ?.filter((block) => block.type === 'OPINION')
            .sort((a, b) => a.position - b.position) ?? [];

    const filteredClusters = useMemo(() => {
        const sourceCountThreshold = getSourceCountThreshold(
            filters.sourceCount,
        );

        return clusters
            .filter((cluster) => {
                const search = filters.search.trim().toLowerCase();
                const blockSearchText = getClusterBlocksSearchText(cluster);

                const articlesCount = cluster._count?.articleLinks ?? 0;

                const matchesSearch =
                    search.length === 0 ||
                    cluster.title.toLowerCase().includes(search) ||
                    cluster.summary?.toLowerCase().includes(search) ||
                    blockSearchText.includes(search) ||
                    cluster.id.toLowerCase().includes(search) ||
                    cluster.humanId.toLowerCase().includes(search);

                const matchesStatus =
                    filters.status === 'ALL' ||
                    cluster.status === filters.status;

                const matchesUpdatedDate = isDateInFetchedRange(
                    cluster.updatedAt,
                    filters.updatedDate,
                );

                const matchesSourceCount =
                    sourceCountThreshold === null ||
                    articlesCount >= sourceCountThreshold;

                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesUpdatedDate &&
                    matchesSourceCount
                );
            })
            .sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            );
    }, [clusters, filters]);

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.status !== 'ALL' ||
        filters.updatedDate !== 'ALL' ||
        filters.sourceCount !== 'ALL';

    const handleSelectCluster = (clusterId: string) => {
        setSelectedClusterId((currentId) =>
            currentId === clusterId ? null : clusterId,
        );

        setIsPublishConfirmOpen(false);
    };

    const handleChangeFilter = <K extends keyof PublicationFiltersState>(
        key: K,
        value: PublicationFiltersState[K],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearFilters = () => {
        setFilters(initialPublicationFilters);
    };

    const handleUpdateStatus = async (status: PublicationClusterStatus) => {
        if (!selectedClusterId) {
            showToast({
                type: 'warning',
                title: 'No article selected',
                message:
                    'Select an article before changing publication status.',
            });

            return;
        }

        try {
            await updateStatusMutation.mutateAsync({
                clusterId: selectedClusterId,
                status,
            });

            await selectedClusterQuery.refetch();
            await clustersQuery.refetch();

            showToast({
                type: 'success',
                title: getStatusSuccessTitle(status),
                message: getStatusSuccessMessage(status),
            });
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Failed to update status',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleOpenPublishConfirm = () => {
        if (!selectedCluster) {
            showToast({
                type: 'warning',
                title: 'No article selected',
                message: 'Select an article before publishing.',
            });

            return;
        }

        const errors = getPublicationValidationErrors(selectedCluster);

        if (errors.length > 0) {
            showToast({
                type: 'error',
                title: 'Article is not ready to publish',
                message: errors.join(' '),
                autoCloseMs: 7000,
            });

            return;
        }

        const warnings = getPublicationWarnings(selectedCluster);

        if (warnings.length > 0) {
            showToast({
                type: 'warning',
                title: 'Publication warning',
                message: `${warnings.join(' ')} You can still publish this article.`,
                autoCloseMs: 7000,
            });
        }

        setIsPublishConfirmOpen(true);
    };

    const handleConfirmPublish = async () => {
        if (!selectedCluster) {
            showToast({
                type: 'warning',
                title: 'No article selected',
                message: 'Select an article before publishing.',
            });

            setIsPublishConfirmOpen(false);
            return;
        }

        const errors = getPublicationValidationErrors(selectedCluster);

        if (errors.length > 0) {
            showToast({
                type: 'error',
                title: 'Article is not ready to publish',
                message: errors.join(' '),
                autoCloseMs: 7000,
            });

            setIsPublishConfirmOpen(false);
            return;
        }

        await handleUpdateStatus('PUBLISHED');
        setIsPublishConfirmOpen(false);
    };

    const isLoading = clustersQuery.isLoading || selectedClusterQuery.isLoading;
    const isError = clustersQuery.isError || selectedClusterQuery.isError;

    if (isLoading) {
        return (
            <div className="publication">
                <PageState
                    variant="loading"
                    title="Loading publication data"
                    description="Please wait while Ruzhen loads articles and publication status."
                />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="publication">
                <PageState
                    variant="error"
                    title="Failed to load publication data"
                    description="Please refresh the page or try again later."
                    actionLabel="Retry"
                    onAction={() => {
                        void clustersQuery.refetch();

                        if (selectedClusterId) {
                            void selectedClusterQuery.refetch();
                        }
                    }}
                />
            </div>
        );
    }

    return (
        <div className="publication">
            <PublicationFilters
                filters={filters}
                totalCount={clusters.length}
                filteredCount={filteredClusters.length}
                hasActiveFilters={hasActiveFilters}
                onChange={handleChangeFilter}
                onClear={handleClearFilters}
            />

            <div className="publication__workspace">
                <aside className="publication__clusters">
                    <div className="publication__panel-header">
                        <h2>Articles</h2>
                    </div>

                    <div className="publication__cluster-list">
                        {clusters.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No articles for publication"
                                description="Contextualized cluster articles will appear here before publication."
                                className="publication__side-state"
                            />
                        ) : filteredClusters.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No articles match filters"
                                description="Try changing search, status, date or source count filters."
                                actionLabel="Clear filters"
                                onAction={handleClearFilters}
                                className="publication__side-state"
                            />
                        ) : (
                            filteredClusters.map((cluster) => (
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
                                        averageSimilarity: 0,
                                    }}
                                    isActive={cluster.id === selectedClusterId}
                                    onSelect={handleSelectCluster}
                                />
                            ))
                        )}
                    </div>
                </aside>

                <main className="publication__preview">
                    {!selectedCluster ? (
                        <PageState
                            variant="empty"
                            title="No article selected"
                            description="Select a contextualized article to preview and control its publication status."
                            className="publication__main-state"
                        />
                    ) : (
                        <>
                            <div className="publication__preview-header">
                                <div>
                                    <span className="publication__id">
                                        ID: {selectedCluster.id}
                                    </span>

                                    <h1>{selectedCluster.title}</h1>

                                    {selectedCluster.summary && (
                                        <p className="publication__summary">
                                            {selectedCluster.summary}
                                        </p>
                                    )}
                                </div>

                                <Badge
                                    type={
                                        selectedCluster.status.toLowerCase() as BadgeVariants
                                    }
                                >
                                    {selectedCluster.status}
                                </Badge>
                            </div>

                            <div className="publication__meta">
                                <div>
                                    <span>Status</span>
                                    <strong>{selectedCluster.status}</strong>
                                </div>

                                <div>
                                    <span>Published</span>
                                    <strong>
                                        {selectedCluster.publishedAt
                                            ? new Date(
                                                  selectedCluster.publishedAt,
                                              ).toLocaleString()
                                            : '—'}
                                    </strong>
                                </div>

                                <div>
                                    <span>Updated</span>
                                    <strong>
                                        {new Date(
                                            selectedCluster.updatedAt,
                                        ).toLocaleString()}
                                    </strong>
                                </div>

                                <div>
                                    <span>Sources</span>
                                    <strong>
                                        {selectedCluster.articles?.length ?? 0}
                                    </strong>
                                </div>
                            </div>

                            <article className="publication__article">
                                <section className="publication__block-group">
                                    <h2>Facts</h2>

                                    {selectedFacts.length > 0 ? (
                                        selectedFacts.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                            />
                                        ))
                                    ) : (
                                        <PageState
                                            variant="empty"
                                            title="No fact blocks"
                                            description="No fact blocks were added for this article."
                                            className="publication__block-state"
                                        />
                                    )}
                                </section>

                                <section className="publication__block-group">
                                    <h2>Context</h2>

                                    {selectedContext.length > 0 ? (
                                        selectedContext.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                            />
                                        ))
                                    ) : (
                                        <PageState
                                            variant="empty"
                                            title="No context blocks"
                                            description="No context blocks were added for this article."
                                            className="publication__block-state"
                                        />
                                    )}
                                </section>

                                <section className="publication__block-group">
                                    <h2>Opinions</h2>

                                    {selectedOpinions.length > 0 ? (
                                        selectedOpinions.map((block) => (
                                            <ClusterBlock
                                                key={block.id}
                                                id={block.id}
                                                type={block.type}
                                                title={block.title}
                                                content={block.content}
                                                sourceName={block.sourceName}
                                                sourceUrl={block.sourceUrl}
                                                stance={block.stance}
                                            />
                                        ))
                                    ) : (
                                        <PageState
                                            variant="empty"
                                            title="No opinion blocks"
                                            description="No opinion blocks were added for this article."
                                            className="publication__block-state"
                                        />
                                    )}
                                </section>
                            </article>
                        </>
                    )}

                    <div className="publication__actions">
                        <div className="publication__block-actions">
                            <Button
                                onClick={handleOpenPublishConfirm}
                                disabled={
                                    !selectedCluster ||
                                    selectedCluster.status === 'PUBLISHED' ||
                                    updateStatusMutation.isPending
                                }
                            >
                                Publish
                            </Button>

                            <Button
                                variants="secondary"
                                onClick={() => handleUpdateStatus('DRAFT')}
                                disabled={
                                    !selectedCluster ||
                                    selectedCluster.status === 'DRAFT' ||
                                    updateStatusMutation.isPending
                                }
                            >
                                Move to draft
                            </Button>

                            <Button
                                variants="secondary"
                                onClick={() => handleUpdateStatus('ARCHIVED')}
                                disabled={
                                    !selectedCluster ||
                                    selectedCluster.status === 'ARCHIVED' ||
                                    updateStatusMutation.isPending
                                }
                            >
                                Archive
                            </Button>
                        </div>
                    </div>
                </main>
            </div>

            <ConfirmModal
                isOpen={isPublishConfirmOpen}
                title="Publish article?"
                description="This article will become visible on the public site."
                confirmLabel="Publish"
                cancelLabel="Cancel"
                variant="warning"
                isLoading={updateStatusMutation.isPending}
                onConfirm={handleConfirmPublish}
                onCancel={() => setIsPublishConfirmOpen(false)}
            />
        </div>
    );
};
