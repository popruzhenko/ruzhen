import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClusterBulkPanel } from './ClusterBulkPanel';
import type { useClusterBulk } from './useClusterBulk';
import {
    emptyBulkCounts,
    makeBulkJob,
    makeBulkState,
} from './clusterBulkTestFixtures';

let root: Root;
let container: HTMLDivElement;
let bulk: ReturnType<typeof useClusterBulk>;
const render = async (disabledReason?: string) => {
    await act(async () =>
        root.render(
            <ClusterBulkPanel
                action="CONTEXTUALIZE"
                bulk={bulk}
                disabled={Boolean(disabledReason)}
                disabledReason={disabledReason}
            />,
        ),
    );
};
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    bulk = makeBulkState();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});
describe('bulk event panel', () => {
    it('explains a disabled start and cannot send the action', async () => {
        await render('Save the open draft first.');
        await act(async () =>
            container.querySelector<HTMLButtonElement>('button')!.click(),
        );
        expect(bulk.start).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Save the open draft first.');
    });

    it('shows stopped progress separately from unprocessed events and prevents repeated stop requests', async () => {
        const job = makeBulkJob({
            status: 'STOPPING',
            total: 4,
            currentTitle: 'Current event',
            counts: {
                ...emptyBulkCounts(),
                SUCCEEDED: 1,
                SKIPPED: 1,
                RUNNING: 1,
                CANCELED: 1,
            },
        });
        bulk = makeBulkState({
            job,
            activeJob: job,
            results: [
                {
                    clusterId: 'done',
                    humanId: 'E-1',
                    title: 'Done',
                    outcome: 'succeeded',
                    message: 'Generated.',
                },
                {
                    clusterId: 'skip',
                    humanId: 'E-2',
                    title: 'Changed event',
                    outcome: 'skipped',
                    message: 'Event changed after preview.',
                },
            ],
        });
        await render();
        expect(container.textContent).toContain(
            'Processed 2 of 4. Succeeded: 1; skipped: 1; failed: 0; canceled: 1; pending: 0; running: 1',
        );
        expect(container.textContent).toContain('Current event: Current event');
        const stop = [
            ...container.querySelectorAll<HTMLButtonElement>('button'),
        ].find((item) => item.textContent === 'Stopping…')!;
        expect(stop.disabled).toBe(true);
        bulk = makeBulkState({
            job: makeBulkJob({
                ...job,
                status: 'CANCELED',
                currentTitle: null,
                counts: { ...job.counts, RUNNING: 0, SUCCEEDED: 2 },
            }),
            results: bulk.results,
        });
        await render();
        expect(container.textContent).toContain('Stopped. Processed 3 of 4');
        expect(container.textContent).not.toContain('Keep this page open');
        expect(container.textContent).toContain('Event changed after preview.');
        expect(container.querySelector('progress')?.value).toBe(4);
        expect(
            container.querySelector('progress')?.getAttribute('aria-valuetext'),
        ).toBe('3 processed; 1 canceled; 0 pending; 0 running');
    });

    it('shows an empty snapshot as completed without pretending an event was processed', async () => {
        bulk = makeBulkState({ job: makeBulkJob() });
        await render();
        expect(container.textContent).toContain(
            'No draft or updated events to process.',
        );
        expect(container.querySelector('progress')?.value).toBe(0);
    });

    it('shows global counts independently of result pagination and allows browsing saved jobs', async () => {
        const selected = makeBulkJob({
            total: 125,
            counts: {
                ...emptyBulkCounts(),
                SUCCEEDED: 120,
                FAILED: 3,
                CANCELED: 2,
            },
        });
        const older = makeBulkJob({
            id: 'older-job',
            total: 1,
            counts: { ...emptyBulkCounts(), SUCCEEDED: 1 },
        });
        bulk = makeBulkState({
            job: selected,
            jobs: [selected, older],
            resultPage: 2,
            pagination: { page: 2, limit: 50, total: 125, totalPages: 3 },
            results: [
                {
                    clusterId: 'failed',
                    humanId: 'E-51',
                    title: 'Failed event',
                    outcome: 'failed',
                    message: 'Provider error.',
                },
            ],
        });
        await render();
        expect(container.textContent).toContain(
            'Processed 123 of 125. Succeeded: 120; skipped: 0; failed: 3; canceled: 2',
        );
        await act(async () =>
            container
                .querySelector<HTMLButtonElement>(
                    'button[aria-label="Next page"]',
                )!
                .click(),
        );
        expect(bulk.setResultPage).toHaveBeenCalledWith(3);
        await act(async () =>
            container
                .querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!
                .click(),
        );
        await act(async () =>
            container
                .querySelectorAll<HTMLElement>('[role="option"]')[1]
                .click(),
        );
        expect(bulk.selectJob).toHaveBeenCalledWith('older-job');
        expect(bulk.start).not.toHaveBeenCalled();
    });

    it('restores an active job without starting again and keeps its history selection fixed', async () => {
        const job = makeBulkJob({
            status: 'RUNNING',
            total: 3,
            counts: {
                ...emptyBulkCounts(),
                SUCCEEDED: 1,
                RUNNING: 1,
                PENDING: 1,
            },
        });
        bulk = makeBulkState({ job, activeJob: job });
        await render();
        expect(container.textContent).toContain(
            'Jobs continue on the server when you leave this page',
        );
        expect(container.textContent).not.toContain('Keep this page open');
        expect(
            container.querySelector<HTMLButtonElement>(
                '[aria-haspopup="listbox"]',
            )!.disabled,
        ).toBe(true);
        await act(async () => root.render(null));
        await render();
        expect(container.textContent).toContain('Processed 1 of 3');
        expect(bulk.start).not.toHaveBeenCalled();
        expect(bulk.stop).not.toHaveBeenCalled();
    });

    it('blocks a duplicate start while another action runs and exposes read-only refresh', async () => {
        const other = makeBulkJob({
            action: 'PUBLISH',
            status: 'RUNNING',
            total: 1,
            counts: { ...emptyBulkCounts(), RUNNING: 1 },
        });
        bulk = makeBulkState({
            activeJob: other,
            startDisabledReason: 'A publication job is already running.',
            error: 'Could not refresh job progress.',
        });
        await render();
        expect(container.textContent).toContain(
            'A publication job is already running.',
        );
        expect(container.textContent).not.toContain(
            'Finish current event and stop',
        );
        const start = container.querySelector<HTMLButtonElement>('button')!;
        expect(start.disabled).toBe(true);
        const refresh = [
            ...container.querySelectorAll<HTMLButtonElement>('button'),
        ].find((node) => node.textContent === 'Refresh progress')!;
        await act(async () => refresh.click());
        expect(bulk.refresh).toHaveBeenCalledOnce();
        expect(bulk.start).not.toHaveBeenCalled();
        expect(bulk.stop).not.toHaveBeenCalled();
    });

    it('retries only failed and canceled events and respects the page draft guard', async () => {
        bulk = makeBulkState({
            job: makeBulkJob({
                total: 4,
                counts: {
                    ...emptyBulkCounts(),
                    SUCCEEDED: 2,
                    FAILED: 1,
                    CANCELED: 1,
                },
            }),
        });
        await render('Save or discard your changes first.');
        const retryButton = () =>
            [...container.querySelectorAll<HTMLButtonElement>('button')].find(
                (node) =>
                    node.textContent?.includes('Retry failed and unprocessed'),
            )!;
        expect(retryButton().textContent).toContain('2');
        expect(retryButton().disabled).toBe(true);
        await act(async () => retryButton().click());
        expect(bulk.retry).not.toHaveBeenCalled();
        await render();
        await act(async () => retryButton().click());
        expect(bulk.retry).toHaveBeenCalledOnce();
        expect(bulk.start).not.toHaveBeenCalled();
    });

    it('shows pending and canceled result rows without treating them as processed', async () => {
        const job = makeBulkJob({
            status: 'STOPPING',
            total: 4,
            counts: {
                ...emptyBulkCounts(),
                PENDING: 1,
                RUNNING: 1,
                FAILED: 1,
                CANCELED: 1,
            },
        });
        bulk = makeBulkState({
            job,
            activeJob: job,
            results: [
                {
                    clusterId: 'pending',
                    humanId: 'E-1',
                    title: 'Pending event',
                    outcome: 'pending',
                    message: 'Waiting.',
                },
                {
                    clusterId: 'canceled',
                    humanId: 'E-2',
                    title: 'Canceled event',
                    outcome: 'canceled',
                    message: 'Canceled before processing.',
                },
            ],
        });
        await render();
        expect(container.textContent).toContain('Processed 1 of 4');
        expect(container.querySelector('tbody')?.textContent).toContain(
            'Pending',
        );
        expect(container.querySelector('tbody')?.textContent).toContain(
            'Canceled before processing.',
        );
    });
});
