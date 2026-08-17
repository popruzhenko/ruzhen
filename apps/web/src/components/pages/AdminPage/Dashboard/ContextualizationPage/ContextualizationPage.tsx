import { useEffect, useMemo, useState } from 'react';

import {
    useClusterByIdQuery,
    useClustersQuery,
} from '../../../../../entities/cluster';

import { useGenerateAnalyzedNewsMutation } from '../../../../../entities/contextualization';

import { useSaveContextDraftMutation } from '../../../../../entities/contextualization/model/useSaveContextDraftMutation';

import { Button } from '../../../../ui/Button/Button';
import { Badge } from '../../../../ui/Badge/Badge';
import type { BadgeVariants } from '../../../../ui/Badge/TypesBadge';
import { PageState } from '../../../../ui/PageState/PageState';
import { ConfirmModal } from '../../../../ui/Modal/ConfirmModal/ConfirmModal';
import { useToast } from '../../../../ui/Toast/ToastProvider';

import { ClusterCard } from '../ClusteringPage/ClusteringCards/ClusterCard';
import { ContextualizationCard } from './ContextualizationCards/ContextualizationCard';
import { ContextualizationFilters } from './ContextualizationFilters/ContextualizationFilters';

import type { ContextualizationFiltersState } from './ContextualizationFilters/TypesContextualizationFilters';

import { isDateInFetchedRange } from '../lib/DateHelper';
import { getSourceCountThreshold } from '../lib/SourceCountThresholdHelper';

import './ContextualizationPage.scss';
import { TOAST_TYPE } from '../../../../ui/Toast/ToastConstants';

type ContextBlockType = 'FACT' | 'CONTEXT' | 'OPINION';
type OpinionStance = 'PRO' | 'CONTRA' | 'NEUTRAL';

type ContextBlockField =
    'title' | 'content' | 'stance' | 'sourceName' | 'sourceUrl' | 'authorName';

interface ContextBlockDraft {
    id: string;
    type: ContextBlockType;
    title: string | null;
    content: string;
    stance: OpinionStance | null;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    createdAt?: string;
    updatedAt?: string;
}

interface ContextDraftValidationInput {
    title: string;
    summary: string;
    blocks: ContextBlockDraft[];
}

const initialContextualizationFilters: ContextualizationFiltersState = {
    search: '',
    status: 'ALL',
    draftState: 'ALL',
    updatedDate: 'ALL',
    sourceCount: 'ALL',
};

const createEmptyBlock = (
    type: ContextBlockType,
    position: number,
): ContextBlockDraft => {
    return {
        id: crypto.randomUUID(),
        type,
        title: '',
        content: '',
        stance: type === 'OPINION' ? 'NEUTRAL' : null,
        position,
        sourceName: null,
        sourceUrl: null,
        authorName: null,
    };
};

