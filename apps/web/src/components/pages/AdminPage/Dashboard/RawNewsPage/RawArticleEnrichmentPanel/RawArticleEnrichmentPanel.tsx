import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    applyEnrichmentProposal,
    dismissEnrichmentProposal,
    restoreArticleContentVersion,
    retryEnrichmentErrors,
    startEnrichment,
    stopEnrichment,
} from '../../../../../../entities/article-enrichment/api/articleEnrichment';
import {
    enrichmentKeys,
    refreshEnrichmentQueries,
    useArticleContentVersionsQuery,
    useEnrichmentJobQuery,
    useEnrichmentJobsQuery,
    useEnrichmentProposalQuery,
} from '../../../../../../entities/article-enrichment/hooks/useArticleEnrichment';
import {
    isEnrichmentJobActive,
    type EnrichmentArticleSnapshot,
    type EnrichmentJob,
    type StartEnrichmentInput,
} from '../../../../../../entities/article-enrichment/model/types';
import { invalidateRawArticleQueries } from '../../../../../../entities/raw-news/hooks/invalidateRawArticleQueries';
import type { RawArticleBulkScope } from '../../../../../../entities/raw-news/model/rawArticles';
import { Button } from '../../../../../ui/Button/Button';
import { Modal } from '../../../../../ui/Modal/Modal';
import { DropDown } from '../../../../../ui/DropDown/DropDown';
import { EnrichmentContentComparison } from './EnrichmentContentComparison/EnrichmentContentComparison';
import { EnrichmentRetrievalDetails } from './EnrichmentRetrievalDetails/EnrichmentRetrievalDetails';
import { formatEnrichmentReason } from './formatEnrichmentReason';
import type {
    RawArticleEnrichmentHandle,
    RawArticleEnrichmentPanelProps,
    EnrichmentDialog,
} from './TypesRawArticleEnrichmentPanel';
import '../RawArticleBulkPanel/RawArticleBulkPanel.scss';
import './RawArticleEnrichmentPanel.scss';
const describeError = (error: unknown) =>
    error instanceof Error
        ? error.message
        : 'The request failed. Please try again.';
const formatDate = (value: string) => new Date(value).toLocaleString('en-GB');

export const RawArticleEnrichmentPanel = forwardRef<
    RawArticleEnrichmentHandle,
    RawArticleEnrichmentPanelProps
