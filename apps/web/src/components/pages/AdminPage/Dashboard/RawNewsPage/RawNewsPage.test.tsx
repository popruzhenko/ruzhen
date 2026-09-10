import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RawNewsPage } from './RawNewsPage';
import type { FetchNewArticlesResponse } from '../../../../../entities/raw-news/api/fetchNewArticles';
import type {
    RawArticleBulkAction,
    RawArticleBulkPreview,
    RawArticleBulkResult,
    RawArticlesResponse,
} from '../../../../../entities/raw-news/model/rawArticles';
import type { RawArticleEnrichmentHandle } from './RawArticleEnrichmentPanel/TypesRawArticleEnrichmentPanel';

const mocks = vi.hoisted(() => ({
    apiClient: vi.fn<
        (
            url: string,
            options?: {
                method?: string;
                json?: unknown;
                signal?: AbortSignal;
            },
        ) => Promise<unknown>
    >(),
    showToast: vi.fn(),
    startEnrichment: vi.fn(),
}));
vi.mock('../../../../../shared/api/client', () => ({
    apiClient: mocks.apiClient,
}));
vi.mock('./RawArticleEnrichmentPanel/RawArticleEnrichmentPanel', async () => {
    const { forwardRef, useImperativeHandle } = await import('react');
    return {
        RawArticleEnrichmentPanel: forwardRef<
            RawArticleEnrichmentHandle,
            { preferredJobId?: string | null }
        >(({ preferredJobId }, ref) => {
            useImperativeHandle(ref, () => ({
                start: mocks.startEnrichment,
                openHistory: () => undefined,
            }));
            return (
                <div
                    data-testid="enrichment-panel"
                    data-job-id={preferredJobId}
                />
            );
        }),
    };
});
vi.mock('../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('../../../../ui/DropDown/DropDown', () => ({
    DropDown: ({
        label,
        options,
        value,
        onChange,
    }: {
        label: string;
        options: { label: string; value: string }[];
        value: string;
        onChange: (value: string) => void;
    }) => (
        <select
            aria-label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

type RawArticle = RawArticlesResponse['articles'][number];
const version = '2026-09-09T10:00:00.000Z';
const newerVersion = '2026-09-09T11:00:00.000Z';
const fetched = (
    status: FetchNewArticlesResponse['result']['enrichment']['status'],
): FetchNewArticlesResponse => ({
    message: 'Articles fetched successfully.',
    result: {
        parseResults: [
            {
                success: true,
                sourceId: 'source-1',
                sourceName: 'Example News',
                fetchedItems: 10,
                created: 3,
                updated: 2,
                skippedDuplicates: 5,
                skippedInvalid: 0,
            },
            {
                success: true,
                sourceId: 'source-2',
                sourceName: 'Another Source',
                fetchedItems: 5,
                created: 1,
                updated: 0,
                skippedDuplicates: 4,
                skippedInvalid: 0,
            },
        ],
        enrichment: status
            ? { jobId: 'automatic-job', total: 3, status }
            : { jobId: null, total: 0, status: null },
    },
});
const article = (
    id = 'article-1',
    updates: Partial<RawArticle> = {},
): RawArticle => ({
    id,
    sourceId: 'source-1',
    url: `https://example.test/${id}`,
    title: `Article ${id}`,
    summary: 'A sufficiently detailed summary of the current news story.',
    content: 'Full article content. '.repeat(80),
    imageUrl: null,
    publishedAt: version,
    language: 'en',
    country: 'UK',
    status: 'REVIEWED',
    createdAt: version,
    updatedAt: version,
    contentAvailability: 'FULL_TEXT',
    cleanedAccessibleText: null,
    cleaningMethod: null,
    embeddingBasis: null,
    embeddingModel: null,
    embedding: null,
    source: {
        id: 'source-1',
        name: 'Example News',
        baseUrl: 'https://example.test',
    },
    raw: { id: `raw-${id}`, fetchedAt: version, parserVersion: '1' },
    _count: { clusterLinks: 0, clusterCandidates: 0 },
    bulkEligibility: { RECHECK: true, APPROVE: true, REJECT: true },
    ...updates,
});
const list = (articles = [article()]): RawArticlesResponse => ({
    articles,
    total: articles.length,
    totalAll: 12001,
    sourceNames: ['Example News', 'Another Source'],
    pagination: {
        page: 1,
        limit: 50,
        total: articles.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    },
    eligibility: {
        RECHECK: articles.filter((item) => item.bulkEligibility.RECHECK).length,
        APPROVE: articles.filter((item) => item.bulkEligibility.APPROVE).length,
        REJECT: articles.filter((item) => item.bulkEligibility.REJECT).length,
    },
});
const pagedList = (url: string, total = 125): RawArticlesResponse => {
    const params = new URL(url, 'https://test.invalid').searchParams;
    const limit = Number(params.get('limit') || 50) as 25 | 50 | 100;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Number(params.get('page') || 1), totalPages);
    const first = (page - 1) * limit;
    const rows = Array.from(
        { length: Math.min(limit, total - first) },
        (_, index) =>
            article(`article-${first + index + 1}`, {
                enrichmentEligible: true,
            }),
    );
    return {
        ...list(rows),
        total,
        eligibility: { RECHECK: total, APPROVE: total, REJECT: total },
        enrichmentEligibleCount: total,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        },
    };
};
const preview = (
    count = 1,
    action: RawArticleBulkAction = 'RECHECK',
): RawArticleBulkPreview => ({
    action,
    total: count,
    eligible: count,
    items: Array.from({ length: count }, (_, index) => ({
        id: `article-${index + 1}`,
        title: `Article article-${index + 1}`,
        updatedAt: version,
        eligible: true,
    })),
});
const results = (
    items: { id: string }[],
    outcome: RawArticleBulkResult['outcome'] = 'UPDATED',
) => ({
    results: items.map(({ id }) => ({
        id,
        title: `Article ${id}`,
        outcome,
        reason:
            outcome === 'UPDATED' ? 'Article updated.' : 'No change needed.',
    })),
});
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
};

