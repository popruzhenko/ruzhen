import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextualizationPage } from './ContextualizationPage';
import type { useClusterBulk } from '../ClusterBulkPanel/useClusterBulk';
import {
    emptyBulkCounts,
    makeBulkJob,
    makeBulkState,
} from '../ClusterBulkPanel/clusterBulkTestFixtures';

const version = '2026-09-11T10:00:00.000Z';
const updatedVersion = '2026-09-11T11:00:00.000Z';
const story = (id = 'event-1') => ({
    id,
    humanId: id,
    title: `Saved ${id}`,
    summary: 'Saved summary.',
    status: 'DRAFT',
    updatedAt: version,
    articles: [],
    _count: { articleLinks: 2, blocks: 1 },
    blocks: [
        {
            id: `${id}-block`,
            type: 'FACT' as const,
            title: 'Fact',
            content: 'Saved fact.',
            position: 1,
            sourceName: 'Source',
            sourceUrl: 'https://example.test/story',
            authorName: null,
            stance: null,
            createdAt: version,
            updatedAt: version,
        },
    ],
});
const mocks = vi.hoisted(() => ({
    stories: [] as ReturnType<typeof story>[],
    details: new Map<string, ReturnType<typeof story>>(),
    isError: false,
    generate: { isPending: false, mutateAsync: vi.fn() },
    save: { isPending: false, mutateAsync: vi.fn() },
    bulk: {} as ReturnType<typeof useClusterBulk>,
    useBulk: vi.fn(),
    showToast: vi.fn(),
    refetch: vi.fn(),
}));
vi.mock('../../../../../entities/cluster', () => ({
    useClustersQuery: () => ({
        data: { clusters: mocks.stories },
        isLoading: false,
        isError: mocks.isError,
        refetch: mocks.refetch,
    }),
    useClusterByIdQuery: (id: string | null) => ({
        data: id ? mocks.details.get(id) : undefined,
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: mocks.refetch,
    }),
}));
vi.mock('../../../../../entities/contextualization', () => ({
    useGenerateAnalyzedNewsMutation: () => mocks.generate,
}));
vi.mock(
    '../../../../../entities/contextualization/model/useSaveContextDraftMutation',
    () => ({ useSaveContextDraftMutation: () => mocks.save }),
);
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
    await act(async () => root.render(<ContextualizationPage />));
};
const button = (label: string) => {
    const element = [
        ...document.body.querySelectorAll<HTMLButtonElement>('button'),
    ].find((item) => item.textContent?.trim() === label);
    expect(element, label).toBeDefined();
    return element!;
};
const click = async (label: string) => {
    await act(async () => button(label).click());
};
const selectStory = async (index = 0) => {
    await act(async () =>
        container
            .querySelectorAll<HTMLButtonElement>('.cluster_card')
            [index].click(),
    );
};
const title = () =>
    container.querySelector<HTMLInputElement>(
        'input[placeholder="Generated article title"]',
    )!;
const change = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};
const startLabel = 'Contextualize all drafts and updates';

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.stories = [story(), story('event-2')];
    mocks.details = new Map(mocks.stories.map((item) => [item.id, item]));
    mocks.isError = false;
    mocks.generate.isPending = false;
    mocks.save.isPending = false;
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