const isValidHttpUrl = (value: string) => {
    try {
        const url = new URL(value);

        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
};

const getContextDraftValidationErrors = ({
    title,
    summary,
    blocks,
}: ContextDraftValidationInput) => {
    const errors: string[] = [];

    if (!title.trim()) {
        errors.push('Title is required.');
    }

    if (!summary.trim()) {
        errors.push('Summary is required.');
    }

    if (blocks.length === 0) {
        errors.push('At least one semantic block is required.');
    }

    const hasEmptyBlockContent = blocks.some((block) => !block.content.trim());

    if (hasEmptyBlockContent) {
        errors.push('All semantic blocks must have content.');
    }

    const hasOpinionWithoutStance = blocks.some(
        (block) => block.type === 'OPINION' && !block.stance,
    );

    if (hasOpinionWithoutStance) {
        errors.push('Every opinion block must have a stance.');
    }

    const hasInvalidSourceUrl = blocks.some((block) => {
        const sourceUrl = block.sourceUrl?.trim();

        if (!sourceUrl) {
            return false;
        }

        return !isValidHttpUrl(sourceUrl);
    });

    if (hasInvalidSourceUrl) {
        errors.push('Source URLs must be valid http or https URLs.');
    }

    return errors;
};

const getContextDraftWarnings = ({ blocks }: ContextDraftValidationInput) => {
    const warnings: string[] = [];

    const hasBlockWithoutSourceName = blocks.some(
        (block) => !block.sourceName?.trim(),
    );

    const hasBlockWithoutSourceUrl = blocks.some(
        (block) => !block.sourceUrl?.trim(),
    );

    if (hasBlockWithoutSourceName) {
        warnings.push('Some blocks do not have source names.');
    }

    if (hasBlockWithoutSourceUrl) {
        warnings.push('Some blocks do not have source URLs.');
    }

    return warnings;
};

const getClusterBlocksCount = (cluster: unknown): number => {
    if (typeof cluster !== 'object' || cluster === null) {
        return 0;
    }

    if ('blocks' in cluster && Array.isArray(cluster.blocks)) {
        return cluster.blocks.length;
    }

    if (
        '_count' in cluster &&
        typeof cluster._count === 'object' &&
        cluster._count !== null &&
        'blocks' in cluster._count &&
        typeof cluster._count.blocks === 'number'
    ) {
        return cluster._count.blocks;
    }

    return 0;
};

const getClusterUpdatedAt = (cluster: unknown): string | null => {
    if (typeof cluster !== 'object' || cluster === null) {
        return null;
    }

    if (!('updatedAt' in cluster)) {
        return null;
    }

    if (typeof cluster.updatedAt === 'string') {
        return cluster.updatedAt;
    }

    if (cluster.updatedAt instanceof Date) {
        return cluster.updatedAt.toISOString();
    }

    return null;
};

export const ContextualizationPage = () => {
    const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
        null,
    );

    const [draftTitle, setDraftTitle] = useState('');
    const [draftSummary, setDraftSummary] = useState('');
    const [blocks, setBlocks] = useState<ContextBlockDraft[]>([]);

    const [blockIdToRemove, setBlockIdToRemove] = useState<string | null>(null);

    const [filters, setFilters] = useState<ContextualizationFiltersState>(
        initialContextualizationFilters,
    );

    const { showToast } = useToast();

    const clustersQuery = useClustersQuery({ page: 1, limit: 500 });
    const selectedClusterQuery = useClusterByIdQuery(selectedClusterId);

    const generateAnalyzedNewsMutation = useGenerateAnalyzedNewsMutation();
    const saveContextDraftMutation = useSaveContextDraftMutation();

    const clusters = clustersQuery.data?.clusters ?? [];
    const selectedCluster = selectedClusterQuery.data ?? null;

    const blockToRemove = blocks.find((block) => block.id === blockIdToRemove);

    const filteredClusters = useMemo(() => {
        const sourceCountThreshold = getSourceCountThreshold(
            filters.sourceCount,
        );

        return clusters.filter((cluster) => {
            const search = filters.search.trim().toLowerCase();

            const articlesCount = cluster._count?.articleLinks ?? 0;
            const blocksCount = getClusterBlocksCount(cluster);
            const updatedAt = getClusterUpdatedAt(cluster);

            const matchesSearch =
                search.length === 0 ||
                cluster.title.toLowerCase().includes(search) ||
                cluster.summary?.toLowerCase().includes(search) ||
                cluster.id.toLowerCase().includes(search) ||
                cluster.humanId.toLowerCase().includes(search);

            const matchesStatus =
                filters.status === 'ALL' || cluster.status === filters.status;

            const matchesDraftState =
                filters.draftState === 'ALL' ||
                (filters.draftState === 'WITHOUT_BLOCKS' &&
                    blocksCount === 0) ||
                (filters.draftState === 'WITH_BLOCKS' && blocksCount > 0) ||
                (filters.draftState === 'READY_TO_REVIEW' &&
                    blocksCount > 0 &&
                    Boolean(cluster.title?.trim()) &&
                    Boolean(cluster.summary?.trim()));

            const matchesUpdatedDate = isDateInFetchedRange(
                updatedAt,
                filters.updatedDate,
            );

            const matchesSourceCount =
                sourceCountThreshold === null ||
                articlesCount >= sourceCountThreshold;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesDraftState &&
                matchesUpdatedDate &&
                matchesSourceCount
            );
        });
    }, [clusters, filters]);

    const hasActiveFilters =
        filters.search.trim() !== '' ||
        filters.status !== 'ALL' ||
        filters.draftState !== 'ALL' ||
        filters.updatedDate !== 'ALL' ||
        filters.sourceCount !== 'ALL';

    const handleChangeFilter = <K extends keyof ContextualizationFiltersState>(
        key: K,
        value: ContextualizationFiltersState[K],
    ) => {
        setFilters((currentFilters) => ({
            ...currentFilters,
            [key]: value,
        }));
    };

    const handleClearFilters = () => {
        setFilters(initialContextualizationFilters);
    };

    useEffect(() => {
        if (!selectedCluster) {
            setDraftTitle('');
            setDraftSummary('');
            setBlocks([]);
            setBlockIdToRemove(null);
            return;
        }

        setDraftTitle(selectedCluster.title ?? '');
        setDraftSummary(selectedCluster.summary ?? '');
        setBlockIdToRemove(null);

        const clusterBlocks = selectedCluster.blocks ?? [];

        if (clusterBlocks.length > 0) {
            setBlocks(
                clusterBlocks
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((block) => ({
                        id: block.id,
                        type: block.type,
                        title: block.title,
                        content: block.content,
                        stance: block.stance,
                        position: block.position,
                        sourceName: block.sourceName,
                        sourceUrl: block.sourceUrl,
                        authorName: block.authorName,
                        createdAt: block.createdAt,
                        updatedAt: block.updatedAt,
                    })),
            );

            return;
        }

        setBlocks([
            createEmptyBlock('FACT', 1),
            createEmptyBlock('CONTEXT', 2),
            createEmptyBlock('OPINION', 3),
        ]);
    }, [selectedCluster?.id]);

    const handleSelectCluster = (clusterId: string) => {
        const isSameCluster = clusterId === selectedClusterId;

        if (isSameCluster) {
            setSelectedClusterId(null);
            return;
        }

        setSelectedClusterId(clusterId);
    };

    const handleAddBlock = (type: ContextBlockType) => {
        setBlocks((currentBlocks) => [
            ...currentBlocks,
            createEmptyBlock(type, currentBlocks.length + 1),
        ]);
    };

    const handleUpdateBlock = (
        blockId: string,
        field: ContextBlockField,
        value: string,
    ) => {
        setBlocks((currentBlocks) =>
            currentBlocks.map((block) => {
                if (block.id !== blockId) {
                    return block;
                }

                return {
                    ...block,
                    [field]: value,
                };
            }),
        );
    };

    const handleOpenRemoveBlockConfirm = (blockId: string) => {
        setBlockIdToRemove(blockId);
    };

    const handleConfirmRemoveBlock = () => {
        if (!blockIdToRemove) {
            return;
        }

        const removedBlock = blocks.find(
            (block) => block.id === blockIdToRemove,
        );

        setBlocks((currentBlocks) =>
            currentBlocks
                .filter((block) => block.id !== blockIdToRemove)
                .map((block, index) => ({
                    ...block,
                    position: index + 1,
                })),
        );

        setBlockIdToRemove(null);

        showToast({
            type: TOAST_TYPE.INFO,
            title: 'Block removed',
            message: removedBlock
                ? `${removedBlock.type} block was removed from the draft. Click Save draft to persist changes.`
                : 'Block was removed from the draft. Click Save draft to persist changes.',
        });
    };

    const handleGenerateDraft = async () => {
        if (!selectedClusterId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No cluster selected',
                message: 'Select a cluster before generating a draft.',
            });

            return;
        }

        try {
            const response =
                await generateAnalyzedNewsMutation.mutateAsync(
                    selectedClusterId,
                );

            setDraftTitle(response.cluster.title);
            setDraftSummary(response.cluster.summary ?? '');

            setBlocks(
                response.blocks
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((block) => ({
                        id: block.id,
                        type: block.type,
                        title: block.title,
                        content: block.content,
                        stance: block.stance,
                        position: block.position,
                        sourceName: block.sourceName,
                        sourceUrl: block.sourceUrl,
                        authorName: block.authorName,
                        createdAt: block.createdAt,
                        updatedAt: block.updatedAt,
                    })),
            );

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Draft generated',
                message: 'Semantic blocks were generated successfully.',
            });

            await clustersQuery.refetch();
            await selectedClusterQuery.refetch();
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to generate draft',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const handleSaveDraft = async () => {
        if (!selectedClusterId) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'No cluster selected',
                message: 'Select a cluster before saving a draft.',
            });

            return;
        }

        const validationInput: ContextDraftValidationInput = {
            title: draftTitle,
            summary: draftSummary,
            blocks,
        };

        const errors = getContextDraftValidationErrors(validationInput);

        if (errors.length > 0) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Draft is not ready to save',
                message: errors.join(' '),
                autoCloseMs: 7000,
            });

            return;
        }

        const warnings = getContextDraftWarnings(validationInput);

        if (warnings.length > 0) {
            showToast({
                type: TOAST_TYPE.WARNING,
                title: 'Draft quality warning',
                message: `${warnings.join(' ')} You can still save this draft.`,
                autoCloseMs: 7000,
            });
        }

        try {
            const response = await saveContextDraftMutation.mutateAsync({
                clusterId: selectedClusterId,
                payload: {
                    title: draftTitle.trim(),
                    summary: draftSummary.trim(),
                    blocks: blocks.map((block, index) => ({
                        type: block.type,
                        title: block.title?.trim() || null,
                        content: block.content.trim(),
                        position: index + 1,
                        sourceName: block.sourceName?.trim() || null,
                        sourceUrl: block.sourceUrl?.trim() || null,
                        authorName: block.authorName?.trim() || null,
                        stance:
                            block.type === 'OPINION'
                                ? (block.stance ?? 'NEUTRAL')
                                : null,
                    })),
                },
            });

            setDraftTitle(response.cluster.title);
            setDraftSummary(response.cluster.summary ?? '');

            setBlocks(
                response.blocks
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((block) => ({
                        id: block.id,
                        type: block.type,
                        title: block.title,
                        content: block.content,
                        stance: block.stance,
                        position: block.position,
                        sourceName: block.sourceName,
                        sourceUrl: block.sourceUrl,
                        authorName: block.authorName,
                        createdAt: block.createdAt,
                        updatedAt: block.updatedAt,
                    })),
            );

            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Draft saved',
                message: 'Contextual draft was saved successfully.',
            });

            await clustersQuery.refetch();
            await selectedClusterQuery.refetch();
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title: 'Failed to save draft',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unknown error occurred.',
            });
        }
    };

    const isLoading = clustersQuery.isLoading || selectedClusterQuery.isLoading;
    const isError = clustersQuery.isError || selectedClusterQuery.isError;

    if (isLoading) {
        return (
            <div className="contextualization">
                <PageState
                    variant="loading"
                    title="Loading contextualization data"
                    description="Please wait while Ruzhen loads clusters and semantic draft data."
                />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="contextualization">
                <PageState
                    variant="error"
                    title="Failed to load contextualization data"
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
        <div className="contextualization">
            <ContextualizationFilters
                filters={filters}
                totalCount={clusters.length}
                filteredCount={filteredClusters.length}
                hasActiveFilters={hasActiveFilters}
                onChange={handleChangeFilter}
                onClear={handleClearFilters}
            />

            <div className="contextualization__workspace">
                <aside className="contextualization__clusters">
                    <div className="contextualization__panel-header">
                        <h2>Clusters</h2>
                    </div>

                    <div className="contextualization__cluster-list">
                        {clusters.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No clusters yet"
                                description="Clustered articles will appear here before contextualization."
                                className="contextualization__side-state"
                            />
                        ) : filteredClusters.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No clusters match filters"
                                description="Try changing search, status, draft state, date or source count filters."
                                actionLabel="Clear filters"
                                onAction={handleClearFilters}
                                className="contextualization__side-state"
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

                <section className="contextualization__draft">
                    {!selectedCluster ? (
                        <PageState
                            variant="empty"
                            title="No cluster selected"
                            description="Select a cluster from the left panel to generate and edit its contextual draft."
                            className="contextualization__main-state"
                        />
                    ) : (
                        <>
                            <div className="contextualization__draft-header">
                                <div>
                                    <span className="contextualization__id">
                                        ID: {selectedCluster.id}
                                    </span>

                                    <h2 className="contextualization__title">
                                        {selectedCluster.title}
                                    </h2>

                                    <Badge
                                        type={
                                            selectedCluster.status.toLowerCase() as BadgeVariants
                                        }
                                    >
                                        {selectedCluster.status}
                                    </Badge>
                                </div>
                            </div>

                            <div className="contextualization__content">
                                <section className="contextualization__editor">
                                    <label className="contextualization__field">
                                        <span>Title</span>

                                        <input
                                            value={draftTitle}
                                            onChange={(event) =>
                                                setDraftTitle(
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="Generated article title"
                                        />
                                    </label>

                                    <label className="contextualization__field contextualization__field--summary">
                                        <span>Summary</span>

                                        <textarea
                                            value={draftSummary}
                                            onChange={(event) =>
                                                setDraftSummary(
                                                    event.target.value,
                                                )
                                            }
                                            placeholder="Short summary of the cluster"
                                        />
                                    </label>
                                </section>
                            </div>
                        </>
                    )}

                    <div className="contextualization__actions">
                        <div className="contextualization__draft-actions">
                            <Button
                                onClick={handleGenerateDraft}
                                disabled={
                                    !selectedClusterId ||
                                    generateAnalyzedNewsMutation.isPending
                                }
                            >
                                {generateAnalyzedNewsMutation.isPending
                                    ? 'Generating...'
                                    : 'Generate draft'}
                            </Button>

                            <Button
                                onClick={handleSaveDraft}
                                disabled={
                                    !selectedClusterId ||
                                    saveContextDraftMutation.isPending
                                }
                            >
                                {saveContextDraftMutation.isPending
                                    ? 'Saving...'
                                    : 'Save draft'}
                            </Button>
                        </div>
                    </div>
                </section>

                <section className="contextualization__draft">
                    <div className="contextualization__blocks-header">
                        <h3>Semantic blocks</h3>
                    </div>

                    <div className="contextualization__blocks">
                        {!selectedCluster ? (
                            <PageState
                                variant="empty"
                                title="No cluster selected"
                                description="Select a cluster first to generate or edit semantic blocks."
                                className="contextualization__block-state"
                            />
                        ) : blocks.length === 0 ? (
                            <PageState
                                variant="empty"
                                title="No semantic blocks"
                                description="Generate a draft or add fact, context and opinion blocks manually."
                                className="contextualization__block-state"
                            />
                        ) : (
                            blocks.map((block) => (
                                <ContextualizationCard
                                    key={block.id}
                                    block={block}
                                    onUpdateBlock={handleUpdateBlock}
                                    onRemoveBlock={handleOpenRemoveBlockConfirm}
                                />
                            ))
                        )}
                    </div>

                    <div className="contextualization__actions">
                        <div className="contextualization__block-actions">
                            <Button
                                onClick={() => handleAddBlock('FACT')}
                                disabled={!selectedClusterId}
                            >
                                Add fact
                            </Button>

                            <Button
                                onClick={() => handleAddBlock('CONTEXT')}
                                disabled={!selectedClusterId}
                            >
                                Add context
                            </Button>

                            <Button
                                onClick={() => handleAddBlock('OPINION')}
                                disabled={!selectedClusterId}
                            >
                                Add opinion
                            </Button>
                        </div>
                    </div>
                </section>
            </div>

            <ConfirmModal
                isOpen={blockIdToRemove !== null}
                title="Remove semantic block?"
                description={
                    blockToRemove
                        ? `This ${blockToRemove.type.toLowerCase()} block will be removed from the draft. The change will be saved only after you click Save draft.`
                        : 'This semantic block will be removed from the draft. The change will be saved only after you click Save draft.'
                }
                confirmLabel="Remove block"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={handleConfirmRemoveBlock}
                onCancel={() => setBlockIdToRemove(null)}
            />
        </div>
    );
};
