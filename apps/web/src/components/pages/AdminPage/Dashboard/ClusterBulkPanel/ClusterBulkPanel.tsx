import { Button } from '../../../../ui/Button/Button';
import { DropDown } from '../../../../ui/DropDown/DropDown';
import { Pagination } from '../../../../ui/Pagination/Pagination';
import type { ClusterBulkReportRow } from '../../../../../entities/cluster/model/clusterBulk';
import type { ClusterBulkPanelProps } from './TypesClusterBulkPanel';
import './ClusterBulkPanel.scss';

const outcomeLabels: Record<ClusterBulkReportRow['outcome'], string> = {
    pending: 'Pending',
    running: 'Running',
    succeeded: 'Succeeded',
    skipped: 'Skipped',
    failed: 'Failed',
    canceled: 'Canceled',
};

export function ClusterBulkPanel({
    action,
    bulk,
    disabled = false,
    disabledReason,
    onStart,
    onRetry,
}: ClusterBulkPanelProps) {
    const contextualize = action === 'CONTEXTUALIZE';
    const counts = bulk.counts;
    const hasReport = bulk.job !== null;
    const ownActiveJob = bulk.activeJob?.action === action;
    const startBlocked =
        disabled ||
        bulk.isBusy ||
        bulk.isLoading ||
        bulk.isMutating ||
        Boolean(bulk.startDisabledReason);
    const retryCount = counts.FAILED + counts.CANCELED;
    const jobs =
        bulk.job && !bulk.jobs.some(({ id }) => id === bulk.job!.id)
            ? [bulk.job, ...bulk.jobs]
            : bulk.jobs;

    return (
        <section
            className="cluster_bulk"
            aria-label={
                contextualize ? 'Bulk contextualization' : 'Bulk publication'
            }
        >
            <h2>
                {contextualize ? 'Bulk contextualization' : 'Bulk publication'}
            </h2>
            <p>
                All draft and updated events are included, regardless of the
                current filters.{' '}
                {contextualize
                    ? 'Existing saved drafts and semantic blocks will be regenerated.'
                    : 'Ready articles become visible on the public site. Events that do not pass publication checks are skipped.'}
            </p>
            <p className="cluster_bulk__hint">
                Jobs continue on the server when you leave this page. Progress
                is restored when you return.
            </p>
            <div className="cluster_bulk__actions">
                <Button
                    disabled={startBlocked}
                    onClick={() => {
                        if (!startBlocked) void (onStart ?? bulk.start)();
                    }}
                >
                    {contextualize
                        ? 'Contextualize all drafts and updates'
                        : 'Publish all drafts and updates'}
                </Button>
                {bulk.canStop && (
                    <Button
                        variants="secondary"
                        disabled={bulk.phase === 'stopping' || bulk.isMutating}
                        onClick={() => void bulk.stop()}
                    >
                        {bulk.phase === 'stopping'
                            ? 'Stopping…'
                            : 'Finish current event and stop'}
                    </Button>
                )}
                <Button
                    variants="secondary"
                    disabled={bulk.isRefreshing || bulk.isMutating}
                    onClick={() => void bulk.refresh()}
                >
                    {bulk.isRefreshing
                        ? 'Refreshing progress…'
                        : 'Refresh progress'}
                </Button>
            </div>
            {disabledReason && (
                <p className="cluster_bulk__hint">{disabledReason}</p>
            )}
            {bulk.startDisabledReason && (
                <p className="cluster_bulk__hint">{bulk.startDisabledReason}</p>
            )}
            {ownActiveJob && (
                <p className="cluster_bulk__hint">
                    Stopping cancels events that have not started. The current
                    event finishes normally.
                </p>
            )}
            {bulk.isLoading && <p role="status">Loading saved jobs…</p>}
            {bulk.phase === 'preparing' && (
                <p role="status">Saving the server job…</p>
            )}
            {jobs.length > 0 && (
                <div className="cluster_bulk__job_picker">
                    <DropDown
                        label={
                            contextualize
                                ? 'Contextualization job'
                                : 'Publication job'
                        }
                        value={bulk.selectedJobId ?? ''}
                        disabled={ownActiveJob || bulk.isMutating}
                        options={jobs.map((job) => ({
                            value: job.id,
                            label: `${new Date(job.createdAt).toLocaleString('en-GB')} · ${job.total} events · ${job.status.toLowerCase()}`,
                        }))}
                        onChange={(id) => {
                            if (!ownActiveJob && !bulk.isMutating)
                                bulk.selectJob(id);
                        }}
                    />
                </div>
            )}
            {hasReport && (
                <div className="cluster_bulk__report">
                    <p role="status">
                        {bulk.phase === 'stopped'
                            ? 'Stopped. '
                            : bulk.phase === 'stopping'
                              ? 'Stopping. '
                              : bulk.phase === 'completed'
                                ? 'Completed. '
                                : ''}
                        Processed {bulk.processed} of {bulk.total}. Succeeded:{' '}
                        {counts.SUCCEEDED}; skipped: {counts.SKIPPED}; failed:{' '}
                        {counts.FAILED}; canceled: {counts.CANCELED}; pending:{' '}
                        {counts.PENDING}; running: {counts.RUNNING}.
                    </p>
                    <progress
                        value={bulk.processed + counts.CANCELED}
                        max={bulk.total || 1}
                        aria-valuetext={`${bulk.processed} processed; ${counts.CANCELED} canceled; ${counts.PENDING} pending; ${counts.RUNNING} running`}
                        aria-label={
                            contextualize
                                ? 'Contextualization progress'
                                : 'Publication progress'
                        }
                    />
                    {bulk.currentTitle && ownActiveJob && (
                        <p>Current event: {bulk.currentTitle}</p>
                    )}
                    {bulk.total === 0 && bulk.phase === 'completed' && (
                        <p>No draft or updated events to process.</p>
                    )}
                    {retryCount > 0 && !ownActiveJob && (
                        <div className="cluster_bulk__actions">
                            <Button
                                variants="secondary"
                                disabled={
                                    disabled ||
                                    !bulk.canRetry ||
                                    bulk.isMutating
                                }
                                onClick={() => {
                                    if (
                                        !disabled &&
                                        bulk.canRetry &&
                                        !bulk.isMutating
                                    )
                                        void (onRetry ?? bulk.retry)();
                                }}
                            >
                                Retry failed and unprocessed — {retryCount}
                            </Button>
                        </div>
                    )}
                </div>
            )}
            {bulk.error && <p role="alert">{bulk.error}</p>}
            {!bulk.isLoading && !bulk.error && jobs.length === 0 && (
                <p>No saved jobs yet.</p>
            )}
            {(bulk.results.length > 0 || (bulk.pagination?.total ?? 0) > 0) && (
                <details className="cluster_bulk__results">
                    <summary>Event results</summary>
                    <div className="cluster_bulk__table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Event</th>
                                    <th>Result</th>
                                    <th>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bulk.results.map((result) => (
                                    <tr key={result.clusterId}>
                                        <td>
                                            {result.title}
                                            <small>{result.humanId}</small>
                                        </td>
                                        <td>{outcomeLabels[result.outcome]}</td>
                                        <td>{result.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {bulk.pagination && bulk.pagination.totalPages > 1 && (
                        <fieldset
                            className="cluster_bulk__pagination"
                            disabled={bulk.isRefreshing || bulk.isMutating}
                            aria-label="Event results pagination"
                        >
                            <Pagination
                                compact
                                page={bulk.resultPage}
                                totalPages={bulk.pagination.totalPages}
                                hasPreviousPage={bulk.resultPage > 1}
                                hasNextPage={
                                    bulk.resultPage < bulk.pagination.totalPages
                                }
                                onPageChange={(page) => {
                                    if (!bulk.isRefreshing && !bulk.isMutating)
                                        bulk.setResultPage(page);
                                }}
                            />
                        </fieldset>
                    )}
                </details>
            )}
        </section>
    );
}