let container: HTMLDivElement;
let root: Root;
let client: QueryClient;
const render = async () => {
    await act(async () =>
        root.render(
            <QueryClientProvider client={client}>
                <RawNewsPage />
            </QueryClientProvider>,
        ),
    );
};
const waitFor = async (assertion: () => void) => {
    await vi.waitFor(
        async () => {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
            assertion();
        },
        { timeout: 2500 },
    );
};
const button = (label: string, parent: ParentNode = document.body) => {
    const target = [...parent.querySelectorAll('button')].find(
        (element) => element.textContent?.trim() === label,
    );
    expect(target, `Expected button ${label}`).toBeDefined();
    return target!;
};
const click = async (label: string, parent?: ParentNode) => {
    await act(async () => button(label, parent).click());
};
const change = async (
    element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
    value: string,
) => {
    await act(async () => {
        const prototype =
            element instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : element instanceof HTMLTextAreaElement
                  ? HTMLTextAreaElement.prototype
                  : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(
            element,
            value,
        );
        element.dispatchEvent(
            new Event(
                element instanceof HTMLSelectElement ? 'change' : 'input',
                { bubbles: true },
            ),
        );
    });
};
const select = (label: string) =>
    container.querySelector<HTMLSelectElement>(
        `select[aria-label="${label}"]`,
    )!;
const checkbox = (id: string) =>
    container.querySelector<HTMLInputElement>(
        `input[aria-label="Select article ${id}"]`,
    )!;
const postCalls = () =>
    mocks.apiClient.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
    );
const batchCalls = () =>
    postCalls().filter(([url]) => url === '/admin/articles/bulk');
const getCalls = () =>
    mocks.apiClient.mock.calls.filter(([, options]) => !options?.method);
const batchItems = (options?: { json?: unknown }) =>
    (options?.json as { items: { id: string; updatedAt: string }[] }).items;
const ready = () => expect(button('Recheck — 1').disabled).toBe(false);
const paginationButton = (label: string) =>
    container.querySelector<HTMLButtonElement>(
        `.raw_articles_pagination button[aria-label="${label}"]`,
    )!;