>(function RawArticleEnrichmentPanel(
    { disabled, preferredJobId, onAcquireInteraction, onReleaseInteraction },
    ref,
) {
    const client = useQueryClient();
    const jobsQuery = useEnrichmentJobsQuery();
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [dialog, setDialog] = useState<EnrichmentDialog | null>(null);
    const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
        null,
    );
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const noticeJobRef = useRef<
        Pick<EnrichmentJob, 'id' | 'status'> | undefined
    >(undefined);
    const [canRetryStart, setCanRetryStart] = useState(false);
    const busyRef = useRef(false);
    const mountedRef = useRef(true);
    const startAttemptRef = useRef<StartEnrichmentInput | null>(null);
    const appliedCounts = useRef(new Map<string, number>());
    const jobs = jobsQuery.data?.jobs ?? [];
    const jobId =
        selectedJobId ??
        jobs.find(isEnrichmentJobActive)?.id ??
        jobs[0]?.id ??
        null;
    const jobQuery = useEnrichmentJobQuery(jobId, page);
    const job = jobQuery.data?.job ?? jobs.find(({ id }) => id === jobId);
    const selectableJobs =
        job && !jobs.some(({ id }) => id === job.id) ? [job, ...jobs] : jobs;
    const showNotice = (message: string, summary = job) => {
        noticeJobRef.current = summary;
        setNotice(message);
    };
    const proposalQuery = useEnrichmentProposalQuery(
        dialog?.type === 'PROPOSAL' ? dialog.id : null,
    );
    const versionsQuery = useArticleContentVersionsQuery(
        dialog?.type === 'HISTORY' ? dialog.articleId : null,
    );
    const selectedVersion = versionsQuery.data?.versions.find(
        ({ id }) => id === selectedVersionId,
    );

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!preferredJobId) return;
        setSelectedJobId(preferredJobId);
        setPage(1);
        setNotice(null);
        setError(null);
    }, [preferredJobId]);

    useEffect(() => {
        const context = noticeJobRef.current;
        if (
            context &&
            (context.id !== jobId || (job && context.status !== job.status))
        ) {
            noticeJobRef.current = undefined;
            setNotice(null);
        }
    }, [jobId, job?.status]);

    useEffect(() => {
        if (!job) return;
        const written = job.counts.FULL_TEXT + job.counts.PARTIAL_TEXT;
        const previous = appliedCounts.current.get(job.id);
        appliedCounts.current.set(job.id, written);
        if (written > 0 && written !== previous)
            void invalidateRawArticleQueries(client);
    }, [job, client]);

    useEffect(() => {
        const latest = jobsQuery.data?.jobs.find(({ id }) => id === jobId);
        const displayed = jobQuery.data?.job;
        if (
            !latest ||
            !displayed ||
            jobsQuery.dataUpdatedAt <= jobQuery.dataUpdatedAt
        )
            return;
        if (
            latest.status !== displayed.status ||
            JSON.stringify(latest.counts) !== JSON.stringify(displayed.counts)
        ) {
            void client.invalidateQueries({
                queryKey: enrichmentKeys.job(jobId, page),
            });
        }
    }, [
        jobsQuery.data,
        jobsQuery.dataUpdatedAt,
        jobQuery.data,
        jobQuery.dataUpdatedAt,
        jobId,
        page,
        client,
    ]);

    const launch = async (scope: RawArticleBulkScope) => {
        if (disabled || busyRef.current || !onAcquireInteraction()) return;
        const previous = startAttemptRef.current;
        const attempt =
            previous && JSON.stringify(previous.scope) === JSON.stringify(scope)
                ? previous
                : {
                      scope: structuredClone(scope),
                      requestId: crypto.randomUUID(),
                  };
        startAttemptRef.current = attempt;
        busyRef.current = true;
        setIsBusy(true);
        setError(null);
        setNotice(null);
        setCanRetryStart(false);
        try {
            const result = await startEnrichment(attempt);
            startAttemptRef.current = null;
            if (mountedRef.current) {
                setSelectedJobId(result.job.id);
                setPage(1);
                showNotice(
                    `Enrichment started for ${result.job.total} articles. Processing continues on the server when you leave this page.`,
                    result.job,
                );
            }
            await refreshEnrichmentQueries(client);
        } catch (cause) {
            if (mountedRef.current) {
                setError(describeError(cause));
                setCanRetryStart(true);
            }
            await client
                .invalidateQueries({ queryKey: enrichmentKeys.jobs })
                .catch(() => undefined);
        } finally {
            busyRef.current = false;
            if (mountedRef.current) {
                setIsBusy(false);
                onReleaseInteraction();
            }
        }
    };

    const openDialog = (next: EnrichmentDialog) => {
        if (disabled || busyRef.current || !onAcquireInteraction()) return;
        setError(null);
        setSelectedVersionId(null);
        setDialog(next);
    };
    useImperativeHandle(ref, () => ({
        start: (scope) => {
            void launch(scope);
        },
        openHistory: (articleId, currentUpdatedAt) =>
            openDialog({
                type: 'HISTORY',
                articleId,
                fallbackUpdatedAt: currentUpdatedAt,
            }),
    }));

    const closeDialog = () => {
        if (busyRef.current) return;
        setDialog(null);
        setSelectedVersionId(null);
        onReleaseInteraction();
    };

    const runJobAction = async (action: 'STOP' | 'RETRY') => {
        if (!jobId || disabled || busyRef.current || !onAcquireInteraction())
            return;
        busyRef.current = true;
        setIsBusy(true);
        setError(null);
        setNotice(null);
        try {
            const result = await (action === 'STOP'
                ? stopEnrichment(jobId)
                : retryEnrichmentErrors(jobId));
            if (mountedRef.current && action === 'RETRY')
                showNotice(
                    'Error items queued for another attempt. Completed results are kept.',
                    result.job,
                );
        } catch (cause) {
            if (mountedRef.current) setError(describeError(cause));
        } finally {
            await refreshEnrichmentQueries(client, true);
            busyRef.current = false;
            if (mountedRef.current) {
                setIsBusy(false);
                onReleaseInteraction();
            }
        }
    };

    const saveComparison = async (action: 'APPLY' | 'DISMISS' | 'RESTORE') => {
        if (!dialog || busyRef.current) return;
        const current =
            dialog.type === 'PROPOSAL'
                ? proposalQuery.data?.currentArticle
                : versionsQuery.data?.currentArticle;
        if (action !== 'DISMISS' && !current?.updatedAt) return;
        if (action === 'RESTORE' && !selectedVersion) return;
        busyRef.current = true;
        setIsBusy(true);
        setError(null);
        let succeeded = false;
        try {
            if (action === 'APPLY' && dialog.type === 'PROPOSAL') {
                await applyEnrichmentProposal({
                    id: dialog.id,
                    expectedUpdatedAt: current!.updatedAt!,
                });
            } else if (action === 'DISMISS' && dialog.type === 'PROPOSAL') {
                await dismissEnrichmentProposal(dialog.id);
            } else if (action === 'RESTORE' && selectedVersion) {
                await restoreArticleContentVersion({
                    id: selectedVersion.id,
                    expectedUpdatedAt: current!.updatedAt!,
                });
            }
            succeeded = true;
            if (mountedRef.current) {
                showNotice(
                    action === 'APPLY'
                        ? 'Proposed content applied. The previous version is available in history.'
                        : action === 'RESTORE'
                          ? 'Earlier content restored. Review the article before approval.'
                          : 'Proposal dismissed. The saved article was kept.',
                );
                setDialog(null);
                setSelectedVersionId(null);
            }
        } catch (cause) {
            if (mountedRef.current) setError(describeError(cause));
        } finally {
            await refreshEnrichmentQueries(client, action !== 'DISMISS');
            busyRef.current = false;
            if (mountedRef.current) {
                setIsBusy(false);
                if (succeeded) onReleaseInteraction();
            }
        }
    };

    const proposal = proposalQuery.data;
    const currentProposalArticle = proposal?.currentArticle;
    const proposedSnapshot: EnrichmentArticleSnapshot | null =
        proposal && currentProposalArticle
            ? {
                  ...currentProposalArticle,
                  content: proposal.proposal.content,
                  summary: currentProposalArticle.summary?.trim()
                      ? currentProposalArticle.summary
                      : (proposal.proposal.summary ??
                        currentProposalArticle.summary),
                  imageUrl:
                      currentProposalArticle.imageUrl ??
                      proposal.proposal.imageUrl,
                  contentAssessment: proposal.proposal.assessment,
                  contentProvenance: proposal.proposal.retrieval
                      ? {
                            origin: 'ENRICHMENT',
                            textHash: proposal.proposal.assessment.textHash,
                            retrievedUrl: proposal.proposal.sourceUrl,
                            retrieval: proposal.proposal.retrieval,
                        }
                      : null,
                  contentAvailability: proposal.proposal.assessment.fullText
                      ? 'FULL_TEXT'
                      : 'PARTIAL_TEXT',
              }
            : null;
    const completed = job
        ? job.total - job.counts.PENDING - job.counts.RUNNING
        : 0;
    const processed = completed - (job?.counts.CANCELED ?? 0);
    const isStopping = job?.status === 'CANCELED' && job.counts.RUNNING > 0;
    const comparisonLoading =
        dialog?.type === 'PROPOSAL'
            ? proposalQuery.isFetching
            : versionsQuery.isFetching;
    const comparisonError =
        dialog?.type === 'PROPOSAL'
            ? proposalQuery.isError
            : versionsQuery.isError;
    const currentHistoryArticle = versionsQuery.data?.currentArticle;
    const canRestore =
        currentHistoryArticle?.updatedAt &&
        (currentHistoryArticle._count?.clusterLinks ?? 0) === 0 &&
        currentHistoryArticle.status !== 'CLUSTERED' &&
        currentHistoryArticle.status !== 'REJECTED';

    return (
        <section
            className="raw_news_bulk raw_enrichment"
            aria-label="Article enrichment"
        >
            <h2>Article enrichment</h2>
            <p className="raw_news_bulk__hint">
                Enrich articles uses the selection in Bulk actions. Jobs
                continue on the server when you leave this page. Existing text
                that needs your approval appears as a proposal.
            </p>
            {notice && <p role="status">{notice}</p>}
            {isStopping && (
                <p role="status">
                    Remaining articles were canceled. Articles already being
                    processed will finish: {job.counts.RUNNING}.
                </p>
            )}
            {error && !dialog && <p role="alert">{error}</p>}
            {canRetryStart && (
                <Button
                    variants="secondary"
                    disabled={disabled || isBusy}
                    onClick={() => {
                        if (startAttemptRef.current)
                            void launch(startAttemptRef.current.scope);
                    }}
                >
                    Retry starting enrichment
                </Button>
            )}
            {isBusy && !dialog && (
                <p role="status">Saving enrichment request…</p>
            )}
            {jobsQuery.isLoading && (
                <p role="status">Loading enrichment jobs…</p>
            )}
            {(jobsQuery.isError || jobQuery.isError) && (
                <div role="alert">
                    <p>
                        Could not refresh enrichment progress. Processing on the
                        server is unaffected.
                    </p>
                    <Button
                        variants="secondary"
                        onClick={() => {
                            void jobsQuery.refetch();
                            if (jobId) void jobQuery.refetch();
                        }}
                    >
                        Refresh enrichment progress
                    </Button>
                </div>
            )}
            {!jobsQuery.isLoading &&
                !jobsQuery.isError &&
                jobs.length === 0 &&
                !job && <p>No enrichment jobs yet.</p>}
            {selectableJobs.length > 0 && (
                <div className="raw_enrichment__job_picker">
                    <DropDown
                        label="Enrichment job"
                        value={jobId ?? ''}
                        disabled={disabled || isBusy}
                        options={selectableJobs.map((item) => ({
                            value: item.id,
                            label: `${formatDate(item.createdAt)} · ${item.total} articles · ${item.status.toLowerCase()}`,
                        }))}
                        onChange={(id) => {
                            setNotice(null);
                            setError(null);
                            setSelectedJobId(id);
                            setPage(1);
                        }}
                    />
                </div>
            )}
            {job && (
                <div className="raw_news_bulk__report">
                    <h3>Enrichment report</h3>
                    <p role="status">
                        {job.status.toLowerCase()}: {processed} of {job.total}{' '}
                        processed. Full text: {job.counts.FULL_TEXT}; improved
                        partial text: {job.counts.PARTIAL_TEXT}; proposals:{' '}
                        {job.counts.PROPOSED}; unchanged: {job.counts.UNCHANGED}
                        ; skipped: {job.counts.SKIPPED}; errors:{' '}
                        {job.counts.ERROR}; canceled: {job.counts.CANCELED}.
                    </p>
                    <progress
                        value={completed}
                        max={job.total || 1}
                        aria-label="Enrichment progress"
                        aria-valuetext={`${processed} processed; ${job.counts.CANCELED} canceled; ${job.counts.RUNNING} running; ${job.counts.PENDING} pending`}
                    />
                    <div className="raw_news_bulk__actions">
                        {job.status !== 'CANCELED' &&
                            isEnrichmentJobActive(job) && (
                                <Button
                                    variants="secondary"
                                    disabled={disabled || isBusy}
                                    onClick={() => void runJobAction('STOP')}
                                >
                                    Stop remaining enrichment
                                </Button>
                            )}
                        {!isEnrichmentJobActive(job) &&
                            job.counts.ERROR > 0 && (
                                <Button
                                    variants="secondary"
                                    disabled={disabled || isBusy}
                                    onClick={() => void runJobAction('RETRY')}
                                >
                                    Retry enrichment errors — {job.counts.ERROR}
                                </Button>
                            )}
                    </div>
                    {jobQuery.isLoading && (
                        <p role="status">Loading article results…</p>
                    )}
                    {jobQuery.data && (
                        <>
                            <div className="raw_news_bulk__results">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Article</th>
                                            <th>Result</th>
                                            <th>Details</th>
                                            <th>Review</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {jobQuery.data.items.map((item) => (
                                            <tr key={item.id}>
                                                <td>
                                                    {item.title ||
                                                        'Untitled article'}
                                                    <small>
                                                        {item.articleId}
                                                    </small>
                                                </td>
                                                <td>
                                                    {item.status.replaceAll(
                                                        '_',
                                                        ' ',
                                                    )}
                                                </td>
                                                <td>
                                                    {item.reason
                                                        ? formatEnrichmentReason(
                                                              item.reason,
                                                          )
                                                        : 'Waiting to be processed.'}
                                                    <small>
                                                        Attempts:{' '}
                                                        {item.attempts}
                                                    </small>
                                                </td>
                                                <td>
                                                    {item.hasProposal && (
                                                        <Button
                                                            variants="secondary"
                                                            disabled={
                                                                disabled ||
                                                                isBusy
                                                            }
                                                            onClick={() =>
                                                                openDialog({
                                                                    type: 'PROPOSAL',
                                                                    id: item.id,
                                                                })
                                                            }
                                                        >
                                                            {item.proposalStatus ===
                                                            'PENDING'
                                                                ? 'Compare proposal'
                                                                : 'View proposal'}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variants="secondary"
                                                        disabled={
                                                            disabled || isBusy
                                                        }
                                                        onClick={() =>
                                                            openDialog({
                                                                type: 'HISTORY',
                                                                articleId:
                                                                    item.articleId,
                                                                fallbackUpdatedAt:
                                                                    item.expectedArticleUpdatedAt ??
                                                                    '',
                                                            })
                                                        }
                                                    >
                                                        Content history
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {jobQuery.data.pagination.totalPages > 1 && (
                                <div className="raw_news_bulk__actions raw_enrichment__pagination">
                                    <Button
                                        variants="secondary"
                                        disabled={
                                            disabled ||
                                            isBusy ||
                                            page <= 1 ||
                                            jobQuery.isFetching
                                        }
                                        onClick={() =>
                                            setPage((value) => value - 1)
                                        }
                                    >
                                        Previous results
                                    </Button>
                                    <span>
                                        Page {jobQuery.data.pagination.page} of{' '}
                                        {jobQuery.data.pagination.totalPages}
                                    </span>
                                    <Button
                                        variants="secondary"
                                        disabled={
                                            disabled ||
                                            isBusy ||
                                            page >=
                                                jobQuery.data.pagination
                                                    .totalPages ||
                                            jobQuery.isFetching
                                        }
                                        onClick={() =>
                                            setPage((value) => value + 1)
                                        }
                                    >
                                        Next results
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            <Modal
                title={
                    dialog?.type === 'PROPOSAL'
                        ? 'Compare article proposal'
                        : 'Article content history'
                }
                isOpen={dialog !== null}
                onClose={closeDialog}
                closeOnEsc={!isBusy}
                closeOnOverlayClick={!isBusy}
                contentClassName="raw_enrichment__modal"
                interactiveBlock={
                    <div className="raw_news_bulk__actions">
                        <Button
                            variants="secondary"
                            disabled={isBusy}
                            onClick={closeDialog}
                        >
                            Close comparison
                        </Button>
                        {dialog?.type === 'PROPOSAL' &&
                            proposal?.item.proposalStatus === 'PENDING' && (
                                <>
                                    <Button
                                        variants="secondary"
                                        disabled={
                                            isBusy ||
                                            comparisonLoading ||
                                            comparisonError
                                        }
                                        onClick={() =>
                                            void saveComparison('DISMISS')
                                        }
                                    >
                                        Keep current content
                                    </Button>
                                    <Button
                                        disabled={
                                            isBusy ||
                                            comparisonLoading ||
                                            comparisonError ||
                                            !currentProposalArticle?.updatedAt ||
                                            (currentProposalArticle._count
                                                ?.clusterLinks ?? 0) > 0 ||
                                            currentProposalArticle.status ===
                                                'CLUSTERED' ||
                                            currentProposalArticle.status ===
                                                'REJECTED'
                                        }
                                        onClick={() =>
                                            void saveComparison('APPLY')
                                        }
                                    >
                                        Apply proposed content
                                    </Button>
                                </>
                            )}
                        {dialog?.type === 'HISTORY' && selectedVersion && (
                            <Button
                                disabled={
                                    isBusy ||
                                    comparisonLoading ||
                                    comparisonError ||
                                    !canRestore
                                }
                                onClick={() => void saveComparison('RESTORE')}
                            >
                                Restore content before this change
                            </Button>
                        )}
                    </div>
                }
            >
                <div data-enrichment-comparison>
                    {error && <p role="alert">{error}</p>}
                    {comparisonLoading && (
                        <p role="status">Loading saved content…</p>
                    )}
                    {comparisonError && (
                        <div role="alert">
                            <p>
                                Could not load the latest content. Refresh
                                before applying changes.
                            </p>
                            <Button
                                variants="secondary"
                                disabled={isBusy}
                                onClick={() => {
                                    if (dialog?.type === 'PROPOSAL')
                                        void proposalQuery.refetch();
                                    else void versionsQuery.refetch();
                                }}
                            >
                                Refresh comparison
                            </Button>
                        </div>
                    )}
                    {dialog?.type === 'PROPOSAL' && proposal && (
                        <>
                            {!currentProposalArticle && (
                                <p>The original article no longer exists.</p>
                            )}
                            <p>
                                Proposal status:{' '}
                                {proposal.item.proposalStatus?.toLowerCase() ??
                                    'unknown'}
                                .{' '}
                                {proposal.proposal.assessment.fullText
                                    ? 'The retrieved article passed the full-text checks.'
                                    : 'The retrieved text is still incomplete.'}
                            </p>
                            {!proposal.proposal.retrieval && (
                                <p>
                                    Retrieved from{' '}
                                    <a
                                        href={proposal.proposal.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {proposal.proposal.sourceUrl}
                                    </a>
                                </p>
                            )}
                            {!currentProposalArticle && (
                                <EnrichmentRetrievalDetails
                                    retrieval={proposal.proposal.retrieval}
                                />
                            )}
                            {proposal.proposal.assessment.sourceDate && (
                                <p>
                                    {proposal.proposal.retrieval
                                        ? 'Article publication date: '
                                        : 'Source date: '}
                                    {formatDate(
                                        proposal.proposal.assessment.sourceDate,
                                    )}
                                </p>
                            )}
                            <ul>
                                {proposal.proposal.assessment.reasons.map(
                                    (reason) => (
                                        <li key={reason}>
                                            {formatEnrichmentReason(reason)}
                                        </li>
                                    ),
                                )}
                            </ul>
                            {currentProposalArticle && proposedSnapshot && (
                                <EnrichmentContentComparison
                                    current={currentProposalArticle}
                                    proposed={proposedSnapshot}
                                    proposedLabel="Retrieved proposal"
                                />
                            )}
                            <p>
                                Applying saves the current text in history. The
                                article will require editorial review before
                                approval.
                            </p>
                        </>
                    )}
                    {dialog?.type === 'HISTORY' && versionsQuery.data && (
                        <>
                            {!currentHistoryArticle && (
                                <p>The original article no longer exists.</p>
                            )}
                            {versionsQuery.data.versions.length === 0 ? (
                                <p>No saved content versions yet.</p>
                            ) : (
                                <ul className="raw_enrichment__versions">
                                    {versionsQuery.data.versions.map(
                                        (version) => (
                                            <li key={version.id}>
                                                <span>
                                                    {formatDate(
                                                        version.createdAt,
                                                    )}{' '}
                                                    ·{' '}
                                                    {version.reason
                                                        .replaceAll('_', ' ')
                                                        .toLowerCase()}
                                                </span>
                                                <Button
                                                    variants="secondary"
                                                    disabled={isBusy}
                                                    onClick={() =>
                                                        setSelectedVersionId(
                                                            version.id,
                                                        )
                                                    }
                                                >
                                                    Compare earlier content
                                                </Button>
                                            </li>
                                        ),
                                    )}
                                </ul>
                            )}
                            {selectedVersion && currentHistoryArticle && (
                                <>
                                    <EnrichmentRetrievalDetails
                                        title="Source for this saved change"
                                        retrieval={
                                            selectedVersion.after
                                                .contentProvenance?.retrieval
                                        }
                                    />
                                    <p>
                                        Review the content saved before the
                                        selected change. Restoration preserves
                                        the current version in history.
                                    </p>
                                    <EnrichmentContentComparison
                                        current={currentHistoryArticle}
                                        proposed={selectedVersion.before}
                                        proposedLabel="Content before this change"
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
            </Modal>
        </section>
    );
});
