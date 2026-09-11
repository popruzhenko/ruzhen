import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicationPage } from './PublicationPage';
import type { useClusterBulk } from '../ClusterBulkPanel/useClusterBulk';
import {
    emptyBulkCounts,
    makeBulkJob,
    makeBulkState,
} from '../ClusterBulkPanel/clusterBulkTestFixtures';

const story = {
    id: 'event-1',
    humanId: 'E-1',
    title: 'Ready event',
    summary: 'Ready summary.',
    status: 'DRAFT',
    updatedAt: '2026-09-11T10:00:00.000Z',
    articles: [],
    _count: { articleLinks: 2, blocks: 2 },
    blocks: [
        {
            id: 'fact',
            type: 'FACT',
            title: 'Fact',
            content: 'Fact content.',
            position: 1,
        },
        {
            id: 'context',
            type: 'CONTEXT',
            title: 'Context',
            content: 'Context content.',
            position: 2,
        },
    ],
};
const mocks = vi.hoisted(() => ({
    isError: false,
    updateStatus: { isPending: false, mutateAsync: vi.fn() },
    bulk: {} as ReturnType<typeof useClusterBulk>,
    useBulk: vi.fn(),
    showToast: vi.fn(),
    refetch: vi.fn(),
}));
vi.mock('../../../../../entities/cluster', () => ({
    useClustersQuery: () => ({
        data: { clusters: [story] },
        isLoading: false,
        isError: mocks.isError,
        refetch: mocks.refetch,
    }),
    useClusterByIdQuery: (id: string | null) => ({
        data: id ? story : undefined,
        isLoading: false,
        isError: false,
        refetch: mocks.refetch,
    }),
}));
vi.mock('../../../../../entities/publication', () => ({
    useUpdateClusterStatusMutation: () => mocks.updateStatus,
}));
vi.mock('../ClusterBulkPanel/useClusterBulk', () => ({
    useClusterBulk: (action: string) => {
        mocks.useBulk(action);
        return mocks.bulk;
    },
}));
vi.mock('../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

let root: Root;
let container: HTMLDivElement;
const render = async () => {
    await act(async () => root.render(<PublicationPage />));
};
const button = (label: string) => {
    const result = [
        ...document.body.querySelectorAll<HTMLButtonElement>('button'),
    ].find((node) => node.textContent?.trim() === label);
    expect(result, label).toBeDefined();
    return result!;
};
const click = async (label: string) => {
    await act(async () => button(label).click());
};
const selectStory = async () => {
    await act(async () =>
        container.querySelector<HTMLButtonElement>('.cluster_card')!.click(),
    );
};
const startLabel = 'Publish all drafts and updates';
beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.isError = false;
    mocks.updateStatus.isPending = false;
    mocks.bulk = makeBulkState();
    mocks.refetch.mockResolvedValue({});
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

describe('global publication controls', () => {
    it('publishes globally with one direct click even when filters hide the visible articles', async () => {
        await render();
        const search = container.querySelector<HTMLInputElement>(
            '.publication_filters input',
        )!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value',
            )!.set!.call(search, 'No matching event');
            search.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(container.querySelectorAll('.cluster_card')).toHaveLength(0);
        await click(startLabel);
        expect(mocks.useBulk).toHaveBeenCalledWith('PUBLISH');
        expect(mocks.bulk.start).toHaveBeenCalledExactlyOnceWith();
        expect(document.body.querySelector('[role="dialog"]')).toBeNull();
        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
        expect(container.textContent).toContain(
            'Ready articles become visible on the public site',
        );
    });

    it('locks single-event publication and archive controls while bulk work is active', async () => {
        await render();
        await selectStory();
        const job = makeBulkJob({
            action: 'PUBLISH',
            status: 'RUNNING',
            total: 15,
            currentTitle: 'Ready event',
            counts: { ...emptyBulkCounts(), RUNNING: 1, PENDING: 14 },
        });
        mocks.bulk = makeBulkState({ job, activeJob: job });
        await render();
        expect(button('Publish').matches(':disabled')).toBe(true);
        expect(button('Archive').matches(':disabled')).toBe(true);
        expect(
            container
                .querySelector<HTMLButtonElement>('.cluster_card')!
                .matches(':disabled'),
        ).toBe(true);
        await click('Finish current event and stop');
        expect(mocks.bulk.stop).toHaveBeenCalledOnce();
        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
    });

    it('blocks the bulk start until an existing single-publication confirmation is closed', async () => {
        await render();
        await selectStory();
        await click('Publish');
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
        expect(button(startLabel).disabled).toBe(true);
        expect(container.textContent).toContain(
            'Finish the open publication confirmation first',
        );
        await click('Cancel');
        expect(button(startLabel).disabled).toBe(false);
        expect(mocks.bulk.start).not.toHaveBeenCalled();
    });

    it('locks publication while contextualization runs elsewhere and cannot stop that other action', async () => {
        await render();
        await selectStory();
        const otherJob = makeBulkJob({
            status: 'RUNNING',
            total: 1,
            counts: { ...emptyBulkCounts(), RUNNING: 1 },
        });
        mocks.bulk = makeBulkState({
            activeJob: otherJob,
            startDisabledReason: 'A contextualization job is already running.',
        });
        await render();
        expect(button(startLabel).disabled).toBe(true);
        expect(button('Publish').matches(':disabled')).toBe(true);
        expect(button('Archive').matches(':disabled')).toBe(true);
        expect(container.textContent).toContain(
            'A contextualization job is already running.',
        );
        expect(container.textContent).not.toContain(
            'Finish current event and stop',
        );
        expect(mocks.bulk.stop).not.toHaveBeenCalled();
        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
    });

    it('retains skipped publication reasons and completed counts if the list refresh fails', async () => {
        mocks.isError = true;
        mocks.bulk = makeBulkState({
            job: makeBulkJob({
                action: 'PUBLISH',
                total: 2,
                counts: { ...emptyBulkCounts(), SUCCEEDED: 1, SKIPPED: 1 },
            }),
            results: [
                {
                    clusterId: 'published',
                    humanId: 'E-1',
                    title: 'Published event',
                    outcome: 'succeeded',
                    message: 'Published.',
                },
                {
                    clusterId: 'not-ready',
                    humanId: 'E-2',
                    title: 'Incomplete event',
                    outcome: 'skipped',
                    message: 'At least one fact block is required.',
                },
            ],
        });
        await render();
        expect(container.textContent).toContain(
            'Failed to load publication data',
        );
        expect(container.textContent).toContain(
            'Processed 2 of 2. Succeeded: 1; skipped: 1; failed: 0',
        );
        expect(container.textContent).toContain('Incomplete event');
        expect(container.textContent).toContain(
            'At least one fact block is required.',
        );
    });
});