const goToPage = async (page: number) => {
    await act(async () => paginationButton(`Go to page ${page}`).click());
    await waitFor(() => {
        expect(
            container.querySelector('[aria-current="page"]')?.textContent,
        ).toBe(String(page));
        expect(select('Articles per page').matches(':disabled')).toBe(false);
    });
};
const lastRawParams = () =>
    new URL(getCalls().at(-1)![0], 'https://test.invalid').searchParams;

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    mocks.apiClient.mockImplementation(async (url, options) => {
        if (url.endsWith('/bulk/preview')) {
            return preview(
                1,
                (options?.json as { action: RawArticleBulkAction }).action,
            );
        }
        if (url.endsWith('/bulk')) return results(batchItems(options));
        if (options?.method === 'PATCH')
            return article('article-1', { updatedAt: newerVersion });
        if (url.endsWith('/review-content'))
            return { article: article(), review: {} };
        return list();
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('RawArticles bulk workflow', () => {
    it.each(['QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED'] as const)(
        'shows the automatic enrichment job with its returned %s status after Fetch',
        async (status) => {
            mocks.apiClient.mockImplementation(async (url) =>
                url.endsWith('/fetch-new') ? fetched(status) : list(),
            );
            const invalidations = vi.spyOn(client, 'invalidateQueries');
            await render();
            await waitFor(ready);
            await click('Fetch new articles');
            await waitFor(() => {
                expect(mocks.showToast).toHaveBeenCalledWith({
                    type: 'success',
                    title: 'Articles fetched',
                    message: `Fetched 4 new articles. Automatic Enrich for 3 articles: ${status.toLowerCase()}. See Article enrichment for progress and results.`,
                });
                expect(
                    container
                        .querySelector('[data-testid="enrichment-panel"]')
                        ?.getAttribute('data-job-id'),
                ).toBe('automatic-job');
            });
            expect(
                invalidations.mock.calls.map(
                    ([filters]) => filters?.queryKey?.[0],
                ),
            ).toEqual(
                expect.arrayContaining(['article-enrichment', 'articles']),
            );
            expect(postCalls().map(([url]) => url)).toEqual([
                '/admin/articles/fetch-new',
            ]);
            expect(button('Fetch new articles').disabled).toBe(false);
        },
    );

    it('keeps the displayed job when a later Fetch has no articles to enrich', async () => {
        let response = fetched('QUEUED');
        mocks.apiClient.mockImplementation(async (url) =>
            url.endsWith('/fetch-new') ? response : list(),
        );
        await render();
        await waitFor(ready);
        await click('Fetch new articles');
        await waitFor(() =>
            expect(
                container
                    .querySelector('[data-testid="enrichment-panel"]')
                    ?.getAttribute('data-job-id'),
            ).toBe('automatic-job'),
        );
        response = fetched(null);
        response.result.parseResults.forEach((source) => (source.created = 0));
        await click('Fetch new articles');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenLastCalledWith({
                type: 'success',
                title: 'Articles fetched',
                message:
                    'Fetched 0 new articles. No new articles need automatic enrichment.',
            }),
        );
        expect(
            container
                .querySelector('[data-testid="enrichment-panel"]')
                ?.getAttribute('data-job-id'),
        ).toBe('automatic-job');
    });

    it('refreshes persisted enrichment jobs after a failed Fetch and releases the page controls', async () => {
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/fetch-new')) throw new Error('Connection lost');
            return list();
        });
        const invalidations = vi.spyOn(client, 'invalidateQueries');
        await render();
        await waitFor(ready);
        await click('Fetch new articles');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenCalledWith({
                type: 'error',
                title: 'Failed to fetch articles',
                message: 'Connection lost',
            }),
        );
        expect(
            invalidations.mock.calls.map(([filters]) => filters?.queryKey?.[0]),
        ).toEqual(expect.arrayContaining(['article-enrichment', 'articles']));
        expect(button('Fetch new articles').disabled).toBe(false);
        expect(select('Status').matches(':disabled')).toBe(false);
        expect(postCalls()).toHaveLength(1);
    });

    it('paginates the list while keeping global counts and selects only the displayed page', async () => {
        mocks.apiClient.mockImplementation(async (url, options) =>
            url.endsWith('/bulk/preview')
                ? preview(
                      (options?.json as { scope: { ids: string[] } }).scope.ids
                          .length,
                  )
                : pagedList(url),
        );
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        expect(lastRawParams().get('page')).toBe('1');
        expect(lastRawParams().get('limit')).toBe('50');
        expect(container.textContent).toContain('Showing 1–50 of 125');
        expect(container.textContent).toContain(
            'All articles matching filters (125)',
        );
        expect(container.querySelectorAll('.raw_article_card')).toHaveLength(
            50,
        );
        await click('Select all shown');
        expect(container.textContent).toContain('Selected articles (50)');
        await goToPage(2);
        expect(lastRawParams().get('page')).toBe('2');
        expect(container.textContent).toContain('Showing 51–100 of 125');
        expect(container.textContent).toContain('Selected articles (0)');
        expect(checkbox('article-51').checked).toBe(false);
        expect(
            container.querySelector(
                'input[aria-label="Select article article-1"]',
            ),
        ).toBeNull();
        await click('Select all shown');
        await click('Recheck — 50');
        expect(postCalls()[0][1]?.json).toEqual({
            action: 'RECHECK',
            scope: {
                type: 'SELECTED',
                ids: Array.from(
                    { length: 50 },
                    (_, index) => `article-${index + 51}`,
                ),
            },
        });
    });

    it('uses the whole filtered scope for bulk actions and Enrich from any page', async () => {
        mocks.apiClient.mockImplementation(async (url) =>
            url.endsWith('/bulk/preview') ? preview(125) : pagedList(url),
        );
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await change(select('Source'), 'Example News');
        await waitFor(() =>
            expect(lastRawParams().get('sourceName')).toBe('Example News'),
        );
        await goToPage(2);
        await click('Recheck — 125');
        expect(postCalls()[0][1]?.json).toEqual({
            action: 'RECHECK',
            scope: {
                type: 'FILTERED',
                filters: { sourceName: 'Example News' },
            },
        });
        await click('Cancel');
        await click('Enrich articles — 125');
        expect(mocks.startEnrichment).toHaveBeenCalledWith({
            type: 'FILTERED',
            filters: { sourceName: 'Example News' },
        });
    });

    it('resets to page one for filters, debounced search and page size without requesting the old page', async () => {
        mocks.apiClient.mockImplementation(async (url) => pagedList(url));
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await goToPage(2);
        await change(select('Status'), 'REVIEWED');
        await waitFor(() => {
            expect(lastRawParams().get('status')).toBe('REVIEWED');
            expect(lastRawParams().get('page')).toBe('1');
        });
        await goToPage(2);
        const search = container.querySelector<HTMLInputElement>(
            'input[placeholder^="Search title"]',
        )!;
        await change(search, '  updated story  ');
        expect(select('Articles per page').matches(':disabled')).toBe(true);
        await waitFor(() => {
            expect(lastRawParams().get('search')).toBe('updated story');
            expect(lastRawParams().get('page')).toBe('1');
            expect(select('Articles per page').matches(':disabled')).toBe(
                false,
            );
        });
        expect(
            getCalls()
                .filter(([url]) => url.includes('search='))
                .every(
                    ([url]) =>
                        new URL(url, 'https://test.invalid').searchParams.get(
                            'page',
                        ) === '1',
                ),
        ).toBe(true);
        await goToPage(2);
        await click('Select all shown');
        await change(select('Articles per page'), '100');
        await waitFor(() => {
            expect(lastRawParams().get('limit')).toBe('100');
            expect(lastRawParams().get('page')).toBe('1');
            expect(container.textContent).toContain('Showing 1–100 of 125');
            expect(container.textContent).toContain('Selected articles (0)');
        });
        expect(select('Status').value).toBe('REVIEWED');
        expect(search.value).toBe('  updated story  ');
    });

    it('locks stale page actions during a request and ignores its late result after filters change', async () => {
        const pending = deferred<RawArticlesResponse>();
        mocks.apiClient.mockImplementation(async (url) => {
            const params = new URL(url, 'https://test.invalid').searchParams;
            if (params.get('page') === '2') return pending.promise;
            return pagedList(url, params.has('sourceName') ? 75 : 125);
        });
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await act(async () => paginationButton('Next page').click());
        expect(button('Recheck — 125').disabled).toBe(true);
        expect(button('Review').disabled).toBe(true);
        expect(button('Fetch new articles').disabled).toBe(true);
        expect(checkbox('article-1').disabled).toBe(true);
        expect(paginationButton('Next page').matches(':disabled')).toBe(true);
        expect(select('Articles per page').matches(':disabled')).toBe(true);
        await change(select('Source'), 'Another Source');
        await waitFor(() => {
            expect(lastRawParams().get('sourceName')).toBe('Another Source');
            expect(lastRawParams().get('page')).toBe('1');
            expect(container.textContent).toContain('Showing 1–50 of 75');
        });
        await act(async () =>
            pending.resolve(pagedList('/admin/articles/raw?page=2&limit=50')),
        );
        expect(container.textContent).toContain('Showing 1–50 of 75');
        expect(container.textContent).not.toContain('Showing 51–100');
        expect(select('Source').value).toBe('Another Source');
        expect(postCalls()).toHaveLength(0);
    });

    it('retries a failed page request with its filters and page unchanged without writing articles', async () => {
        let fails = true;
        mocks.apiClient.mockImplementation(async (url) => {
            const params = new URL(url, 'https://test.invalid').searchParams;
            if (params.get('page') === '2' && fails)
                throw new Error('Read failed');
            return pagedList(url);
        });
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await change(select('Source'), 'Example News');
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await act(async () => paginationButton('Next page').click());
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Failed to load raw articles',
            ),
        );
        expect(select('Source').value).toBe('Example News');
        expect(button('Select all shown').disabled).toBe(true);
        fails = false;
        await click('Retry loading articles');
        await waitFor(() =>
            expect(container.textContent).toContain('Showing 51–100 of 125'),
        );
        expect(lastRawParams().get('sourceName')).toBe('Example News');
        expect(lastRawParams().get('page')).toBe('2');
        expect(lastRawParams().get('limit')).toBe('50');
        expect(postCalls()).toHaveLength(0);
    });

    it('reconciles a server-clamped page after bulk processing shrinks the list and keeps its report', async () => {
        let total = 101;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/bulk/preview')) {
                const result = preview();
                result.items[0].id = 'article-101';
                return result;
            }
            if (url.endsWith('/bulk')) {
                total = 100;
                return results(batchItems(options));
            }
            return pagedList(url, total);
        });
        await render();
        await waitFor(() =>
            expect(button('Recheck — 101').disabled).toBe(false),
        );
        await goToPage(3);
        expect(container.textContent).toContain('Showing 101–101 of 101');
        await click('Select all shown');
        await click('Recheck — 1');
        expect(paginationButton('Previous page').matches(':disabled')).toBe(
            true,
        );
        await click('Confirm recheck — 1');
        await waitFor(() => {
            expect(container.textContent).toContain('Showing 51–100 of 100');
            expect(container.textContent).toContain('Selected articles (0)');
            expect(lastRawParams().get('page')).toBe('2');
        });
        expect(container.textContent).toContain(
            'Updated: 1; unchanged: 0; skipped: 0; errors: 0',
        );
        expect(batchCalls()).toHaveLength(1);
    });

    it('keeps an open draft on its page while refreshes complete and blocks navigation until it closes', async () => {
        mocks.apiClient.mockImplementation(async (url) => pagedList(url));
        await render();
        await waitFor(() =>
            expect(button('Recheck — 125').disabled).toBe(false),
        );
        await goToPage(2);
        await click('Review');
        const title = document.body.querySelector<HTMLInputElement>(
            '.review_modal__fields input',
        )!;
        await change(title, 'My unsaved draft');
        expect(paginationButton('Next page').matches(':disabled')).toBe(true);
        expect(select('Articles per page').matches(':disabled')).toBe(true);
        await act(async () => {
            await client.invalidateQueries({ queryKey: ['articles'] });
        });
        expect(title.value).toBe('My unsaved draft');
        expect(lastRawParams().get('page')).toBe('2');
        await click('Cancel');
        await waitFor(() =>
            expect(select('Articles per page').matches(':disabled')).toBe(
                false,
            ),
        );
        await goToPage(3);
        expect(container.textContent).toContain('Showing 101–125 of 125');
    });

    it('refreshes calendar date filters when the local day changes', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-09T23:59:59.500+02:00'));
        await render();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10);
        });
        await change(select('Fetched date'), 'TODAY');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10);
        });
        const before = new URL(getCalls().at(-1)![0], 'https://test.invalid')
            .searchParams;
        expect(before.get('fetchedFrom')).toBe('2026-09-08T22:00:00.000Z');
        expect(before.get('fetchedTo')).toBe('2026-09-09T22:00:00.000Z');
        await act(async () => {
            await vi.advanceTimersByTimeAsync(600);
        });
        const after = new URL(getCalls().at(-1)![0], 'https://test.invalid')
            .searchParams;
        expect(after.get('fetchedFrom')).toBe('2026-09-09T22:00:00.000Z');
        expect(after.get('fetchedTo')).toBe('2026-09-10T22:00:00.000Z');
        vi.useRealTimers();
    });

    it('uses server filters and totals, retains filters and source choices for empty/error results, and previews the entire filtered scope', async () => {
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/bulk/preview')) return preview();
            const params = new URL(url, 'https://test.invalid').searchParams;
            if (params.get('status') === 'REJECTED')
                throw new Error('Read failed');
            return params.has('search') ? list([]) : list();
        });
        await render();
        await waitFor(ready);
        expect(container.textContent).toContain('Found 1 of 12001 articles');
        expect(getCalls()[0][1]?.signal).toBeInstanceOf(AbortSignal);
        await change(select('Source'), 'Example News');
        await waitFor(ready);
        await click('Recheck — 1');
        expect(postCalls()[0][1]?.json).toEqual({
            action: 'RECHECK',
            scope: {
                type: 'FILTERED',
                filters: { sourceName: 'Example News' },
            },
        });
        expect(batchCalls()).toHaveLength(0);
        await click('Cancel');
        const search = container.querySelector<HTMLInputElement>(
            'input[placeholder^="Search title"]',
        )!;
        await change(search, '  50% _query  ');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'No articles match filters',
            ),
        );
        expect(
            new URL(
                getCalls().at(-1)![0],
                'https://test.invalid',
            ).searchParams.get('search'),
        ).toBe('50% _query');
        expect(select('Source').value).toBe('Example News');
        expect(
            [...select('Source').options].map(({ value }) => value),
        ).toContain('Another Source');
        await change(select('Status'), 'REJECTED');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Failed to load raw articles',
            ),
        );
        expect(search.value).toBe('  50% _query  ');
        expect(select('Status').value).toBe('REJECTED');
        expect(button('Recheck — 0').disabled).toBe(true);
    });

    it('counts eligible selected articles, sends only the explicit selection, and clears selection when filters change', async () => {
        const second = article('article-2', {
            status: 'NEEDS_REVIEW',
            bulkEligibility: { RECHECK: true, APPROVE: false, REJECT: true },
        });
        mocks.apiClient.mockImplementation(async (url, options) =>
            url.endsWith('/bulk/preview')
                ? preview(
                      1,
                      (options?.json as { action: RawArticleBulkAction })
                          .action,
                  )
                : list([article(), second]),
        );
        await render();
        await waitFor(() => expect(button('Recheck — 2').disabled).toBe(false));
        await act(async () => checkbox('article-2').click());
        await act(async () =>
            container
                .querySelectorAll<HTMLInputElement>(
                    'input[name="raw-bulk-scope"]',
                )[1]
                .click(),
        );
        expect(container.textContent).toContain('Selected articles (1)');
        expect(button('Approve ready — 0').disabled).toBe(true);
        await click('Reject — 1');
        expect(postCalls()[0][1]?.json).toEqual({
            action: 'REJECT',
            scope: { type: 'SELECTED', ids: ['article-2'] },
        });
        expect(document.body.textContent).toContain('Confirm rejection');
        await click('Cancel');
        await change(select('Status'), 'NEEDS_REVIEW');
        await waitFor(() =>
            expect(container.textContent).toContain('Selected articles (0)'),
        );
    });

    it('freezes preview versions, locks other controls, stops after the current batch and resumes only unsent articles', async () => {
        const currentBatch = deferred<ReturnType<typeof results>>();
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/bulk/preview')) return preview(30);
            if (url.endsWith('/bulk'))
                return batchCalls().length === 1
                    ? currentBatch.promise
                    : results(batchItems(options));
            return list();
        });
        await render();
        await waitFor(ready);
        await click('Recheck — 1');
        expect(document.body.textContent).toContain(
            'selection is fixed: 30 articles',
        );
        const confirm = button('Confirm recheck — 30');
        await act(async () => {
            confirm.click();
            confirm.click();
        });
        expect(batchCalls()).toHaveLength(1);
        expect(batchItems(batchCalls()[0][1])).toEqual(
            preview(25).items.map(({ id, updatedAt }) => ({ id, updatedAt })),
        );
        expect(button('Review').disabled).toBe(true);
        expect(select('Status').matches(':disabled')).toBe(true);
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        expect(unload.defaultPrevented).toBe(true);
        await click('Stop after current batch');
        await act(async () => currentBatch.resolve(results(preview(25).items)));
        await waitFor(() =>
            expect(button('Run remaining — 5').disabled).toBe(false),
        );
        expect(batchCalls()).toHaveLength(1);
        expect(container.textContent).toContain(
            'Updated: 25; unchanged: 0; skipped: 0; errors: 0; unprocessed: 5',
        );
        await click('Run remaining — 5');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Updated: 30; unchanged: 0; skipped: 0; errors: 0; unprocessed: 0',
            ),
        );
        expect(batchItems(batchCalls()[1][1])).toEqual(
            preview(30)
                .items.slice(25)
                .map(({ id, updatedAt }) => ({ id, updatedAt })),
        );
        expect(
            postCalls().filter(([url]) => url.endsWith('/preview')),
        ).toHaveLength(1);
    });

    it('keeps successful and skipped results and retries only errors using the original expected version', async () => {
        const snapshot = preview(3);
        snapshot.total = 4;
        snapshot.items.push({
            id: 'deleted',
            title: 'Deleted article',
            updatedAt: null,
            eligible: false,
            reason: 'Article no longer exists.',
        });
        const invalidations = vi.spyOn(client, 'invalidateQueries');
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/bulk/preview')) return snapshot;
            if (url.endsWith('/bulk')) {
                if (batchCalls().length > 1)
                    return results(batchItems(options), 'UNCHANGED');
                return {
                    results: [
                        {
                            id: 'article-1',
                            title: 'First',
                            outcome: 'UPDATED',
                            reason: 'Updated.',
                        },
                        {
                            id: 'article-2',
                            title: 'Second',
                            outcome: 'SKIPPED',
                            reason: 'Changed after preview.',
                        },
                        {
                            id: 'article-3',
                            title: 'Third',
                            outcome: 'ERROR',
                            reason: 'Database temporarily unavailable.',
                        },
                    ],
                };
            }
            return list();
        });
        await render();
        await waitFor(ready);
        await click('Recheck — 1');
        await click('Confirm recheck — 3');
        await waitFor(() =>
            expect(button('Retry errors — 1').disabled).toBe(false),
        );
        expect(container.textContent).toContain(
            'Updated: 1; unchanged: 0; skipped: 2; errors: 1; unprocessed: 0',
        );
        expect(container.textContent).toContain('Article no longer exists.');
        await click('Retry errors — 1');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Updated: 1; unchanged: 1; skipped: 2; errors: 0; unprocessed: 0',
            ),
        );
        expect(batchItems(batchCalls()[1][1])).toEqual([
            { id: 'article-3', updatedAt: version },
        ]);
        expect(
            invalidations.mock.calls.map(([filters]) => filters?.queryKey?.[0]),
        ).toEqual(
            expect.arrayContaining([
                'articles',
                'clusters',
                'cluster-candidates',
                'article-cluster-candidates',
                'public-clusters',
            ]),
        );
    });

    it('keeps the completed report when refreshing fails and read-only retry never repeats writes', async () => {
        let wrote = false;
        let readFails = true;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/bulk/preview')) return preview();
            if (url.endsWith('/bulk')) {
                wrote = true;
                return results(batchItems(options));
            }
            if (wrote && readFails) throw new Error('Read failed');
            return list();
        });
        await render();
        await waitFor(ready);
        await click('Recheck — 1');
        await click('Confirm recheck — 1');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Could not refresh raw articles',
            ),
        );
        expect(container.textContent).toContain(
            'Updated: 1; unchanged: 0; skipped: 0; errors: 0',
        );
        expect(container.textContent).not.toContain('A batch request failed');
        readFails = false;
        await click('Retry loading articles');
        await waitFor(ready);
        expect(batchCalls()).toHaveLength(1);
    });

    it('reports uncertain network outcomes and leaves later batches unsent', async () => {
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/bulk/preview')) return preview(26);
            if (url.endsWith('/bulk')) throw new Error('Connection lost');
            return list();
        });
        await render();
        await waitFor(ready);
        await click('Recheck — 1');
        await click('Confirm recheck — 26');
        await waitFor(() =>
            expect(button('Retry errors — 25').disabled).toBe(false),
        );
        expect(batchCalls()).toHaveLength(1);
        expect(container.textContent).toContain('errors: 25; unprocessed: 1');
        expect(container.textContent).toContain(
            'outcome could not be confirmed',
        );
    });

    it('does not send another batch after leaving the page', async () => {
        const pending = deferred<ReturnType<typeof results>>();
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/bulk/preview')) return preview(26);
            if (url.endsWith('/bulk')) return pending.promise;
            return list();
        });
        await render();
        await waitFor(ready);
        await click('Recheck — 1');
        await click('Confirm recheck — 26');
        await act(async () => root.render(null));
        await act(async () => pending.resolve(results(preview(25).items)));
        expect(batchCalls()).toHaveLength(1);
    });

    it('refreshes the review form on open and preserves an open draft during refetch and a version conflict', async () => {
        let current = article();
        let readFails = false;
        mocks.apiClient.mockImplementation(async (_url, options) => {
            if (options?.method === 'PATCH')
                throw new Error(
                    '409: Article changed. Reopen the latest version.',
                );
            if (readFails) throw new Error('Read temporarily unavailable');
            return list([current]);
        });
        await render();
        await waitFor(ready);
        current = article('article-1', {
            title: 'Latest article title',
            updatedAt: newerVersion,
        });
        await act(async () => {
            await client.invalidateQueries({ queryKey: ['articles'] });
        });
        await waitFor(() =>
            expect(
                container.querySelector('.raw_article_card__title')
                    ?.textContent,
            ).toBe('Latest article title'),
        );
        await click('Review');
        const titleInput = document.body.querySelector<HTMLInputElement>(
            '.review_modal__fields input',
        )!;
        expect(titleInput.value).toBe('Latest article title');
        await change(titleInput, 'My unsaved title');
        expect(button('Recheck — 1').disabled).toBe(true);
        expect(select('Status').matches(':disabled')).toBe(true);
        current = article('article-1', {
            title: 'Concurrent server title',
            updatedAt: '2026-09-09T12:00:00.000Z',
        });
        await act(async () => {
            await client.invalidateQueries({ queryKey: ['articles'] });
        });
        expect(titleInput.value).toBe('My unsaved title');
        readFails = true;
        await act(async () => {
            await client.invalidateQueries({ queryKey: ['articles'] });
        });
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Could not refresh raw articles',
            ),
        );
        expect(button('Save').disabled).toBe(false);
        readFails = false;
        await click('Save');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Failed to save article' }),
            ),
        );
        const patch = mocks.apiClient.mock.calls.find(
            ([, options]) => options?.method === 'PATCH',
        );
        expect(patch?.[1]?.json).toEqual(
            expect.objectContaining({
                title: 'My unsaved title',
                expectedUpdatedAt: newerVersion,
            }),
        );
        expect(titleInput.value).toBe('My unsaved title');
        expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
        expect(button('Recheck — 1').disabled).toBe(true);
        await click('Cancel');
        await waitFor(ready);
        expect(container.textContent).toContain('Concurrent server title');
    });

    it('uses the saved version for review and sends status-only approval without overwriting stale form fields', async () => {
        await render();
        await waitFor(ready);
        await click('Review');
        await click('Save');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Article saved' }),
            ),
        );
        expect(
            postCalls().find(([url]) => url.endsWith('/review-content'))?.[1]
                ?.json,
        ).toEqual({ expectedUpdatedAt: newerVersion });
        await waitFor(ready);
        await click('Approve');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Article approved' }),
            ),
        );
        const patch = mocks.apiClient.mock.calls
            .filter(([, options]) => options?.method === 'PATCH')
            .at(-1);
        expect(JSON.parse(JSON.stringify(patch?.[1]?.json))).toEqual({
            status: 'APPROVED',
            expectedUpdatedAt: version,
        });
    });

    it('removes selections that no longer match after processing while keeping the operation report', async () => {
        let changed = false;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/bulk/preview')) return preview(1, 'APPROVE');
            if (url.endsWith('/bulk')) {
                changed = true;
                return results(batchItems(options));
            }
            return list(changed ? [] : [article()]);
        });
        await render();
        await waitFor(ready);
        await act(async () => checkbox('article-1').click());
        await act(async () =>
            container
                .querySelectorAll<HTMLInputElement>(
                    'input[name="raw-bulk-scope"]',
                )[1]
                .click(),
        );
        await click('Approve ready — 1');
        await click('Confirm approve ready — 1');
        await waitFor(() =>
            expect(container.textContent).toContain('Selected articles (0)'),
        );
        expect(container.textContent).toContain(
            'Updated: 1; unchanged: 0; skipped: 0; errors: 0',
        );
    });
});
