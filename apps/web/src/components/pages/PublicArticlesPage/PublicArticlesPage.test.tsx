import { act, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
    GetPublicClustersResponse,
    PublicClusterListItem,
} from '../../../entities/public-clusters';
import { PublicArticlesPage } from './PublicArticlesPage';
import { UserPage } from '../UserPage/UserPage';
import { PublicArticlesPreviewPage } from '../AdminPage/Dashboard/PublicArticlesPreviewPage/PublicArticlesPreviewPage';

const { apiClient } = vi.hoisted(() => ({
    apiClient:
        vi.fn<
            (
                endpoint: string,
                options?: { signal?: AbortSignal },
            ) => Promise<GetPublicClustersResponse>
        >(),
}));

vi.mock('../../../shared/api/client', () => ({ apiClient }));

vi.mock('../../layouts/ReadableLayout/ReadableLayout', () => ({
    ReadableLayout: ({ children }: { children: ReactNode }) => (
        <main>{children}</main>
    ),
}));

vi.mock('../../layouts/UserLayout/UserLayout', () => ({
    UserLayout: ({ children }: { children: ReactNode }) => (
        <main>{children}</main>
    ),
}));

vi.mock('../../ui/Icon/Icon', () => ({ Icon: () => null }));

vi.mock('../../ui/DropDown/DropDown', () => ({
    DropDown: ({
        label,
        value,
        options,
        onChange,
    }: {
        label: string;
        value: string;
        options: { value: string; label: string }[];
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

vi.mock('./PublicArticleCard/PublicArticleCard', () => ({
    PublicArticleCard: ({
        article,
        detailsBasePath = '/articles',
    }: {
        article: PublicClusterListItem;
        detailsBasePath?: string;
    }) => (
        <article data-article={article.id}>
            <a href={`${detailsBasePath}/${article.humanId}`}>
                {article.title}
            </a>
        </article>
    ),
}));

const serverArticle: PublicClusterListItem = {
    id: 'server-result',
    humanId: 'NEWS-42',
    title: 'Result selected by the server',
    summary: null,
    mainCountry: null,
    startDate: null,
    publishedAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    blocks: [],
    _count: { articleLinks: 1, blocks: 0 },
};

const paramsFor = (endpoint: string) =>
    new URL(endpoint, 'https://test.invalid').searchParams;

const responseFor = (
    endpoint: string,
    items = [serverArticle],
    total = 21,
    totalPublished = 42,
): GetPublicClustersResponse => {
    const page = Number(paramsFor(endpoint).get('page'));
    const totalPages = Math.ceil(total / 10);

    return {
        items,
        pagination: {
            page,
            limit: 10,
            total,
            totalPublished,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        },
    };
};

const deferred = <T,>() => {
    let resolve!: (result: T) => void;
    const promise = new Promise<T>((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const Location = () => <output data-location>{useLocation().search}</output>;

const renderPage = async (Page: ComponentType, initialPage = 1) => {
    await act(async () =>
        root.render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter
                    initialEntries={[`/?page=${initialPage}&preserve=yes`]}
                >
                    <Page />
                    <Location />
                </MemoryRouter>
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

const searchInput = () => container.querySelector<HTMLInputElement>('input')!;

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

const setSearch = async (value: string) => {
    await act(async () => {
        const input = searchInput();
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

const select = async (label: string, value: string) => {
    await act(async () => {
        const element = container.querySelector<HTMLSelectElement>(
            `select[aria-label="${label}"]`,
        )!;
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
    });
};

const latestParams = () => paramsFor(apiClient.mock.calls.at(-1)![0]);

const expectLoaded = () => {
    expect(
        container.querySelector('[data-article="server-result"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain('Found 21 of 42 articles');
};

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    apiClient.mockImplementation(async (endpoint) => responseFor(endpoint));
    queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe.each([
    { name: 'public feed', Page: PublicArticlesPage, detailsPath: '/articles' },
    { name: 'user feed', Page: UserPage, detailsPath: '/user/articles' },
    {
        name: 'admin preview',
        Page: PublicArticlesPreviewPage,
        detailsPath: '/admin/public-articles',
    },
])('$name', ({ Page, detailsPath }) => {
    it('uses server filters and totals, resets pagination, and keeps filters after no matches', async () => {
        await renderPage(Page, 3);
        await waitFor(expectLoaded);
        expect(latestParams().get('page')).toBe('3');
        expect(
            container.querySelector('[data-article] a')?.getAttribute('href'),
        ).toBe(`${detailsPath}/NEWS-42`);

        await select('Source count', 'GTE_3');
        await waitFor(expectLoaded);
        expect(latestParams().get('minSources')).toBe('3');
        expect(latestParams().get('page')).toBe('1');
        await click('2');
        await waitFor(() => {
            expectLoaded();
            expect(latestParams().get('page')).toBe('2');
        });
        expect(latestParams().get('minSources')).toBe('3');

        await select('Block type', 'WITH_OPINIONS');
        await waitFor(expectLoaded);
        expect(latestParams().get('page')).toBe('1');
        expect(latestParams().get('blockType')).toBe('OPINION');
        await select('Published date', 'LAST_7_DAYS');
        await waitFor(expectLoaded);
        expect(latestParams().has('publishedFrom')).toBe(true);
        await select('Sort', 'TITLE_ASC');
        await waitFor(expectLoaded);
        expect(latestParams().get('sort')).toBe('TITLE_ASC');

        // The article's title/blocks/source count deliberately do not match these
        // filters: the page must trust server results without filtering them again.
        await setSearch('source & archive');
        await waitFor(expectLoaded);
        expect(latestParams().get('search')).toBe('source & archive');
        expect(latestParams().get('page')).toBe('1');
        const queryKeys = queryClient
            .getQueryCache()
            .getAll()
            .map((query) => query.queryHash);
        expect(new Set(queryKeys).size).toBeGreaterThanOrEqual(7);

        apiClient.mockImplementation(async (endpoint) =>
            paramsFor(endpoint).get('search') === 'no match'
                ? responseFor(endpoint, [], 0)
                : responseFor(endpoint),
        );
        await setSearch('no match');
        await waitFor(() =>
            expect(container.textContent).toContain(
                'No articles match filters',
            ),
        );
        expect(container.textContent).toContain('Found 0 of 42 articles');
        expect(searchInput().value).toBe('no match');
        await click('Clear filters');
        await waitFor(expectLoaded);
        expect(searchInput().value).toBe('');
        expect(latestParams().get('page')).toBe('1');
        expect(latestParams().has('search')).toBe(false);
        expect(latestParams().has('minSources')).toBe(false);
        expect(
            container.querySelector('[data-location]')?.textContent,
        ).toContain('preserve=yes');
    });
});

it('keeps the search input focused across pending requests and ignores cancelled responses', async () => {
    await renderPage(PublicArticlesPage);
    await waitFor(expectLoaded);
    const first = deferred<GetPublicClustersResponse>();
    const second = deferred<GetPublicClustersResponse>();
    apiClient.mockImplementation((endpoint) => {
        return paramsFor(endpoint).get('search') === 'first'
            ? first.promise
            : second.promise;
    });

    const input = searchInput();
    input.focus();
    await setSearch('first');
    expect(searchInput()).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(container.textContent).toContain('Loading published articles');
    const firstSignal = apiClient.mock.calls.at(-1)![1]?.signal;
    await setSearch('second');
    expect(firstSignal?.aborted).toBe(true);
    expect(searchInput()).toBe(input);
    expect(document.activeElement).toBe(input);

    await act(async () =>
        first.resolve(
            responseFor('/?page=1', [{ ...serverArticle, id: 'stale-result' }]),
        ),
    );
    expect(container.querySelector('[data-article="stale-result"]')).toBeNull();
    await act(async () => second.resolve(responseFor('/?page=1')));
    await waitFor(expectLoaded);
    expect(searchInput()).toBe(input);
    expect(document.activeElement).toBe(input);
});

it('keeps filters usable after a failed request for both retry and clear', async () => {
    await renderPage(PublicArticlesPage);
    await waitFor(expectLoaded);
    let fail = true;
    apiClient.mockImplementation(async (endpoint) => {
        if (fail && paramsFor(endpoint).has('search'))
            throw new Error('Request failed');
        return responseFor(endpoint);
    });
    await setSearch('failing search');
    await waitFor(() =>
        expect(container.textContent).toContain(
            'Failed to load published articles',
        ),
    );
    expect(searchInput().value).toBe('failing search');

    fail = false;
    await click('Retry');
    await waitFor(expectLoaded);
    expect(latestParams().get('search')).toBe('failing search');

    fail = true;
    await setSearch('another failure');
    await waitFor(() =>
        expect(container.textContent).toContain(
            'Failed to load published articles',
        ),
    );
    await click('Clear');
    await waitFor(expectLoaded);
    expect(searchInput().value).toBe('');
    expect(latestParams().has('search')).toBe(false);
});

it('shows unknown counters while loading and retains filters with no publications', async () => {
    const loading = deferred<GetPublicClustersResponse>();
    apiClient.mockReturnValue(loading.promise);
    await renderPage(PublicArticlesPage);
    expect(searchInput()).not.toBeNull();
    expect(container.textContent).toContain('Found — of — articles');
    expect(container.textContent).toContain('— published materials');

    await act(async () => loading.resolve(responseFor('/?page=1', [], 0, 0)));
    await waitFor(() =>
        expect(container.textContent).toContain('No published articles yet'),
    );
    expect(searchInput()).not.toBeNull();
    expect(container.textContent).toContain('Found 0 of 0 articles');
    expect(container.textContent).toContain('0 published materials');
});