describe('global contextualization controls', () => {
    it('starts globally without a selection even when filters hide every visible event', async () => {
        await render();
        const search = container.querySelector<HTMLInputElement>(
            '.contextualization_filters input',
        )!;
        await change(search, 'No matching event');
        expect(container.querySelectorAll('.cluster_card')).toHaveLength(0);
        expect(button(startLabel).disabled).toBe(false);
        await click(startLabel);
        expect(mocks.useBulk).toHaveBeenCalledWith('CONTEXTUALIZE');
        expect(mocks.bulk.start).toHaveBeenCalledExactlyOnceWith();
        expect(container.textContent).toContain(
            'Existing saved drafts and semantic blocks will be regenerated',
        );
        expect(mocks.generate.mutateAsync).not.toHaveBeenCalled();
    });

    it('preserves unsaved edits across refetches and blocks bulk and selection changes until discarded', async () => {
        await render();
        await selectStory();
        await change(title(), 'My unsaved title');
        expect(button(startLabel).disabled).toBe(true);
        expect(button('Generate draft').disabled).toBe(true);
        expect(container.textContent).toContain('Save or discard your changes');
        mocks.details.set('event-1', {
            ...story(),
            title: 'Another editor saved this title',
            updatedAt: updatedVersion,
        });
        await render();
        expect(title().value).toBe('My unsaved title');
        await selectStory(1);
        expect(title().value).toBe('My unsaved title');
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Unsaved draft' }),
        );
        await click('Discard changes');
        expect(title().value).toBe('Another editor saved this title');
        expect(button(startLabel).disabled).toBe(false);
        expect(mocks.save.mutateAsync).not.toHaveBeenCalled();
    });

    it('locks editing during bulk work and adopts the saved generated draft before unlocking', async () => {
        await render();
        await selectStory();
        mocks.bulk = {
            ...mocks.bulk,
            phase: 'running',
            isBusy: true,
            total: 2,
            currentTitle: 'Saved event-1',
        };
        await render();
        expect(title().matches(':disabled')).toBe(true);
        expect(button('Save draft').matches(':disabled')).toBe(true);
        expect(button('Generate draft').matches(':disabled')).toBe(true);
        expect(
            container
                .querySelector<HTMLButtonElement>('.cluster_card')!
                .matches(':disabled'),
        ).toBe(true);
        const generated = {
            ...story(),
            title: 'Generated title',
            updatedAt: updatedVersion,
            blocks: [
                {
                    ...story().blocks[0],
                    id: 'generated-block',
                    content: 'Generated fact.',
                },
            ],
        };
        mocks.details.set('event-1', generated);
        await render();
        expect(title().value).toBe('Generated title');
        expect(
            container.querySelector<HTMLTextAreaElement>(
                'textarea[placeholder="Write the meaning of this block"]',
            )!.value,
        ).toBe('Generated fact.');
        mocks.bulk = {
            ...mocks.bulk,
            phase: 'completed',
            isBusy: false,
            processed: 2,
            currentTitle: null,
        };
        await render();
        expect(title().matches(':disabled')).toBe(false);
        expect(button(startLabel).disabled).toBe(false);
    });

    it('keeps a just-saved response when a subsequent detail read still contains the older draft', async () => {
        await render();
        await selectStory();
        await change(title(), 'New saved title');
        mocks.save.mutateAsync.mockResolvedValue({
            cluster: {
                ...story(),
                title: 'New saved title',
                updatedAt: updatedVersion,
            },
            blocks: story().blocks,
        });
        await click('Save draft');
        expect(title().value).toBe('New saved title');
        expect(button(startLabel).disabled).toBe(false);
        expect(mocks.save.mutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                clusterId: 'event-1',
                payload: expect.objectContaining({ title: 'New saved title' }),
            }),
        );
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Draft saved' }),
        );
    });

    it('preserves a dirty draft when another page starts a server job and blocks retry until the draft is resolved', async () => {
        await render();
        await selectStory();
        await change(title(), 'My unsaved work');
        const running = makeBulkJob({
            status: 'RUNNING',
            total: 1,
            counts: { ...emptyBulkCounts(), RUNNING: 1 },
        });
        mocks.bulk = makeBulkState({ job: running, activeJob: running });
        mocks.details.set('event-1', {
            ...story(),
            title: 'Server generated title',
            updatedAt: updatedVersion,
        });
        await render();
        expect(title().value).toBe('My unsaved work');
        expect(title().matches(':disabled')).toBe(true);
        const stopped = makeBulkJob({
            ...running,
            status: 'CANCELED',
            counts: { ...emptyBulkCounts(), CANCELED: 1 },
        });
        mocks.bulk = makeBulkState({ job: stopped });
        await render();
        expect(title().value).toBe('My unsaved work');
        expect(button('Retry failed and unprocessed — 1').disabled).toBe(true);
        await click('Discard changes');
        expect(title().value).toBe('Server generated title');
        await click('Retry failed and unprocessed — 1');
        expect(mocks.bulk.retry).toHaveBeenCalledOnce();
        expect(mocks.bulk.start).not.toHaveBeenCalled();
    });

    it('keeps progress and stopping available when refreshing the event list fails', async () => {
        mocks.isError = true;
        const job = makeBulkJob({
            status: 'RUNNING',
            total: 10,
            currentTitle: 'Working event',
            counts: { ...emptyBulkCounts(), FAILED: 1, RUNNING: 1, PENDING: 8 },
        });
        mocks.bulk = makeBulkState({
            job,
            activeJob: job,
            results: [
                {
                    clusterId: 'failed',
                    humanId: 'E-1',
                    title: 'Failed event',
                    outcome: 'failed',
                    message: 'AI service unavailable.',
                },
            ],
        });
        await render();
        expect(container.textContent).toContain(
            'Failed to load contextualization data',
        );
        expect(container.textContent).toContain('Processed 1 of 10');
        expect(container.textContent).toContain('AI service unavailable.');
        await click('Finish current event and stop');
        expect(mocks.bulk.stop).toHaveBeenCalledOnce();
        expect(mocks.bulk.start).not.toHaveBeenCalled();
    });
});
