import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SaveContextDraftPayload } from '../../../../../entities/contextualization/api/saveContextDraft';
import type { useClusterBulk } from '../ClusterBulkPanel/useClusterBulk';
import { makeBulkState } from '../ClusterBulkPanel/clusterBulkTestFixtures';
import {
    deferred,
    makeEditorialBlock,
    makeEditorialStory,
    nextVersion,
    type EditorialStory,
} from '../editorialTestFixtures';
import { ContextualizationPage } from './ContextualizationPage';

const mocks = vi.hoisted(() => ({
    stories: [] as EditorialStory[],
    details: new Map<string, EditorialStory>(),
    generate: { isPending: false, mutateAsync: vi.fn() },
    save: { isPending: false, mutateAsync: vi.fn() },
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
        isFetching: false,
        refetch: mocks.refetchDetails,
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
    useClusterBulk: () => mocks.bulk,
}));
vi.mock('../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

function setStory(story: EditorialStory) {
    mocks.stories = [story];
    mocks.details.set(story.id, story);
}

function draftResponse(story = makeEditorialStory()) {
    return {
        cluster: { ...story, updatedAt: nextVersion },
        blocks: story.blocks,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.details = new Map();
    setStory(makeEditorialStory());
    mocks.generate.isPending = false;
    mocks.generate.mutateAsync.mockReset().mockResolvedValue(draftResponse());
    mocks.save.isPending = false;
    mocks.save.mutateAsync
        .mockReset()
        .mockImplementation(
            async ({
                clusterId,
                payload,
            }: {
                clusterId: string;
                payload: SaveContextDraftPayload;
            }) => ({
                cluster: {
                    ...mocks.details.get(clusterId),
                    title: payload.title,
                    summary: payload.summary,
                    updatedAt: nextVersion,
                },
                blocks: payload.blocks.map((block, index) =>
                    makeEditorialBlock({ ...block, id: `saved-${index}` }),
                ),
            }),
        );
    mocks.bulk = makeBulkState();
    mocks.refetchList.mockResolvedValue({});
    mocks.refetchDetails.mockResolvedValue({});
});

async function selectStory(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: /Saved article/ }));
}

function blockCards() {
    return [
        ...document.querySelectorAll<HTMLElement>('.contextualization_card'),
    ];
}

function changeField(element: HTMLElement, value: string) {
    fireEvent.change(element, { target: { value } });
}

describe('single draft generation', () => {
    it('locks all draft actions until generation finishes, then adopts and sorts the saved response', async () => {
        const user = userEvent.setup();
        const generated = makeEditorialStory({
            title: 'Generated article',
            summary: 'Generated summary.',
            blocks: [
                makeEditorialBlock({
                    id: 'opinion',
                    type: 'OPINION',
                    content: 'Generated opinion.',
                    position: 3,
                    stance: 'PRO',
                }),
                makeEditorialBlock({ content: 'Generated fact.', position: 1 }),
                makeEditorialBlock({
                    id: 'context',
                    type: 'CONTEXT',
                    content: 'Generated context.',
                    position: 2,
                }),
            ],
        });
        const request = deferred<ReturnType<typeof draftResponse>>();
        mocks.generate.mutateAsync.mockReturnValueOnce(request.promise);
        render(<ContextualizationPage />);
        await selectStory(user);

        await user.click(
            screen.getByRole('button', { name: 'Generate draft' }),
        );

        expect(mocks.generate.mutateAsync).toHaveBeenCalledExactlyOnceWith(
            'event-1',
        );
        expect(screen.getByLabelText('Title')).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Save draft' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: /Saved article/ }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Contextualize all drafts and updates',
            }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Generate draft' }),
        );
        expect(mocks.generate.mutateAsync).toHaveBeenCalledTimes(1);

        await act(async () => request.resolve(draftResponse(generated)));

        expect(screen.getByLabelText('Title')).toHaveValue('Generated article');
        expect(screen.getByLabelText('Summary')).toHaveValue(
            'Generated summary.',
        );
        expect(
            screen
                .getAllByLabelText('Block content')
                .map((input) => (input as HTMLTextAreaElement).value),
        ).toEqual([
            'Generated fact.',
            'Generated context.',
            'Generated opinion.',
        ]);
        expect(screen.getByLabelText('Title')).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Discard changes' }),
        ).not.toBeInTheDocument();
        expect(mocks.refetchList).toHaveBeenCalledOnce();
        expect(mocks.refetchDetails).toHaveBeenCalledOnce();
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'success',
                title: 'Draft generated',
            }),
        );
    });

    it.each([
        [new Error('AI is unavailable'), 'AI is unavailable'],
        ['unexpected failure', 'Unknown error occurred.'],
    ])(
        'preserves the saved draft after a generation failure and allows retry',
        async (failure, message) => {
            const user = userEvent.setup();
            mocks.generate.mutateAsync.mockRejectedValueOnce(failure);
            render(<ContextualizationPage />);
            await selectStory(user);

            await user.click(
                screen.getByRole('button', { name: 'Generate draft' }),
            );

            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Failed to generate draft',
                    message,
                }),
            );
            expect(screen.getByLabelText('Title')).toHaveValue('Saved article');
            expect(screen.getByLabelText('Block content')).toHaveValue(
                'Verified fact content.',
            );
            expect(
                screen.getByRole('button', { name: 'Generate draft' }),
            ).toBeEnabled();
            expect(mocks.refetchDetails).not.toHaveBeenCalled();

            await user.click(
                screen.getByRole('button', { name: 'Generate draft' }),
            );

            expect(mocks.generate.mutateAsync).toHaveBeenCalledTimes(2);
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Draft generated' }),
            );
        },
    );
});

