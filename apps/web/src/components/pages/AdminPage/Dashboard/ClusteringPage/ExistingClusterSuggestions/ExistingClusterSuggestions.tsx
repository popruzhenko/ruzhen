import { useRef, useState } from 'react';

import {
    useAcceptArticleClusterCandidateMutation,
    useArticleClusterCandidatesQuery,
    useGenerateArticleClusterCandidatesMutation,
    useRejectArticleClusterCandidateMutation,
    type ArticleClusterCandidate,
} from '../../../../../../entities/article-cluster-candidate';
import { Button } from '../../../../../ui/Button/Button';
import { Pagination } from '../../../../../ui/Pagination/Pagination';
import { useToast } from '../../../../../ui/Toast/ToastProvider';
import { TOAST_TYPE } from '../../../../../ui/Toast/ToastConstants';
import type {
    ExistingClusterSuggestionsProps,
    PendingAction,
} from './TypesExistingClusterSuggestions';

import './ExistingClusterSuggestions.scss';

export const ExistingClusterSuggestions = ({
    disabled,
    hasUnsavedChanges,
    dataRevision,
    onBusyChange,
    onOpenCluster,
}: ExistingClusterSuggestionsProps) => {
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState(true);
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(
        null,
    );
    const busyRef = useRef(false);
    const { showToast } = useToast();
    const suggestionsQuery = useArticleClusterCandidatesQuery(
        { page, limit: 10 },
        dataRevision,
    );
    const generateMutation = useGenerateArticleClusterCandidatesMutation();
    const attachMutation = useAcceptArticleClusterCandidateMutation();
    const rejectMutation = useRejectArticleClusterCandidateMutation();
    const candidates = suggestionsQuery.data?.candidates ?? [];
    const pagination = suggestionsQuery.data?.pagination;
    const isBusy = pendingAction !== null;
    const controlsDisabled = disabled || isBusy;

    const runAction = async (
        action: PendingAction,
        work: () => Promise<void>,
    ) => {
        if (
            disabled ||
            busyRef.current ||
            (action.type === 'attach' && hasUnsavedChanges)
        ) {
            return;
        }

        busyRef.current = true;
        setPendingAction(action);
        onBusyChange(true);

        try {
            await work();
        } catch (error) {
            showToast({
                type: TOAST_TYPE.ERROR,
                title:
                    action.type === 'generate'
                        ? 'Failed to generate suggestions'
                        : action.type === 'attach'
                          ? 'Could not attach article'
                          : 'Could not reject suggestion',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Please try again.',
            });
        } finally {
            busyRef.current = false;
            setPendingAction(null);
            onBusyChange(false);
        }
    };

    const handleGenerate = () =>
        runAction({ type: 'generate' }, async () => {
            const response = await generateMutation.mutateAsync();
            setPage(1);
            setExpanded(true);
            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Suggestions generated',
                message: `${response.meta.candidatesCreated} suggestion(s) from ${response.meta.articlesChecked} article(s) and ${response.meta.clustersChecked} existing cluster(s).`,
            });
        });

    const handleAttach = (candidate: ArticleClusterCandidate) =>
        runAction({ type: 'attach', candidateId: candidate.id }, async () => {
            const response = await attachMutation.mutateAsync(candidate.id);
            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Article attached',
                message:
                    response.cluster.status === 'UPDATED'
                        ? `Added to ${response.cluster.humanId}. Review the updated cluster before publishing.`
                        : `Added to ${response.cluster.humanId}.`,
            });
        });

    const handleReject = (candidate: ArticleClusterCandidate) =>
        runAction({ type: 'reject', candidateId: candidate.id }, async () => {
            await rejectMutation.mutateAsync(candidate.id);
            showToast({
                type: TOAST_TYPE.SUCCESS,
                title: 'Suggestion rejected',
                message: 'The article and cluster were left unchanged.',
            });
        });

    return (
        <section
            className="existing-cluster-suggestions"
            aria-label="Articles for existing clusters"
            aria-busy={isBusy}
        >
            <div className="existing-cluster-suggestions__header">
                <div>
                    <h2>Articles for existing clusters</h2>
                    <p>
                        Review suggested additions to saved clusters. Each
                        article is attached only when you approve it.
                    </p>
                    <span className="existing-cluster-suggestions__count">
                        {pagination
                            ? `${pagination.total} suggestion(s)`
                            : 'Checking suggestions...'}
                    </span>
                </div>
                <div className="existing-cluster-suggestions__actions">
                    <Button
                        onClick={() => void handleGenerate()}
                        disabled={controlsDisabled}
                    >
                        {pendingAction?.type === 'generate'
                            ? 'Generating...'
                            : 'Generate suggestions'}
                    </Button>
                    <Button
                        variants="secondary"
                        disabled={controlsDisabled}
                        onClick={() => setExpanded((current) => !current)}
                        aria-expanded={expanded}
                    >
                        {expanded ? 'Hide suggestions' : 'Show suggestions'}
                    </Button>
                </div>
            </div>

            {expanded && (
                <div className="existing-cluster-suggestions__body">
                    {hasUnsavedChanges && (
                        <p
                            className="existing-cluster-suggestions__notice"
                            role="status"
                        >
                            Save or discard your cluster draft before attaching
                            an article.
                        </p>
                    )}

                    {suggestionsQuery.isLoading ? (
                        <p role="status">Loading suggestions...</p>
                    ) : suggestionsQuery.isError ? (
                        <div
                            className="existing-cluster-suggestions__notice"
                            role="alert"
                        >
                            <p>
                                Could not refresh suggestions. Retry to see the
                                current list.
                            </p>
                            <Button
                                variants="secondary"
                                disabled={
                                    controlsDisabled ||
                                    suggestionsQuery.isFetching
                                }
                                onClick={() => void suggestionsQuery.refetch()}
                            >
                                Retry suggestions
                            </Button>
                        </div>
                    ) : candidates.length === 0 ? (
                        <div className="existing-cluster-suggestions__empty">
                            <h3>No matching suggestions</h3>
                            <p>
                                Generate suggestions to check recent articles
                                against existing clusters. Articles need
                                embeddings first; use Generate embeddings if
                                needed.
                            </p>
                        </div>
                    ) : (
                        <ul className="existing-cluster-suggestions__list">
                            {candidates.map((candidate) => (
                                <li
                                    key={candidate.id}
                                    className="existing-cluster-suggestions__card"
                                >
                                    <div className="existing-cluster-suggestions__pair">
                                        <div>
                                            <span className="existing-cluster-suggestions__label">
                                                Article ·{' '}
                                                {candidate.article.source
                                                    ?.name ?? 'Unknown source'}
                                            </span>
                                            <h3>
                                                {candidate.article.title ||
                                                    'Untitled article'}
                                            </h3>
                                        </div>
                                        <span
                                            className="existing-cluster-suggestions__arrow"
                                            aria-hidden="true"
                                        >
                                            →
                                        </span>
                                        <div>
                                            <span className="existing-cluster-suggestions__label">
                                                Existing cluster ·{' '}
                                                {candidate.cluster.humanId}
                                            </span>
                                            <h3>{candidate.cluster.title}</h3>
                                            <p>
                                                {candidate.cluster.status} ·{' '}
                                                {
                                                    candidate.cluster._count
                                                        .articleLinks
                                                }{' '}
                                                article(s)
                                            </p>
                                        </div>
                                    </div>
                                    <div className="existing-cluster-suggestions__footer">
                                        <strong className="existing-cluster-suggestions__score">
                                            Similarity:{' '}
                                            {(candidate.score * 100).toFixed(1)}
                                            %
                                        </strong>
                                        <div className="existing-cluster-suggestions__actions">
                                            <Button
                                                variants="secondary"
                                                disabled={controlsDisabled}
                                                onClick={() => {
                                                    if (
                                                        !disabled &&
                                                        !busyRef.current
                                                    )
                                                        onOpenCluster(
                                                            candidate.cluster
                                                                .id,
                                                        );
                                                }}
                                            >
                                                Open cluster
                                            </Button>
                                            <Button
                                                disabled={
                                                    controlsDisabled ||
                                                    hasUnsavedChanges
                                                }
                                                onClick={() =>
                                                    void handleAttach(candidate)
                                                }
                                            >
                                                {pendingAction?.type ===
                                                    'attach' &&
                                                pendingAction.candidateId ===
                                                    candidate.id
                                                    ? 'Attaching...'
                                                    : 'Attach article'}
                                            </Button>
                                            <Button
                                                variants="secondary"
                                                disabled={controlsDisabled}
                                                onClick={() =>
                                                    void handleReject(candidate)
                                                }
                                            >
                                                {pendingAction?.type ===
                                                    'reject' &&
                                                pendingAction.candidateId ===
                                                    candidate.id
                                                    ? 'Rejecting...'
                                                    : 'Reject'}
                                            </Button>
                                        </div>
                                    </div>
                                    {candidate.cluster.status ===
                                        'PUBLISHED' && (
                                        <p className="existing-cluster-suggestions__notice">
                                            Attaching to this published cluster
                                            marks it as UPDATED for editorial
                                            review. It is not published
                                            automatically.
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {!suggestionsQuery.isError &&
                        pagination &&
                        pagination.totalPages > 1 && (
                            <fieldset
                                className="existing-cluster-suggestions__pagination"
                                disabled={controlsDisabled}
                            >
                                <Pagination
                                    page={pagination.page}
                                    totalPages={pagination.totalPages}
                                    hasNextPage={pagination.hasNextPage}
                                    hasPreviousPage={pagination.hasPreviousPage}
                                    onPageChange={(nextPage) => {
                                        if (
                                            !controlsDisabled &&
                                            !busyRef.current
                                        )
                                            setPage(nextPage);
                                    }}
                                />
                            </fieldset>
                        )}
                </div>
            )}
        </section>
    );
};
