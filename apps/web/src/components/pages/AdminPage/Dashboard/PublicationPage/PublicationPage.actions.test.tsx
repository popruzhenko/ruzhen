import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { useClusterBulk } from '../ClusterBulkPanel/useClusterBulk';
import { makeBulkState } from '../ClusterBulkPanel/clusterBulkTestFixtures';
import {
    deferred,
    makeEditorialBlock,
    makeEditorialStory,
    nextVersion,
    type EditorialStory,
} from '../editorialTestFixtures';
import { PublicationPage } from './PublicationPage';

const mocks = vi.hoisted(() => ({
    stories: [] as EditorialStory[],
    details: new Map<string, EditorialStory>(),
    updateStatus: { isPending: false, mutateAsync: vi.fn() },
    bulk: {} as ReturnType<typeof useClusterBulk>,
    showToast: vi.fn(),
    refetchList: vi.fn(),
    refetchDetails: vi.fn(),
}));

vi.mock('../../../../../entities/cluster', () => ({
    useClustersQuery: () => ({
        data: { clusters: mocks.stories },
        isLoading: false,
        isError: false,
        refetch: mocks.refetchList,
    }),
    useClusterByIdQuery: (id: string | null) => ({
        data: id ? mocks.details.get(id) : undefined,
        isLoading: false,
        isError: false,
        refetch: mocks.refetchDetails,
    }),
}));
vi.mock('../../../../../entities/publication', () => ({
    useUpdateClusterStatusMutation: () => mocks.updateStatus,
}));
vi.mock('../ClusterBulkPanel/useClusterBulk', () => ({
    useClusterBulk: () => mocks.bulk,
}));
vi.mock('../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

function readyStory(overrides: Partial<EditorialStory> = {}) {
    return makeEditorialStory({
        blocks: [
            makeEditorialBlock(),
            makeEditorialBlock({
                id: 'context-1',
                type: 'CONTEXT',
                title: 'Background',
                content: 'Context content.',
                position: 2,
            }),
        ],
        ...overrides,
    });
}

function setStory(story: EditorialStory) {
    mocks.stories = [story];
    mocks.details.set(story.id, story);
}

function applyStatus(status: EditorialStory['status']) {
    const updated = {
        ...mocks.details.get('event-1')!,
        status,
        updatedAt: nextVersion,
        publishedAt: status === 'PUBLISHED' ? nextVersion : null,
    };
    setStory(updated);
    return updated;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.details = new Map();
    setStory(readyStory());
    mocks.updateStatus.isPending = false;
    mocks.updateStatus.mutateAsync
        .mockReset()
        .mockImplementation(
            async ({ status }: { status: EditorialStory['status'] }) => ({
                cluster: applyStatus(status),
            }),
        );
    mocks.bulk = makeBulkState();
    mocks.refetchList.mockResolvedValue({});
    mocks.refetchDetails.mockResolvedValue({});
});

async function selectStory(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Saved article/ }));
}

async function openPublish(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    return screen.getByRole('dialog');
}