describe('draft validation and editing', () => {
    it.each([
        {
            name: 'title',
            overrides: { title: '  ' },
            error: 'Title is required.',
        },
        {
            name: 'summary',
            overrides: { summary: '  ' },
            error: 'Summary is required.',
        },
        {
            name: 'block content',
            overrides: { blocks: [makeEditorialBlock({ content: '  ' })] },
            error: 'All semantic blocks must have content.',
        },
        {
            name: 'opinion stance',
            overrides: {
                blocks: [makeEditorialBlock({ type: 'OPINION', stance: null })],
            },
            error: 'Every opinion block must have a stance.',
        },
        ...[
            'javascript:alert(1)',
            'ftp://example.test/report',
            'invalid-url',
        ].map((sourceUrl) => ({
            name: `source URL ${sourceUrl}`,
            overrides: { blocks: [makeEditorialBlock({ sourceUrl })] },
            error: 'Source URLs must be valid http or https URLs.',
        })),
    ])(
        'rejects an invalid $name without saving or refetching',
        async ({ overrides, error }) => {
            const user = userEvent.setup();
            setStory(makeEditorialStory(overrides));
            render(<ContextualizationPage />);
            await selectStory(user);

            await user.click(
                screen.getByRole('button', { name: 'Save draft' }),
            );

            expect(mocks.save.mutateAsync).not.toHaveBeenCalled();
            expect(mocks.refetchList).not.toHaveBeenCalled();
            expect(mocks.refetchDetails).not.toHaveBeenCalled();
            expect(mocks.showToast).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Draft is not ready to save',
                    message: error,
                }),
            );
            expect(screen.getByLabelText('Title')).toBeEnabled();
        },
    );

    it('requires a block after confirmed removal and keeps removal local until Save draft', async () => {
        const user = userEvent.setup();
        render(<ContextualizationPage />);
        await selectStory(user);
        await user.click(screen.getByRole('button', { name: 'Remove' }));

        expect(screen.getByRole('dialog')).toHaveTextContent(
            'removed from the draft',
        );
        expect(
            screen.getByRole('button', {
                name: 'Contextualize all drafts and updates',
            }),
        ).toBeDisabled();
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Cancel',
            }),
        );
        expect(blockCards()).toHaveLength(1);
        expect(
            screen.queryByRole('button', { name: 'Discard changes' }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Remove' }));
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Remove block',
            }),
        );

        expect(screen.getByText('No semantic blocks')).toBeInTheDocument();
        expect(mocks.save.mutateAsync).not.toHaveBeenCalled();
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Block removed' }),
        );
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Draft is not ready to save',
                message: 'At least one semantic block is required.',
            }),
        );
        expect(mocks.save.mutateAsync).not.toHaveBeenCalled();
    });

    it('adds each block type with neutral opinions and allows saving without optional source metadata', async () => {
        const user = userEvent.setup();
        render(<ContextualizationPage />);
        await selectStory(user);
        for (const label of ['Add fact', 'Add context', 'Add opinion']) {
            await user.click(screen.getByRole('button', { name: label }));
        }

        expect(blockCards()).toHaveLength(4);
        expect(
            screen.getByRole('button', { name: /Stance Neutral/ }),
        ).toBeInTheDocument();
        screen
            .getAllByLabelText('Block content')
            .slice(1)
            .forEach((input, index) => {
                changeField(input, `New block ${index + 1}.`);
            });
        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        const payload = mocks.save.mutateAsync.mock.calls[0][0]
            .payload as SaveContextDraftPayload;
        expect(
            payload.blocks.map(({ type, stance, position }) => ({
                type,
                stance,
                position,
            })),
        ).toEqual([
            { type: 'FACT', stance: null, position: 1 },
            { type: 'FACT', stance: null, position: 2 },
            { type: 'CONTEXT', stance: null, position: 3 },
            { type: 'OPINION', stance: 'NEUTRAL', position: 4 },
        ]);
        expect(payload.blocks[3]).toEqual(
            expect.objectContaining({
                title: null,
                sourceName: null,
                sourceUrl: null,
                authorName: null,
            }),
        );
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'warning',
                title: 'Draft quality warning',
                message: expect.stringContaining(
                    'You can still save this draft.',
                ),
            }),
        );
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'success', title: 'Draft saved' }),
        );
        expect(
            screen.queryByRole('button', { name: 'Discard changes' }),
        ).not.toBeInTheDocument();
    });

    it('normalizes edited fields and persists renumbered blocks with the selected opinion stance', async () => {
        const user = userEvent.setup();
        setStory(
            makeEditorialStory({
                blocks: [
                    makeEditorialBlock({
                        id: 'opinion',
                        type: 'OPINION',
                        position: 9,
                        stance: 'NEUTRAL',
                        authorName: '   ',
                    }),
                    makeEditorialBlock({
                        position: 4,
                        authorName: '  Fact author  ',
                    }),
                    makeEditorialBlock({
                        id: 'context',
                        type: 'CONTEXT',
                        position: 1,
                    }),
                ],
            }),
        );
        render(<ContextualizationPage />);
        await selectStory(user);
        await user.click(
            within(blockCards()[0]).getByRole('button', { name: 'Remove' }),
        );
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', {
                name: 'Remove block',
            }),
        );
        changeField(screen.getByLabelText('Title'), '  Edited article  ');
        changeField(screen.getByLabelText('Summary'), '  Edited summary.  ');
        const [fact, opinion] = blockCards().map((card) => within(card));
        changeField(fact.getByLabelText('Block title'), '   ');
        changeField(fact.getByLabelText('Block content'), '  Edited fact.  ');
        changeField(fact.getByLabelText('Source name'), '   ');
        changeField(fact.getByLabelText('Source URL'), '   ');
        changeField(
            opinion.getByLabelText('Block title'),
            '  Edited opinion  ',
        );
        changeField(
            opinion.getByLabelText('Block content'),
            '  Opinion content.  ',
        );
        changeField(opinion.getByLabelText('Source name'), '  Reuters  ');
        changeField(
            opinion.getByLabelText('Source URL'),
            '  https://example.test/opinion  ',
        );
        await user.click(
            opinion.getByRole('button', { name: /Stance Neutral/ }),
        );
        await user.click(screen.getByRole('option', { name: 'Pro' }));

        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        expect(mocks.save.mutateAsync).toHaveBeenCalledExactlyOnceWith({
            clusterId: 'event-1',
            payload: {
                title: 'Edited article',
                summary: 'Edited summary.',
                blocks: [
                    {
                        type: 'FACT',
                        title: null,
                        content: 'Edited fact.',
                        position: 1,
                        sourceName: null,
                        sourceUrl: null,
                        authorName: 'Fact author',
                        stance: null,
                    },
                    {
                        type: 'OPINION',
                        title: 'Edited opinion',
                        content: 'Opinion content.',
                        position: 2,
                        sourceName: 'Reuters',
                        sourceUrl: 'https://example.test/opinion',
                        authorName: null,
                        stance: 'PRO',
                    },
                ],
            },
        });
        expect(screen.getByLabelText('Title')).toHaveValue('Edited article');
        expect(
            screen
                .getAllByLabelText('Block content')
                .map((input) => (input as HTMLTextAreaElement).value),
        ).toEqual(['Edited fact.', 'Opinion content.']);
        expect(mocks.refetchList).toHaveBeenCalledOnce();
        expect(mocks.refetchDetails).toHaveBeenCalledOnce();
    });

    it('initializes an empty draft with editable fact, context and neutral opinion blocks', async () => {
        const user = userEvent.setup();
        setStory(makeEditorialStory({ blocks: [] }));
        render(<ContextualizationPage />);
        await selectStory(user);

        expect(screen.getAllByLabelText('Block content')).toHaveLength(3);
        expect(
            screen.getByRole('button', { name: /Stance Neutral/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Discard changes' }),
        ).not.toBeInTheDocument();
        screen
            .getAllByLabelText('Block content')
            .forEach((input, index) =>
                changeField(input, `Initial block ${index + 1}.`),
            );
        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        expect(
            mocks.save.mutateAsync.mock.calls[0][0].payload.blocks.map(
                (block: { type: string }) => block.type,
            ),
        ).toEqual(['FACT', 'CONTEXT', 'OPINION']);
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Draft saved' }),
        );
    });
});

