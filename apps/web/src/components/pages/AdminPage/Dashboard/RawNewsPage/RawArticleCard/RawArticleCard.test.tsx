import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RawArticleCard } from './RawArticleCard';
import type { RawNewsFeedItem } from '../../../../../../entities/raw-news/model/types';

const mocks = vi.hoisted(() => ({
    update: vi.fn<
        (input: Record<string, unknown>) => Promise<{ updatedAt: string }>
    >(),
    review: vi.fn<(input: Record<string, unknown>) => Promise<unknown>>(),
    showToast: vi.fn(),
}));

// Exercise the real card, modal and form controls. The mutation doubles expose
// pending state for each deferred request without importing API clients.
vi.mock(
    '../../../../../../entities/raw-news/hooks/useUpdateArticleMutation',
    async () => {
        const { useState } = await import('react');
        return {
            useUpdateArticleMutation: () => {
                const [isPending, setIsPending] = useState(false);
                return {
                    isPending,
                    mutateAsync: async (input: Record<string, unknown>) => {
                        setIsPending(true);
                        try {
                            return await mocks.update(input);
                        } finally {
                            setIsPending(false);
                        }
                    },
                };
            },
        };
    },
);

vi.mock(
    '../../../../../../entities/raw-news/hooks/useReviewArticleContentMutation',
    async () => {
        const { useState } = await import('react');
        return {
            useReviewArticleContentMutation: () => {
                const [isPending, setIsPending] = useState(false);
                return {
                    isPending,
                    mutateAsync: async (input: Record<string, unknown>) => {
                        setIsPending(true);
                        try {
                            return await mocks.review(input);
                        } finally {
                            setIsPending(false);
                        }
                    },
                };
            },
        };
    },
);

