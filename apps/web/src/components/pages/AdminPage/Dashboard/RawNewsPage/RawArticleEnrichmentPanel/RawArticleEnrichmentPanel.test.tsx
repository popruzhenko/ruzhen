import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RawArticleEnrichmentPanel } from './RawArticleEnrichmentPanel';
import type { RawArticleEnrichmentHandle } from './TypesRawArticleEnrichmentPanel';
import type {
    ArticleContentVersion,
    EnrichmentArticleSnapshot,
    EnrichmentItem,
    EnrichmentJob,
    EnrichmentJobDetail,
    EnrichmentProposalResponse,
} from '../../../../../../entities/article-enrichment/model/types';
import { enrichmentKeys } from '../../../../../../entities/article-enrichment/hooks/useArticleEnrichment';

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
}));
vi.mock('../../../../../../shared/api/client', () => ({
    apiClient: mocks.apiClient,
}));

const base = '/admin/articles/enrichment';
const version = '2026-09-09T10:00:00.000Z';
const current: EnrichmentArticleSnapshot = {
    id: 'article-1',
    title: 'Current story',
    summary: 'Original summary.',
    content: 'My original manually saved article fragment.',
    cleanedAccessibleText: null,
    contentAvailability: 'PARTIAL_TEXT',
    status: 'REVIEWED',
    updatedAt: version,
};
const assessment = {
    version: 1,
    textHash: 'retrieved-hash',
    fullText: true,
    method: 'READABILITY' as const,
    sourceUrl: 'https://example.test/story',
    sourceDate: version,
    qualityScore: 0.92,
    reasons: ['Complete article body matched the original story.'],
};
const job = (updates: Partial<EnrichmentJob> = {}): EnrichmentJob => ({
    id: 'job-1',
    status: 'RUNNING',
    total: 2,
    counts: {
        PENDING: 1,
        RUNNING: 1,
        FULL_TEXT: 0,
        PARTIAL_TEXT: 0,
        PROPOSED: 0,
        UNCHANGED: 0,
        SKIPPED: 0,
        ERROR: 0,
        CANCELED: 0,
    },
    createdAt: version,
    updatedAt: version,
    ...updates,
});
const item = (updates: Partial<EnrichmentItem> = {}): EnrichmentItem => ({
    id: 'item-1',
    articleId: 'article-1',
    title: 'Current story',
    status: 'PROPOSED',
    reason: 'Existing manual content needs review.',
    attempts: 1,
    expectedArticleUpdatedAt: version,
    proposalStatus: 'PENDING',
    hasProposal: true,
    ...updates,
});
const detail = (
    summary = job(),
    items = [item()],
    page = 1,
): EnrichmentJobDetail => ({
    job: summary,
    items,
    pagination: { page, limit: 50, total: items.length, totalPages: 1 },
});
const proposal = (
    updates: Partial<EnrichmentProposalResponse> = {},
): EnrichmentProposalResponse => ({
    item: item(),
    currentArticle: current,
    proposal: {
        content:
            'A much more complete article retrieved from the original publisher.',
        summary: 'Retrieved summary.',
        imageUrl: null,
        sourceUrl: 'https://example.test/story',
        method: 'READABILITY',
        assessment,
    },
    ...updates,
});
const contentVersion: ArticleContentVersion = {
    id: 'version-1',
    articleId: 'article-1',
    reason: 'ENRICHMENT',
    before: {
        ...current,
        content: 'The older article text before enrichment.',
    },
    after: current,
    createdAt: version,
    afterArticleUpdatedAt: version,
};
const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
};

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let ref: ReturnType<typeof createRef<RawArticleEnrichmentHandle>>;
let locked: boolean;
let acquire: ReturnType<typeof vi.fn<() => boolean>>;
let release: ReturnType<typeof vi.fn<() => void>>;
const render = async (disabled = false, preferredJobId?: string | null) => {
    await act(async () =>
        root.render(
            <QueryClientProvider client={client}>
                <RawArticleEnrichmentPanel
                    ref={ref}
                    disabled={disabled}
                    preferredJobId={preferredJobId}
                    onAcquireInteraction={acquire}
                    onReleaseInteraction={release}
                />
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
const button = (label: string) => {
    const target = [...document.body.querySelectorAll('button')].find(
        (node) => node.textContent?.trim() === label,
    );
    expect(target, label).toBeDefined();
    return target!;
};
const click = async (label: string) => {
    await act(async () => button(label).click());
};
const posts = () =>
    mocks.apiClient.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
    );
const loadReport = () =>
    waitFor(() => {
        expect(container.textContent).toContain('Enrichment report');
        expect(
            container.querySelector('.raw_news_bulk__results'),
        ).not.toBeNull();
    });

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    locked = false;
    acquire = vi.fn(() => {
        if (locked) return false;
        locked = true;
        return true;
    });
    release = vi.fn(() => {
        locked = false;
    });
    ref = createRef<RawArticleEnrichmentHandle>();
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    mocks.apiClient.mockImplementation(async (url, options) => {
        if (url === `${base}/jobs`)
            return options?.method === 'POST'
                ? { job: job() }
                : { jobs: [job()] };
        if (url.includes('/jobs/job-1?')) return detail();
        if (url.endsWith('/proposal')) return proposal();
        if (url.endsWith('/versions'))
            return { currentArticle: current, versions: [contentVersion] };
        if (url.endsWith('/apply') || url.endsWith('/restore'))
            return { article: current, version: contentVersion };
        if (url.endsWith('/dismiss'))
            return { item: item({ proposalStatus: 'DISMISSED' }) };
        return { job: job() };
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

describe('persistent article enrichment', () => {
    it('shows a fetched job before the list refreshes and preserves a later manual selection until another Fetch', async () => {
        const automatic = job({
            id: 'automatic-job',
            status: 'COMPLETED',
            total: 3,
            counts: { ...job().counts, PENDING: 0, RUNNING: 0, FULL_TEXT: 3 },
        });
        const nextAutomatic = job({
            id: 'next-automatic-job',
            status: 'QUEUED',
            total: 4,
            counts: { ...job().counts, PENDING: 4, RUNNING: 0 },
        });
        mocks.apiClient.mockImplementation(async (url) => {
            if (url === `${base}/jobs`) return { jobs: [job()] };
            if (url.includes('/next-automatic-job?'))
                return detail(nextAutomatic, []);
            if (url.includes('/automatic-job?')) return detail(automatic, []);
            return detail();
        });
        await render();
        await loadReport();
        await render(false, automatic.id);
        await waitFor(() =>
            expect(container.textContent).toContain(
                'completed: 3 of 3 processed',
            ),
        );
        expect(
            container.querySelector('.ui-dropdown__value')?.textContent,
        ).toContain('3 articles');
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
        await waitFor(() =>
            expect(container.textContent).toContain(
                'running: 0 of 2 processed',
            ),
        );
        await render(false, automatic.id);
        expect(container.textContent).toContain('running: 0 of 2 processed');
        await render(false, nextAutomatic.id);
        await waitFor(() =>
            expect(container.textContent).toContain('queued: 0 of 4 processed'),
        );
        expect(posts()).toHaveLength(0);
        expect(acquire).not.toHaveBeenCalled();
    });

    it('continues polling an in-flight article after cancellation until its result is recorded', async () => {
        vi.useFakeTimers();
        let detailReads = 0;
        const stopping = job({
            status: 'CANCELED',
            counts: { ...job().counts, PENDING: 0, RUNNING: 1, CANCELED: 1 },
        });
        const finished = job({
            status: 'CANCELED',
            counts: {
                ...job().counts,
                PENDING: 0,
                RUNNING: 0,
                CANCELED: 1,
                FULL_TEXT: 1,
            },
        });
        mocks.apiClient.mockImplementation(async (url) => {
            if (url === `${base}/jobs`) return { jobs: [stopping] };
            detailReads++;
            return detail(detailReads === 1 ? stopping : finished, []);
        });
        await render();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10);
        });
        expect(container.textContent).toContain('canceled: 0 of 2 processed');
        expect(container.textContent).toContain('processed will finish: 1');
        expect(container.textContent).not.toContain(
            'Stop remaining enrichment',
        );
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2100);
        });
        expect(container.textContent).toContain('canceled: 1 of 2 processed');
        expect(container.textContent).toContain('Full text: 1');
        expect(container.textContent).toContain('canceled: 1.');
        expect(container.textContent).not.toContain('processed will finish');
        expect(
            container.querySelector('progress')?.getAttribute('aria-valuetext'),
        ).toBe('1 processed; 1 canceled; 0 running; 0 pending');
        expect(posts()).toHaveLength(0);
        vi.useRealTimers();
    });

    it('refreshes a completed report when another editor applies a proposal and invalidates article data', async () => {
        let summary = job({
            status: 'COMPLETED',
            counts: { ...job().counts, PENDING: 0, RUNNING: 0, PROPOSED: 2 },
        });
        mocks.apiClient.mockImplementation(async (url) =>
            url === `${base}/jobs` ? { jobs: [summary] } : detail(summary),
        );
        const invalidations = vi.spyOn(client, 'invalidateQueries');
        await render();
        await loadReport();
        summary = job({
            status: 'COMPLETED',
            counts: { ...summary.counts, FULL_TEXT: 2, PROPOSED: 0 },
        });
        await act(async () => {
            await client.invalidateQueries({ queryKey: enrichmentKeys.jobs });
        });
        await waitFor(() =>
            expect(container.textContent).toContain('Full text: 2'),
        );
        expect(
            invalidations.mock.calls.some(
                ([filters]) => filters?.queryKey?.[0] === 'articles',
            ),
        ).toBe(true);
    });

    it('recovers an active job on mount and continues observing it without launching another job', async () => {
        await render();
        await loadReport();
        expect(container.textContent).toContain('running: 0 of 2 processed');
        expect(container.textContent).toContain('Jobs continue on the server');
        expect(
            mocks.apiClient.mock.calls.some(
                ([url]) => url === `${base}/jobs/job-1?page=1&limit=50`,
            ),
        ).toBe(true);
        expect(mocks.apiClient.mock.calls[0][1]?.signal).toBeInstanceOf(
            AbortSignal,
        );
        expect(posts()).toHaveLength(0);
        await act(async () => root.render(null));
        await render();
        await loadReport();
        expect(posts()).toHaveLength(0);
        expect(acquire).not.toHaveBeenCalled();
    });

    it('starts the whole filtered scope once and does not stop server work when the page is left', async () => {
        const pending = deferred<{ job: EnrichmentJob }>();
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url === `${base}/jobs` && options?.method === 'POST')
                return pending.promise;
            return url === `${base}/jobs` ? { jobs: [] } : detail();
        });
        await render();
        await act(async () => {
            ref.current!.start({
                type: 'FILTERED',
                filters: {
                    sourceName: 'Example News',
                    contentAvailability: 'SUMMARY_ONLY',
                },
            });
            ref.current!.start({ type: 'SELECTED', ids: ['wrong-article'] });
        });
        expect(posts()).toHaveLength(1);
        expect(posts()[0][1]?.json).toEqual({
            scope: {
                type: 'FILTERED',
                filters: {
                    sourceName: 'Example News',
                    contentAvailability: 'SUMMARY_ONLY',
                },
            },
            requestId: expect.any(String),
        });
        expect(locked).toBe(true);
        await act(async () => root.render(null));
        await act(async () => pending.resolve({ job: job() }));
        expect(posts()).toHaveLength(1);
        expect(posts().some(([url]) => url.endsWith('/stop'))).toBe(false);
    });

    it('reuses the request identity after a failed start and keeps the selected IDs frozen', async () => {
        let attempts = 0;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url === `${base}/jobs` && options?.method === 'POST') {
                attempts++;
                if (attempts === 1)
                    throw new Error('Connection interrupted after request');
                return { job: job() };
            }
            return url === `${base}/jobs` ? { jobs: [] } : detail();
        });
        await render();
        await act(async () =>
            ref.current!.start({
                type: 'SELECTED',
                ids: ['article-7', 'article-8'],
            }),
        );
        await waitFor(() =>
            expect(button('Retry starting enrichment').disabled).toBe(false),
        );
        const original = posts()[0][1]?.json;
        await click('Retry starting enrichment');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Enrichment started for 2 articles',
            ),
        );
        expect(posts()[1][1]?.json).toEqual(original);
        expect(original).toEqual({
            scope: { type: 'SELECTED', ids: ['article-7', 'article-8'] },
            requestId: expect.any(String),
        });
    });

    it('stops only remaining work and retries server error items without recreating the job', async () => {
        let summary = job();
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/stop')) {
                summary = job({
                    status: 'CANCELED',
                    counts: {
                        ...job().counts,
                        PENDING: 0,
                        RUNNING: 0,
                        CANCELED: 1,
                        ERROR: 1,
                    },
                });
                return { job: summary };
            }
            if (url.endsWith('/retry-errors')) {
                summary = job({ total: 2 });
                return { job: summary };
            }
            if (url === `${base}/jobs`) return { jobs: [summary] };
            return detail(summary);
        });
        await render();
        await loadReport();
        await click('Stop remaining enrichment');
        await waitFor(() =>
            expect(button('Retry enrichment errors — 1').disabled).toBe(false),
        );
        expect(container.textContent).not.toContain(
            'Articles already being processed will finish',
        );
        expect(container.textContent).toContain('canceled: 1 of 2 processed');
        await click('Retry enrichment errors — 1');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Error items queued for another attempt',
            ),
        );
        expect(posts().map(([url]) => url)).toEqual([
            `${base}/jobs/job-1/stop`,
            `${base}/jobs/job-1/retry-errors`,
        ]);
        summary = job({
            status: 'COMPLETED',
            counts: {
                ...job().counts,
                PENDING: 0,
                RUNNING: 0,
                FULL_TEXT: 1,
                CANCELED: 1,
            },
        });
        await act(async () => {
            await client.invalidateQueries({ queryKey: enrichmentKeys.jobs });
        });
        await waitFor(() => {
            expect(container.textContent).toContain(
                'completed: 1 of 2 processed',
            );
            expect(container.textContent).not.toContain(
                'Error items queued for another attempt',
            );
        });
    });

    it('clears an action notice when switching jobs and derives stopping state from the selected job', async () => {
        const stopping = job({
            status: 'CANCELED',
            counts: { ...job().counts, PENDING: 0, RUNNING: 1, CANCELED: 1 },
        });
        const previous = job({
            id: 'job-2',
            status: 'COMPLETED',
            total: 3,
            counts: { ...job().counts, PENDING: 0, RUNNING: 0, FULL_TEXT: 3 },
        });
        let current = job();
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url === `${base}/jobs`)
                return options?.method === 'POST'
                    ? { job: current }
                    : { jobs: [current, previous] };
            return detail(url.includes('/job-2?') ? previous : current, []);
        });
        await render();
        await loadReport();
        await act(async () =>
            ref.current!.start({
                type: 'SELECTED',
                ids: ['article-1', 'article-2'],
            }),
        );
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Enrichment started for 2 articles',
            ),
        );
        const selectJob = async (option: number) => {
            await act(async () =>
                container
                    .querySelector<HTMLButtonElement>(
                        '[aria-haspopup="listbox"]',
                    )!
                    .click(),
            );
            await act(async () =>
                container
                    .querySelectorAll<HTMLElement>('[role="option"]')
                    [option].click(),
            );
        };
        await selectJob(1);
        await waitFor(() =>
            expect(container.textContent).toContain(
                'completed: 3 of 3 processed',
            ),
        );
        expect(container.textContent).not.toContain('Enrichment started');
        current = stopping;
        await selectJob(0);
        await waitFor(() =>
            expect(container.textContent).toContain('processed will finish: 1'),
        );
        expect(container.textContent).not.toContain('Enrichment started');
        await selectJob(1);
        await waitFor(() =>
            expect(container.textContent).toContain(
                'completed: 3 of 3 processed',
            ),
        );
        expect(container.textContent).not.toContain('processed will finish');
    });

    it('compares retrieved and saved text, applies only after an explicit click, and preserves success if refresh fails', async () => {
        let applied = false;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (url.endsWith('/apply')) {
                applied = true;
                return { article: current, version: contentVersion };
            }
            if (applied && !options?.method)
                throw new Error('Read unavailable');
            if (url === `${base}/jobs`) return { jobs: [job()] };
            if (url.endsWith('/proposal')) return proposal();
            return detail();
        });
        await render();
        await loadReport();
        await click('Compare proposal');
        await waitFor(() =>
            expect(button('Apply proposed content').disabled).toBe(false),
        );
        expect(document.body.textContent).toContain(
            'My original manually saved article fragment.',
        );
        expect(document.body.textContent).toContain(
            'A much more complete article retrieved',
        );
        expect(
            document.body.querySelector(
                '.raw_enrichment__comparison section:nth-child(2)',
            )?.textContent,
        ).toContain('Original summary.');
        expect(posts()).toHaveLength(0);
        expect(locked).toBe(true);
        await click('Apply proposed content');
        await waitFor(() =>
            expect(container.textContent).toContain('Proposed content applied'),
        );
        expect(posts()[0]).toEqual([
            `${base}/items/item-1/apply`,
            { method: 'POST', json: { expectedUpdatedAt: version } },
        ]);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await waitFor(() => expect(locked).toBe(false));
        expect(container.textContent).toContain(
            'Could not refresh enrichment progress',
        );
    });

    it('retains a comparison on a conflict and allows dismissing the proposal without applying it', async () => {
        mocks.apiClient.mockImplementation(async (url) => {
            if (url.endsWith('/apply'))
                throw new Error('409: The article changed after comparison.');
            if (url.endsWith('/dismiss'))
                return { item: item({ proposalStatus: 'DISMISSED' }) };
            if (url === `${base}/jobs`) return { jobs: [job()] };
            if (url.endsWith('/proposal')) return proposal();
            return detail();
        });
        await render();
        await loadReport();
        await click('Compare proposal');
        await waitFor(() =>
            expect(button('Apply proposed content').disabled).toBe(false),
        );
        await click('Apply proposed content');
        await waitFor(() =>
            expect(document.body.textContent).toContain(
                '409: The article changed',
            ),
        );
        expect(document.querySelector('[role="dialog"]')).not.toBeNull();
        expect(locked).toBe(true);
        await waitFor(() =>
            expect(button('Keep current content').disabled).toBe(false),
        );
        await click('Keep current content');
        await waitFor(() =>
            expect(container.textContent).toContain('Proposal dismissed'),
        );
        expect(posts().map(([url]) => url)).toEqual([
            `${base}/items/item-1/apply`,
            `${base}/items/item-1/dismiss`,
        ]);
    });

    it('loads fresh history and restores the content before a change using the current server version', async () => {
        await render();
        await loadReport();
        await act(async () =>
            ref.current!.openHistory('article-1', '2020-01-01T00:00:00.000Z'),
        );
        await waitFor(() =>
            expect(button('Compare earlier content')).toBeDefined(),
        );
        expect(posts()).toHaveLength(0);
        await click('Compare earlier content');
        expect(document.body.textContent).toContain(
            'The older article text before enrichment.',
        );
        expect(document.body.textContent).toContain(
            'My original manually saved article fragment.',
        );
        await click('Restore content before this change');
        await waitFor(() =>
            expect(container.textContent).toContain('Earlier content restored'),
        );
        expect(posts()[0]).toEqual([
            `${base}/versions/version-1/restore`,
            { method: 'POST', json: { expectedUpdatedAt: version } },
        ]);
    });

    it('does not launch or open a comparison while an article editor owns the page lock', async () => {
        await render(true);
        await loadReport();
        await act(async () => {
            ref.current!.start({ type: 'FILTERED', filters: {} });
            ref.current!.openHistory('article-1', version);
        });
        expect(acquire).not.toHaveBeenCalled();
        expect(posts()).toHaveLength(0);
        expect(button('Compare proposal').disabled).toBe(true);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });
});