describe('saving a draft', () => {
    it('prevents duplicate saves and editing while saving, then unlocks the saved draft', async () => {
        const user = userEvent.setup();
        const request = deferred<ReturnType<typeof draftResponse>>();
        mocks.save.mutateAsync.mockReturnValueOnce(request.promise);
        render(<ContextualizationPage />);
        await selectStory(user);
        changeField(screen.getByLabelText('Title'), 'My edited article');

        await user.click(screen.getByRole('button', { name: 'Save draft' }));

        expect(screen.getByLabelText('Title')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Add fact' })).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Discard changes' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Contextualize all drafts and updates',
            }),
        ).toBeDisabled();
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        expect(mocks.save.mutateAsync).toHaveBeenCalledTimes(1);
        await act(async () =>
            request.resolve(
                draftResponse(
                    makeEditorialStory({ title: 'My edited article' }),
                ),
            ),
        );

        expect(screen.getByLabelText('Title')).toHaveValue('My edited article');
        expect(screen.getByLabelText('Title')).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Discard changes' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Contextualize all drafts and updates',
            }),
        ).toBeEnabled();
    });

    it.each([
        [new Error('Draft conflict'), 'Draft conflict'],
        ['unexpected failure', 'Unknown error occurred.'],
    ])(
        'preserves unsaved input after failure and allows saving it again',
        async (failure, message) => {
            const user = userEvent.setup();
            mocks.save.mutateAsync.mockRejectedValueOnce(failure);
            render(<ContextualizationPage />);
            await selectStory(user);
            changeField(screen.getByLabelText('Title'), 'My unsaved title');

            await user.click(
                screen.getByRole('button', { name: 'Save draft' }),
            );

            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Failed to save draft',
                    message,
                }),
            );
            expect(screen.getByLabelText('Title')).toHaveValue(
                'My unsaved title',
            );
            expect(screen.getByLabelText('Title')).toBeEnabled();
            expect(
                screen.getByRole('button', { name: 'Discard changes' }),
            ).toBeEnabled();
            expect(mocks.refetchDetails).not.toHaveBeenCalled();

            await user.click(
                screen.getByRole('button', { name: 'Save draft' }),
            );

            expect(mocks.save.mutateAsync).toHaveBeenCalledTimes(2);
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Draft saved' }),
            );
            expect(
                screen.queryByRole('button', { name: 'Discard changes' }),
            ).not.toBeInTheDocument();
        },
    );
});