describe('publication readiness', () => {
    it.each([
        {
            name: 'blank title',
            overrides: { title: ' ' },
            error: 'Title is required.',
        },
        {
            name: 'missing summary',
            overrides: { summary: null },
            error: 'Summary is required.',
        },
        {
            name: 'missing fact',
            overrides: { blocks: [makeEditorialBlock({ type: 'CONTEXT' })] },
            error: 'At least one fact block is required.',
        },
        {
            name: 'missing context',
            overrides: { blocks: [makeEditorialBlock()] },
            error: 'At least one context block is required.',
        },
        {
            name: 'blank block content',
            overrides: {
                blocks: [
                    makeEditorialBlock({ content: ' ' }),
                    makeEditorialBlock({ id: 'context', type: 'CONTEXT' }),
                ],
            },
            error: 'All semantic blocks must have content.',
        },
        {
            name: 'no blocks',
            overrides: { blocks: [] },
            error: 'At least one fact block is required. At least one context block is required.',
        },
    ])(
        'rejects publication with $name before opening a confirmation or changing status',
        async ({ overrides, error }) => {
            const user = userEvent.setup();
            setStory(readyStory(overrides));
            render(<PublicationPage />);
            await selectStory(user);

            await user.click(screen.getByRole('button', { name: 'Publish' }));

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
            expect(mocks.refetchList).not.toHaveBeenCalled();
            expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Article is not ready to publish',
                    message: error,
                }),
            );
        },
    );

    it('warns about absent opinions while allowing a ready article to be published', async () => {
        const user = userEvent.setup();
        render(<PublicationPage />);
        await selectStory(user);
        const dialog = await openPublish(user);

        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'warning',
                title: 'Publication warning',
                message:
                    'No opinion blocks were added. You can still publish this article.',
            }),
        );
        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
        await user.click(
            within(dialog).getByRole('button', { name: 'Publish' }),
        );

        expect(mocks.updateStatus.mutateAsync).toHaveBeenCalledExactlyOnceWith({
            clusterId: 'event-1',
            status: 'PUBLISHED',
        });
        expect(mocks.refetchDetails).toHaveBeenCalledOnce();
        expect(mocks.refetchList).toHaveBeenCalledOnce();
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'success',
                title: 'Article published',
                message: 'Article was published successfully.',
            }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Move to draft' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: 'Publish all drafts and updates',
            }),
        ).toBeEnabled();
    });

    it('cancels publication without changing status or refreshing the article', async () => {
        const user = userEvent.setup();
        render(<PublicationPage />);
        await selectStory(user);
        const dialog = await openPublish(user);

        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
        expect(mocks.refetchDetails).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: 'Publish all drafts and updates',
            }),
        ).toBeEnabled();
    });

    it('revalidates current article data when a previously ready article is confirmed', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<PublicationPage />);
        await selectStory(user);
        await openPublish(user);
        mocks.details.set('event-1', readyStory({ summary: ' ' }));
        rerender(<PublicationPage />);

        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Publish',
            }),
        );

        expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mocks.showToast).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: 'Article is not ready to publish',
                message: 'Summary is required.',
            }),
        );
    });
});

describe('single publication lifecycle', () => {
    it('keeps the modal and workspace locked while publication is pending and sends a single mutation', async () => {
        const user = userEvent.setup();
        const request = deferred<unknown>();
        mocks.updateStatus.mutateAsync.mockImplementationOnce(() => {
            mocks.updateStatus.isPending = true;
            return request.promise.finally(() => {
                mocks.updateStatus.isPending = false;
            });
        });
        const article = readyStory();
        setStory({
            ...article,
            blocks: [
                ...article.blocks,
                makeEditorialBlock({
                    id: 'opinion',
                    type: 'OPINION',
                    stance: 'CONTRA',
                }),
            ],
        });
        render(<PublicationPage />);
        await selectStory(user);
        const dialog = await openPublish(user);
        expect(mocks.showToast).not.toHaveBeenCalled();

        await user.click(
            within(dialog).getByRole('button', { name: 'Publish' }),
        );

        expect(
            within(dialog).getByRole('button', { name: 'Processing...' }),
        ).toBeDisabled();
        expect(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        ).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: /Saved article/ }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Publish all drafts and updates',
            }),
        ).toBeDisabled();
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        await user.keyboard('{Escape}');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.click(
            within(dialog).getByRole('button', { name: 'Processing...' }),
        );
        expect(mocks.updateStatus.mutateAsync).toHaveBeenCalledExactlyOnceWith({
            clusterId: 'event-1',
            status: 'PUBLISHED',
        });
        expect(mocks.refetchDetails).not.toHaveBeenCalled();

        applyStatus('PUBLISHED');
        await act(async () => request.resolve({}));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Move to draft' }),
        ).toBeEnabled();
        expect(mocks.refetchDetails).toHaveBeenCalledOnce();
        expect(mocks.refetchList).toHaveBeenCalledOnce();
    });

    it.each([
        [
            new Error('Publication service is unavailable'),
            'Publication service is unavailable',
        ],
        ['unexpected failure', 'Unknown error occurred.'],
    ])(
        'shows a failed publication and permits retry through a new confirmation',
        async (failure, message) => {
            const user = userEvent.setup();
            mocks.updateStatus.mutateAsync.mockRejectedValueOnce(failure);
            render(<PublicationPage />);
            await selectStory(user);
            const dialog = await openPublish(user);
            await user.click(
                within(dialog).getByRole('button', { name: 'Publish' }),
            );

            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Failed to update status',
                    message,
                }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Publish' }),
            ).toBeEnabled();
            expect(
                screen.getByRole('button', { name: 'Archive' }),
            ).toBeEnabled();
            expect(mocks.refetchDetails).not.toHaveBeenCalled();

            const retryDialog = await openPublish(user);
            await user.click(
                within(retryDialog).getByRole('button', { name: 'Publish' }),
            );

            expect(mocks.updateStatus.mutateAsync).toHaveBeenCalledTimes(2);
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Article published' }),
            );
            expect(
                screen.getByRole('button', { name: 'Publish' }),
            ).toBeDisabled();
        },
    );
});

