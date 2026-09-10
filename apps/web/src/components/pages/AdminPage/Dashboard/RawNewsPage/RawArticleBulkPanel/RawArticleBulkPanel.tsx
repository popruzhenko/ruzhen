import type { RawArticleBulkAction } from '../../../../../../entities/raw-news/model/rawArticles';
import { Button } from '../../../../../ui/Button/Button';
import { Modal } from '../../../../../ui/Modal/Modal';
import type { RawArticleBulkPanelProps } from './TypesRawArticleBulkPanel';
import './RawArticleBulkPanel.scss';

const actionLabels: Record<RawArticleBulkAction, string> = {
    RECHECK: 'Recheck',
    APPROVE: 'Approve ready',
    REJECT: 'Reject',
};

export function RawArticleBulkPanel({
    scope,
    onScopeChange,
    total,
    selectedCount,
    eligibility,
    disabled,
    selectionDisabled,
    onSelectShown,
    onClearSelection,
    onPrepare,
    enrichmentEligibleCount = 0,
    onEnrich,
    bulk,
}: RawArticleBulkPanelProps) {
    const counts = {
        UPDATED: 0,
        UNCHANGED: 0,
        SKIPPED: 0,
        ERROR: 0,
        PENDING: 0,
    };
    bulk.report?.rows.forEach((row) => counts[row.outcome]++);
    const processed = (bulk.report?.rows.length ?? 0) - counts.PENDING;
    return (
        <section className="raw_news_bulk" aria-label="Bulk article actions">
            <h2>Bulk actions</h2>
            <fieldset disabled={disabled} className="raw_news_bulk__controls">
                <legend>Apply to</legend>
                <label>
                    <input
                        type="radio"
                        name="raw-bulk-scope"
                        checked={scope === 'FILTERED'}
                        onChange={() => onScopeChange('FILTERED')}
                    />
                    All articles matching filters ({total})
                </label>
                <label>
                    <input
                        type="radio"
                        name="raw-bulk-scope"
                        checked={scope === 'SELECTED'}
                        onChange={() => onScopeChange('SELECTED')}
                    />
                    Selected articles ({selectedCount})
                </label>
                <div className="raw_news_bulk__actions">
                    {onEnrich && (
                        <Button
                            variants="secondary"
                            disabled={disabled || enrichmentEligibleCount === 0}
                            onClick={onEnrich}
                        >
                            Enrich articles — {enrichmentEligibleCount}
                        </Button>
                    )}
                    {(Object.keys(actionLabels) as RawArticleBulkAction[]).map(
                        (action) => (
                            <Button
                                key={action}
                                variants="secondary"
                                disabled={disabled || eligibility[action] === 0}
                                onClick={() => onPrepare(action)}
                            >
                                {actionLabels[action]} — {eligibility[action]}
                            </Button>
                        ),
                    )}
                </div>
            </fieldset>
            <div className="raw_news_bulk__actions">
                <Button
                    variants="secondary"
                    disabled={selectionDisabled || total === 0}
                    onClick={onSelectShown}
                >
                    Select all shown
                </Button>
                <Button
                    variants="secondary"
                    disabled={selectionDisabled || selectedCount === 0}
                    onClick={onClearSelection}
                >
                    Clear selection
                </Button>
            </div>
            <p className="raw_news_bulk__hint">
                Selection applies to this page and clears when you change pages
                or filters. All articles matching filters includes every page.{' '}
                Counts show eligible articles. Recheck applies to new articles
                and articles awaiting or completing review. Approval requires a
                reviewed article with full text and valid required fields.
                Articles linked to clusters are skipped.
            </p>
            {bulk.isPreparing && (
                <p role="status">Preparing the article selection…</p>
            )}
            {bulk.error && <p role="alert">{bulk.error}</p>}
            {bulk.report && (
                <div className="raw_news_bulk__report">
                    <h3>{actionLabels[bulk.report.action]} report</h3>
                    <p role="status">
                        Processed {processed} of {bulk.report.rows.length}.
                        Updated: {counts.UPDATED}; unchanged: {counts.UNCHANGED}
                        ; skipped: {counts.SKIPPED}; errors: {counts.ERROR};
                        unprocessed: {counts.PENDING}.
                    </p>
                    {bulk.isRunning ? (
                        <>
                            <progress
                                value={processed}
                                max={bulk.report.rows.length || 1}
                                aria-label="Bulk action progress"
                            />
                            <p>
                                Keep this page open until processing finishes.
                                Leaving this page stops unsent batches. The
                                current batch will finish.
                            </p>
                            <Button
                                variants="secondary"
                                disabled={bulk.isStopping}
                                onClick={bulk.stop}
                            >
                                {bulk.isStopping
                                    ? 'Stopping after current batch…'
                                    : 'Stop after current batch'}
                            </Button>
                        </>
                    ) : (
                        <div className="raw_news_bulk__actions">
                            {counts.ERROR > 0 && (
                                <Button
                                    variants="secondary"
                                    disabled={selectionDisabled}
                                    onClick={() => void bulk.retry('ERROR')}
                                >
                                    Retry errors — {counts.ERROR}
                                </Button>
                            )}
                            {counts.PENDING > 0 && (
                                <Button
                                    variants="secondary"
                                    disabled={selectionDisabled}
                                    onClick={() => void bulk.retry('PENDING')}
                                >
                                    Run remaining — {counts.PENDING}
                                </Button>
                            )}
                        </div>
                    )}
                    <details>
                        <summary>
                            Article results ({bulk.report.rows.length})
                        </summary>
                        <div className="raw_news_bulk__results">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Article</th>
                                        <th>Result</th>
                                        <th>Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulk.report.rows.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                {row.title ||
                                                    'Untitled article'}
                                                <small>{row.id}</small>
                                            </td>
                                            <td>
                                                {row.outcome === 'PENDING'
                                                    ? 'UNPROCESSED'
                                                    : row.outcome}
                                            </td>
                                            <td>{row.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </div>
            )}
            <Modal
                title={
                    bulk.preview
                        ? `${actionLabels[bulk.preview.action]} articles`
                        : 'Bulk action'
                }
                isOpen={Boolean(bulk.preview)}
                onClose={bulk.cancelPreview}
                closeOnEsc
                closeOnOverlayClick
                interactiveBlock={
                    <div className="raw_news_bulk__actions">
                        <Button
                            variants="secondary"
                            onClick={bulk.cancelPreview}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!bulk.preview?.eligible}
                            onClick={() => void bulk.confirm()}
                        >
                            Confirm{' '}
                            {bulk.preview
                                ? actionLabels[
                                      bulk.preview.action
                                  ].toLowerCase()
                                : 'action'}{' '}
                            — {bulk.preview?.eligible ?? 0}
                        </Button>
                    </div>
                }
            >
                <p>
                    The selection is fixed: {bulk.preview?.total ?? 0} articles.
                    Eligible: {bulk.preview?.eligible ?? 0}; skipped:{' '}
                    {(bulk.preview?.total ?? 0) - (bulk.preview?.eligible ?? 0)}
                    .
                </p>
                <p>
                    Articles added later are excluded. Articles changed after
                    this preview will be skipped.
                </p>
                {bulk.preview?.action === 'REJECT' && (
                    <p>
                        Confirm rejection of the eligible articles in this
                        selection.
                    </p>
                )}
                <details>
                    <summary>Review selected articles</summary>
                    <ul>
                        {bulk.preview?.items.map((item) => (
                            <li key={item.id}>
                                {item.title || 'Untitled article'} —{' '}
                                {item.eligible
                                    ? 'Eligible'
                                    : item.reason || 'Skipped'}
                            </li>
                        ))}
                    </ul>
                </details>
            </Modal>
        </section>
    );
}