vi.mock('../../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

const originalVersion = '2026-09-09T10:00:00.000Z';
const savedVersion = '2026-09-09T11:00:00.000Z';
const latestVersion = '2026-09-09T12:00:00.000Z';

const makeArticle = (
    overrides: Partial<RawNewsFeedItem> = {},
): RawNewsFeedItem => ({
    id: 'article-1',
    sourceId: 'source-1',
    url: 'https://example.test/article-1',
    title: 'Original article headline',
    summary: 'A detailed summary containing enough information for review.',
    content: 'Full original article content. '.repeat(60),
    preview: 'Original accessible preview',
    imageUrl: null,
    status: 'REVIEWED',
    createdAt: originalVersion,
    updatedAt: originalVersion,
    publishedAt: originalVersion,
    fetchedAt: originalVersion,
    sourceName: 'Example News',
    sourceBaseUrl: 'https://example.test',
    country: 'BE',
    language: 'en',
    embedding: null,
    contentAvailability: 'FULL_TEXT',
    embeddingBasis: '',
    cleaningMethod: 'RULE_BASED',
    embeddingModel: '',
    parserVersion: 'fixture-1',
    clusterLinksCount: 0,
    clusterCandidatesCount: 0,
    pipeline: {
        fetched: true,
        cleaned: true,
        embedded: false,
        clustered: false,
    },
    ...overrides,
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
};

type CardProps = ComponentProps<typeof RawArticleCard>;
let container: HTMLDivElement;
let root: Root;
let props: CardProps;

const render = async (updates: Partial<CardProps> = {}) => {
    props = { ...props, ...updates };
    await act(async () => root.render(<RawArticleCard {...props} />));
};

const button = (label: string) => {
    const target = [...document.body.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
    );
    expect(target, `Expected button ${label}`).toBeDefined();
    return target!;
};

const click = async (label: string) => {
    await act(async () => button(label).click());
};

const field = (label: string) => {
    const target = [
        ...document.body.querySelectorAll<HTMLLabelElement>(
            '.review_modal__fields label',
        ),
    ].find((element) => element.textContent?.trim() === label);
    expect(target, `Expected field label ${label}`).toBeDefined();
    const control = document.getElementById(target!.htmlFor);
    expect(
        control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement,
    ).toBe(true);
    return control as HTMLInputElement | HTMLTextAreaElement;
};

const change = async (label: string, value: string) => {
    await act(async () => {
        const control = field(label);
        const prototype =
            control instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
            control,
            value,
        );
        control.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

const expectFieldsDisabled = (disabled: boolean) => {
    for (const label of ['Title', 'Summary', 'Preview', 'Content']) {
        expect(field(label).matches(':disabled'), label).toBe(disabled);
    }
};

const dialog = () => document.body.querySelector('[role="dialog"]');

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.update.mockResolvedValue({ updatedAt: savedVersion });
    mocks.review.mockResolvedValue({});
    props = {
        article: makeArticle(),
        eligibility: { RECHECK: true, APPROVE: true, REJECT: true },
        selected: false,
        selectionDisabled: false,
        onSelectionChange: vi.fn(),
        disabled: false,
        onAcquireInteraction: vi.fn(() => true),
        onReleaseInteraction: vi.fn(),
    };
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('RawArticleCard review and approval', () => {
    it('honors server approval eligibility despite stale availability and sends only the status and version', async () => {
        await render({
            article: makeArticle({ contentAvailability: 'SUMMARY_ONLY' }),
        });
        await click('Review');
        await change('Title', 'A discarded local headline');
        await change('Content', 'A discarded local excerpt');
        await click('Cancel');
        expect(button('Approve').disabled).toBe(false);

        await click('Approve');

        expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
            id: 'article-1',
            expectedUpdatedAt: originalVersion,
            status: 'APPROVED',
        });
        expect(mocks.review).not.toHaveBeenCalled();
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Article approved' }),
        );
    });

    it('does not approve when the server marks an otherwise complete article ineligible', async () => {
        await render({
            eligibility: { RECHECK: true, APPROVE: false, REJECT: true },
        });
        expect(button('Approve').disabled).toBe(true);

        await click('Approve');

        expect(mocks.update).not.toHaveBeenCalled();
        expect(props.onAcquireInteraction).not.toHaveBeenCalled();
    });

    it('opens linked and CLUSTERED articles for inspection while disabling every edit and Save', async () => {
        for (const article of [
            makeArticle({ clusterLinksCount: 1 }),
            makeArticle({ status: 'CLUSTERED' }),
        ]) {
            await render({
                article,
                eligibility: { RECHECK: false, APPROVE: false, REJECT: false },
            });
            expect(button('Review').disabled).toBe(false);
            await click('Review');

            expect(dialog()).not.toBeNull();
            expect(document.body.textContent).toContain('read-only');
            expect(field('Content').value).toBe(article.content);
            expectFieldsDisabled(true);
            expect(button('Save').disabled).toBe(true);
            await click('Save');
            expect(mocks.update).not.toHaveBeenCalled();
            expect(mocks.review).not.toHaveBeenCalled();

            await click('Cancel');
            expect(dialog()).toBeNull();
        }
    });

    it('opens fresh fields, preserves an open draft through refetch and saves against the captured version', async () => {
        await render();
        const freshArticle = makeArticle({
            title: 'Fresh server headline',
            summary: 'Fresh server summary with sufficient detail for review.',
            content: 'Fresh server article content. '.repeat(60),
            preview: 'Fresh server preview',
            updatedAt: savedVersion,
        });
        await render({ article: freshArticle });
        await click('Review');
        expect(field('Title').value).toBe(freshArticle.title);
        expect(field('Summary').value).toBe(freshArticle.summary);
        expect(field('Content').value).toBe(freshArticle.content);
        expect(field('Preview').value).toBe(freshArticle.preview);

        await change('Title', 'My unsaved headline');
        await change('Summary', 'My unsaved detailed summary');
        await change('Preview', 'My unsaved preview');
        await change('Content', 'My unsaved article text');
        const concurrentArticle = makeArticle({
            title: 'Concurrent server headline',
            updatedAt: latestVersion,
        });
        await render({ article: concurrentArticle });
        expect(field('Title').value).toBe('My unsaved headline');
        expect(field('Summary').value).toBe('My unsaved detailed summary');
        expect(field('Preview').value).toBe('My unsaved preview');
        expect(field('Content').value).toBe('My unsaved article text');
        mocks.update.mockRejectedValueOnce(new Error('409: Article changed.'));

        await click('Save');

        expect(mocks.update).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedUpdatedAt: savedVersion,
                title: 'My unsaved headline',
                summary: 'My unsaved detailed summary',
                preview: 'My unsaved preview',
                content: 'My unsaved article text',
            }),
        );
        expect(mocks.review).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
        expect(field('Title').value).toBe('My unsaved headline');
        expectFieldsDisabled(false);
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Failed to save article' }),
        );

        await click('Cancel');
        await click('Review');
        expect(field('Title').value).toBe(concurrentArticle.title);
        await click('Save');
        expect(mocks.update.mock.calls[1][0]).toEqual(
            expect.objectContaining({
                title: concurrentArticle.title,
                expectedUpdatedAt: latestVersion,
            }),
        );
    });

    it('keeps fields locked during both save requests and passes the newly saved version to recheck', async () => {
        const saving = deferred<{ updatedAt: string }>();
        const rechecking = deferred<unknown>();
        mocks.update.mockReturnValueOnce(saving.promise);
        mocks.review.mockReturnValueOnce(rechecking.promise);
        await render();
        await click('Review');
        await change('Title', 'The submitted headline');

        const save = button('Save');
        await act(async () => {
            save.click();
            save.click();
        });

        expect(mocks.update).toHaveBeenCalledTimes(1);
        expectFieldsDisabled(true);
        expect(button('Saving...').disabled).toBe(true);
        expect(button('Cancel').disabled).toBe(true);
        expect(field('Title').value).toBe('The submitted headline');
        await act(async () => {
            document.body
                .querySelector<HTMLButtonElement>('[aria-label="Close Modal"]')!
                .click();
            window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Escape' }),
            );
        });
        expect(dialog()).not.toBeNull();
        expect(mocks.review).not.toHaveBeenCalled();

        await act(async () => saving.resolve({ updatedAt: savedVersion }));

        expect(mocks.review).toHaveBeenCalledExactlyOnceWith({
            id: 'article-1',
            expectedUpdatedAt: savedVersion,
        });
        expectFieldsDisabled(true);
        expect(button('Cancel').disabled).toBe(true);
        expect(dialog()).not.toBeNull();

        await act(async () => rechecking.resolve({}));

        expect(dialog()).toBeNull();
        expect(props.onReleaseInteraction).toHaveBeenCalledTimes(1);
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Article saved' }),
        );
    });

    it('retains the saved draft after recheck fails and retries against the saved version', async () => {
        mocks.review.mockRejectedValueOnce(
            new Error('Recheck temporarily failed'),
        );
        await render();
        await click('Review');
        await change('Title', 'Saved title awaiting recheck');
        await click('Save');

        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Article saved; recheck failed' }),
        );
        expect(dialog()).not.toBeNull();
        expectFieldsDisabled(false);
        expect(field('Title').value).toBe('Saved title awaiting recheck');
        expect(props.onReleaseInteraction).not.toHaveBeenCalled();
        await render({
            article: makeArticle({
                title: 'Older cached headline',
                updatedAt: originalVersion,
            }),
        });
        expect(field('Title').value).toBe('Saved title awaiting recheck');
        await change('Title', 'Revised title before retry');
        mocks.update.mockResolvedValueOnce({ updatedAt: latestVersion });

        await click('Save');

        expect(mocks.update.mock.calls[1][0]).toEqual(
            expect.objectContaining({
                title: 'Revised title before retry',
                expectedUpdatedAt: savedVersion,
            }),
        );
        expect(mocks.review.mock.calls[1][0]).toEqual({
            id: 'article-1',
            expectedUpdatedAt: latestVersion,
        });
        expect(dialog()).toBeNull();
    });
});