describe('archive and move to draft', () => {
    it.each([
        {
            initial: 'DRAFT',
            label: 'Archive',
            target: 'ARCHIVED',
            title: 'Article archived',
            message: 'Article was archived successfully.',
        },
        {
            initial: 'PUBLISHED',
            label: 'Archive',
            target: 'ARCHIVED',
            title: 'Article archived',
            message: 'Article was archived successfully.',
        },
        {
            initial: 'PUBLISHED',
            label: 'Move to draft',
            target: 'DRAFT',
            title: 'Moved to draft',
            message: 'Article was moved back to draft.',
        },
        {
            initial: 'ARCHIVED',
            label: 'Move to draft',
            target: 'DRAFT',
            title: 'Moved to draft',
            message: 'Article was moved back to draft.',
        },
    ] as const)(
        'moves a $initial article to $target without a publication confirmation',
        async ({ initial, label, target, title, message }) => {
            const user = userEvent.setup();
            setStory(readyStory({ status: initial }));
            render(<PublicationPage />);
            await selectStory(user);

            await user.click(screen.getByRole('button', { name: label }));

            expect(
                mocks.updateStatus.mutateAsync,
            ).toHaveBeenCalledExactlyOnceWith({
                clusterId: 'event-1',
                status: target,
            });
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(mocks.refetchDetails).toHaveBeenCalledOnce();
            expect(mocks.refetchList).toHaveBeenCalledOnce();
            expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ type: 'success', title, message }),
            );
            expect(screen.getByRole('button', { name: label })).toBeDisabled();
        },
    );

    it.each([
        { initial: 'DRAFT', label: 'Move to draft' },
        { initial: 'PUBLISHED', label: 'Publish' },
        { initial: 'ARCHIVED', label: 'Archive' },
    ] as const)(
        'disables the action that would keep a $initial article in its current status',
        async ({ initial, label }) => {
            const user = userEvent.setup();
            setStory(readyStory({ status: initial }));
            render(<PublicationPage />);
            await selectStory(user);

            expect(screen.getByRole('button', { name: label })).toBeDisabled();
            await user.click(screen.getByRole('button', { name: label }));

            expect(mocks.updateStatus.mutateAsync).not.toHaveBeenCalled();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        },
    );

    it('blocks further status changes until an archive request finishes', async () => {
        const user = userEvent.setup();
        const request = deferred<unknown>();
        mocks.updateStatus.mutateAsync.mockReturnValueOnce(request.promise);
        render(<PublicationPage />);
        await selectStory(user);

        await user.click(screen.getByRole('button', { name: 'Archive' }));

        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Publish all drafts and updates',
            }),
        ).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Archive' }));
        expect(mocks.updateStatus.mutateAsync).toHaveBeenCalledTimes(1);
        applyStatus('ARCHIVED');
        await act(async () => request.resolve({}));

        expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Move to draft' }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: 'Publish all drafts and updates',
            }),
        ).toBeEnabled();
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Article archived' }),
        );
    });

    it.each([
        { initial: 'DRAFT', label: 'Archive', target: 'ARCHIVED' },
        { initial: 'PUBLISHED', label: 'Move to draft', target: 'DRAFT' },
    ] as const)(
        'retains the article after a failed $label and allows retry',
        async ({ initial, label, target }) => {
            const user = userEvent.setup();
            setStory(readyStory({ status: initial }));
            mocks.updateStatus.mutateAsync.mockRejectedValueOnce(
                new Error('Status conflict'),
            );
            render(<PublicationPage />);
            await selectStory(user);

            await user.click(screen.getByRole('button', { name: label }));

            expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Failed to update status',
                    message: 'Status conflict',
                }),
            );
            expect(screen.getByRole('button', { name: label })).toBeEnabled();
            expect(mocks.refetchDetails).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: label }));

            expect(mocks.updateStatus.mutateAsync).toHaveBeenCalledTimes(2);
            expect(mocks.updateStatus.mutateAsync).toHaveBeenLastCalledWith({
                clusterId: 'event-1',
                status: target,
            });
            expect(screen.getByRole('button', { name: label })).toBeDisabled();
            expect(mocks.refetchDetails).toHaveBeenCalledOnce();
        },
    );
});
