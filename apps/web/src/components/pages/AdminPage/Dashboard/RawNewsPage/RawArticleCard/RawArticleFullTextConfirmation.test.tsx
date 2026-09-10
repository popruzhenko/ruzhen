import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RawArticleCard } from './RawArticleCard';
import type { RawNewsFeedItem } from '../../../../../../entities/raw-news/model/types';

const mocks = vi.hoisted(() => ({
    update: vi.fn<
        (payload: Record<string, unknown>) => Promise<{ updatedAt: string }>
    >(),
    review: vi.fn(),
    toast: vi.fn(),
}));
vi.mock(
    '../../../../../../entities/raw-news/hooks/useUpdateArticleMutation',
    () => ({
        useUpdateArticleMutation: () => ({
            isPending: false,
            mutateAsync: mocks.update,
        }),
    }),
);
vi.mock(
    '../../../../../../entities/raw-news/hooks/useReviewArticleContentMutation',
    () => ({
        useReviewArticleContentMutation: () => ({
            isPending: false,
            mutateAsync: mocks.review,
        }),
    }),
);
vi.mock('../../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.toast }),
}));

const article: RawNewsFeedItem = {
    id: 'article-1',
    sourceId: 'source-1',
    url: 'https://example.test/article',
    title: 'A short complete news article',
    summary: 'A sufficiently detailed summary of the original report.',
    content: 'This is a short, complete report.',
    preview: 'Summary preview',
    imageUrl: null,
    status: 'REVIEWED',
    createdAt: '2026-09-09T10:00:00.000Z',
    updatedAt: '2026-09-09T10:00:00.000Z',
    publishedAt: null,
    fetchedAt: null,
    sourceName: 'Example News',
    sourceBaseUrl: 'https://example.test',
    country: 'BE',
    language: 'en',
    embedding: null,
    contentAvailability: 'PARTIAL_TEXT',
    embeddingBasis: '',
    cleaningMethod: '',
    embeddingModel: '',
    parserVersion: '',
    clusterLinksCount: 0,
    clusterCandidatesCount: 0,
    fullTextVerified: true,
    pipeline: {
        fetched: true,
        cleaned: true,
        embedded: false,
        clustered: false,
    },
};
let root: Root;
let container: HTMLDivElement;
const click = async (text: string) => {
    const target = [...document.body.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === text,
    )!;
    expect(target).toBeDefined();
    await act(async () => target.click());
};
const confirmation = () =>
    document.body.querySelector<HTMLInputElement>(
        '.raw_article_card__full_text_confirmation input',
    )!;
beforeEach(async () => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.update.mockResolvedValue({ updatedAt: '2026-09-09T11:00:00.000Z' });
    mocks.review.mockResolvedValue({});
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
        root.render(
            <RawArticleCard
                article={article}
                eligibility={{ RECHECK: true, APPROVE: false, REJECT: true }}
                selected={false}
                selectionDisabled={false}
                disabled={false}
                onSelectionChange={() => undefined}
                onAcquireInteraction={() => true}
                onReleaseInteraction={() => undefined}
            />,
        ),
    );
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('manual full-text confirmation', () => {
    it('requires a fresh explicit confirmation and sends it with the captured article version', async () => {
        await click('Review');
        expect(confirmation().checked).toBe(false);
        expect(document.body.textContent).toContain(
            'saved article has a full-text verification',
        );
        await act(async () => confirmation().click());
        await click('Save');
        expect(mocks.update).toHaveBeenCalledWith(
            expect.objectContaining({
                confirmFullText: true,
                expectedUpdatedAt: article.updatedAt,
                content: article.content,
            }),
        );
        expect(mocks.review).toHaveBeenCalledWith({
            id: article.id,
            expectedUpdatedAt: '2026-09-09T11:00:00.000Z',
        });
    });

    it('clears the confirmation when the article text is edited and omits a new verification on save', async () => {
        await click('Review');
        await act(async () => confirmation().click());
        const textareas = document.body.querySelectorAll<HTMLTextAreaElement>(
            '.review_modal__fields textarea',
        );
        const content = textareas[textareas.length - 1];
        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                'value',
            )!.set!.call(content, 'A different incomplete article fragment.');
            content.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(confirmation().checked).toBe(false);
        await click('Save');
        expect(mocks.update.mock.calls[0][0].confirmFullText).toBeUndefined();
        expect(mocks.update.mock.calls[0][0].content).toBe(
            'A different incomplete article fragment.',
        );
    });
});
