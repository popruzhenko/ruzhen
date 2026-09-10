import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    ArticleClusterCandidate,
    ArticleClusterCandidatesResponse,
} from '../../../../../../entities/article-cluster-candidate';
import { ExistingClusterSuggestions } from './ExistingClusterSuggestions';
import type { ExistingClusterSuggestionsProps } from './TypesExistingClusterSuggestions';

const mocks = vi.hoisted(() => ({
    apiClient:
        vi.fn<
            (
                endpoint: string,
                options?: { method?: string; signal?: AbortSignal },
            ) => Promise<unknown>
        >(),
    showToast: vi.fn(),
}));

vi.mock('../../../../../../shared/api/client', () => ({
    apiClient: mocks.apiClient,
}));
vi.mock('../../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

const candidate: ArticleClusterCandidate = {
    id: 'suggestion-1',
    score: 0.87,
    status: 'PENDING',
    createdAt: '2026-09-10T12:00:00.000Z',
    article: {
        id: 'article-1',
        title: 'A new development',
        summary: null,
        publishedAt: '2026-09-10T12:00:00.000Z',
        createdAt: '2026-09-10T12:00:00.000Z',
        source: { id: 'source-1', name: 'Example News' },
    },
    cluster: {
        id: 'target-cluster',
        humanId: 'NEWS-42',
        title: 'The existing story',
        status: 'PUBLISHED',
        _count: { articleLinks: 3 },
    },
};

const endpoint = '/admin/article-cluster-candidates';
const listResponse = (
    candidates = [candidate],
    page = 1,
    total = candidates.length,
): ArticleClusterCandidatesResponse => ({
    candidates,
    pagination: {
        page,
        limit: 10,
        total,
        totalPages: Math.ceil(total / 10),
        hasNextPage: page < Math.ceil(total / 10),
        hasPreviousPage: page > 1,
    },
});

const generated = {
    message: 'Generated',
    meta: {
        articlesChecked: 5,
        clustersChecked: 3,
        candidatesCreated: 1,
        similarityThreshold: 0.75,
        timeWindowHours: 72,
    },
};

const accepted = {
    message: 'Attached',
    cluster: { ...candidate.cluster, status: 'UPDATED' },
};
const rejected = {
    message: 'Rejected',
    candidate: { id: candidate.id, status: 'REJECTED' },
};

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
let props: ExistingClusterSuggestionsProps;

const render = async (
    updates: Partial<ExistingClusterSuggestionsProps> = {},
) => {
    props = { ...props, ...updates };
    await act(async () =>
        root.render(
            <QueryClientProvider client={client}>
                <ExistingClusterSuggestions {...props} />
            </QueryClientProvider>,
        ),
    );
};

const waitFor = async (assertion: () => void) => {
    await vi.waitFor(async () => {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        assertion();
    });
};

const button = (label: string) => {
    const target = Array.from(container.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === label,
    );
    expect(target, `Expected button ${label}`).toBeDefined();
    return target!;
};

const click = async (label: string) => {
    await act(async () => button(label).click());
};

const postCalls = () =>
    mocks.apiClient.mock.calls.filter(
        ([, options]) => options?.method === 'POST',
    );
const getCalls = () =>
    mocks.apiClient.mock.calls.filter(([, options]) => !options?.method);
const expectCandidate = () =>
    expect(container.textContent).toContain('A new development');

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    props = {
        disabled: false,
        hasUnsavedChanges: false,
        dataRevision: '1:1:1',
        onBusyChange: vi.fn(),
        onOpenCluster: vi.fn(),
    };
    mocks.apiClient.mockImplementation(async (url, options) => {
        if (options?.method !== 'POST') return listResponse();
        if (url.endsWith('/generate')) return generated;
        if (url.endsWith('/accept')) return accepted;
        return rejected;
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
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('article suggestions for existing clusters', () => {
    it('explains empty results and generates reviewable article-to-cluster suggestions', async () => {
        let wasGenerated = false;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (options?.method === 'POST' && url.endsWith('/generate')) {
                wasGenerated = true;
                return generated;
            }
            return listResponse(wasGenerated ? [candidate] : []);
        });
        await render();
        await waitFor(() =>
            expect(container.textContent).toContain('No matching suggestions'),
        );
        expect(container.textContent).toContain(
            'Articles need embeddings first',
        );
        expect(getCalls()[0][0]).toBe(`${endpoint}?page=1&limit=10`);
        await click('Generate suggestions');
        await waitFor(expectCandidate);
        expect(container.textContent).toContain('The existing story');
        expect(container.textContent).toContain('Example News');
        expect(container.textContent).toContain('Similarity: 87.0%');
        expect(container.textContent).toContain('PUBLISHED');
        expect(container.textContent).toContain('editorial review');
        expect(postCalls().map(([url]) => url)).toEqual([
            `${endpoint}/generate`,
        ]);
        await click('Open cluster');
        expect(props.onOpenCluster).toHaveBeenCalledWith('target-cluster');
        expect(props.onBusyChange).toHaveBeenNthCalledWith(1, true);
        expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it('attaches the chosen suggestion once and locks actions until all refreshes finish', async () => {
        const attaching = deferred<typeof accepted>();
        const refreshing = deferred<ArticleClusterCandidatesResponse>();
        let attachmentStarted = false;
        mocks.apiClient.mockImplementation((url, options) => {
            if (options?.method === 'POST' && url.endsWith('/accept')) {
                attachmentStarted = true;
                return attaching.promise;
            }
            return attachmentStarted
                ? refreshing.promise
                : Promise.resolve(listResponse());
        });
        const invalidations = vi.spyOn(client, 'invalidateQueries');
        await render();
        await waitFor(expectCandidate);
        const attach = button('Attach article');
        await act(async () => {
            attach.click();
            attach.click();
        });
        expect(postCalls().map(([url]) => url)).toEqual([
            `${endpoint}/suggestion-1/accept`,
        ]);
        expect(button('Generate suggestions').disabled).toBe(true);
        expect(button('Reject').disabled).toBe(true);
        expect(button('Open cluster').disabled).toBe(true);
        await click('Open cluster');
        expect(props.onOpenCluster).not.toHaveBeenCalled();
        expect(props.onBusyChange).toHaveBeenLastCalledWith(true);

        await act(async () => attaching.resolve(accepted));
        expect(props.onBusyChange).toHaveBeenLastCalledWith(true);
        expect(button('Generate suggestions').disabled).toBe(true);
        await act(async () => refreshing.resolve(listResponse([])));
        await waitFor(() =>
            expect(props.onBusyChange).toHaveBeenLastCalledWith(false),
        );
        expect(
            invalidations.mock.calls.map(([filters]) => filters?.queryKey?.[0]),
        ).toEqual(
            expect.arrayContaining([
                'articles',
                'clusters',
                'public-clusters',
                'cluster-candidates',
                'article-cluster-candidates',
            ]),
        );
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Article attached',
                message: expect.stringContaining(
                    'Review the updated cluster before publishing',
                ),
            }),
        );
    });

    it('protects an unsaved draft while allowing generation, opening, and rejection', async () => {
        await render({ hasUnsavedChanges: true });
        await waitFor(expectCandidate);
        expect(container.textContent).toContain(
            'Save or discard your cluster draft before attaching an article',
        );
        expect(button('Attach article').disabled).toBe(true);
        await click('Attach article');
        expect(postCalls()).toHaveLength(0);
        await click('Open cluster');
        expect(props.onOpenCluster).toHaveBeenCalledWith('target-cluster');
        await click('Generate suggestions');
        await waitFor(() =>
            expect(props.onBusyChange).toHaveBeenLastCalledWith(false),
        );
        await click('Reject');
        await waitFor(() =>
            expect(mocks.showToast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'Suggestion rejected' }),
            ),
        );
        expect(postCalls().map(([url]) => url)).toEqual([
            `${endpoint}/generate`,
            `${endpoint}/suggestion-1/reject`,
        ]);

        await render({ disabled: true, hasUnsavedChanges: false });
        expect(button('Attach article').disabled).toBe(true);
        expect(button('Reject').disabled).toBe(true);
        expect(button('Generate suggestions').disabled).toBe(true);
    });

    it('refreshes stale suggestions after a rejected attach request', async () => {
        let stale = false;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (options?.method === 'POST' && url.endsWith('/accept')) {
                stale = true;
                throw new Error('This suggestion is no longer available');
            }
            return listResponse(stale ? [] : [candidate]);
        });
        await render();
        await waitFor(expectCandidate);
        await click('Attach article');
        await waitFor(() =>
            expect(container.textContent).toContain('No matching suggestions'),
        );
        expect(getCalls()).toHaveLength(2);
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Could not attach article' }),
        );
        expect(props.onBusyChange).toHaveBeenLastCalledWith(false);
    });

    it('reports successful attachment even if refreshing the list fails and offers a read-only retry', async () => {
        let attached = false;
        let refreshFails = true;
        mocks.apiClient.mockImplementation(async (url, options) => {
            if (options?.method === 'POST' && url.endsWith('/accept')) {
                attached = true;
                return accepted;
            }
            if (attached && refreshFails) throw new Error('Refresh failed');
            return listResponse(attached ? [] : [candidate]);
        });
        await render();
        await waitFor(expectCandidate);
        await click('Attach article');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'Could not refresh suggestions',
            ),
        );
        expect(mocks.showToast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Article attached' }),
        );
        expect(mocks.showToast).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Could not attach article' }),
        );
        refreshFails = false;
        await click('Retry suggestions');
        await waitFor(() =>
            expect(container.textContent).toContain('No matching suggestions'),
        );
        expect(postCalls()).toHaveLength(1);
    });

    it('paginates on the server and refreshes when source data changes without sending the revision', async () => {
        mocks.apiClient.mockImplementation(async (url) => {
            const page = Number(
                new URL(url, 'https://test.invalid').searchParams.get('page'),
            );
            return listResponse(
                [
                    {
                        ...candidate,
                        article: {
                            ...candidate.article,
                            title: `Page ${page} article`,
                        },
                    },
                ],
                page,
                11,
            );
        });
        await render();
        await waitFor(() =>
            expect(container.textContent).toContain('Page 1 article'),
        );
        await click('2');
        await waitFor(() =>
            expect(container.textContent).toContain('Page 2 article'),
        );
        expect(getCalls().at(-1)![0]).toBe(`${endpoint}?page=2&limit=10`);
        await render({ dataRevision: '2:3:4' });
        await waitFor(() => expect(getCalls()).toHaveLength(3));
        expect(getCalls().at(-1)![0]).toBe(`${endpoint}?page=2&limit=10`);
        await waitFor(() =>
            expect(container.textContent).toContain('Page 2 article'),
        );
        await click('Hide suggestions');
        expect(container.textContent).not.toContain('Page 2 article');
        expect(container.textContent).toContain('11 suggestion(s)');
        await click('Show suggestions');
        expect(container.textContent).toContain('Page 2 article');
    });
});
