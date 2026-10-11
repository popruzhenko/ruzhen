import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleApiItem } from '../../../../../entities/raw-news/model/types';
import type { ClusterDetailsApiItem } from '../../../../../entities/cluster/model/types';
import type { ClusterCandidate } from '../../../../../entities/cluster-candidate/model/types';
import { ToastProvider } from '../../../../ui/Toast/ToastProvider';
import { ClusteringPage } from './ClusteringPage';

type Options = RequestInit & { json?: unknown };
const { apiClient } = vi.hoisted(() => ({
    apiClient:
        vi.fn<(endpoint: string, options?: Options) => Promise<unknown>>(),
}));
vi.mock('../../../../../shared/api/client', () => ({ apiClient }));

const createdAt = '2026-10-04T10:00:00Z';
const makeArticle = (
    id: string,
    overrides: Partial<ArticleApiItem> = {},
): ArticleApiItem => ({
    id,
    title: `Report ${id}`,
    sourceId: 'desk',
    url: `https://news.example/${id}`,
    summary: null,
    content: null,
    imageUrl: null,
    publishedAt: createdAt,
    language: 'en',
    country: 'BE',
    status: 'EMBEDDED',
    createdAt,
    updatedAt: createdAt,
    contentAvailability: null,
    cleanedAccessibleText: null,
    cleaningMethod: null,
    embeddingBasis: null,
    embeddingModel: null,
    embedding: [1, 0],
    source: { id: 'desk', name: 'News desk', baseUrl: 'https://news.example' },
    raw: null,
    _count: { clusterLinks: 0, clusterCandidates: 0 },
    ...overrides,
});

const makeCluster = (
    id: string,
    title: string,
    members: ArticleApiItem[],
): ClusterDetailsApiItem => ({
    id,
    humanId: `RZH-${id}`,
    title,
    summary: null,
    mainCountry: null,
    startDate: members[0]?.publishedAt ?? null,
    status: 'DRAFT',
    publishedAt: null,
    createdAt,
    updatedAt: createdAt,
    createdByUserId: 'editor',
    createdBy: { id: 'editor', email: 'editor@example.com', role: 'ADMIN' },
    blocks: [],
    tags: [],
    articles: members.map((article, index) => ({
        id: article.id,
        title: article.title!,
        summary: article.summary,
        url: article.url,
        publishedAt: article.publishedAt,
        country: article.country,
        embedding: article.embedding,
        confidence: 0.1,
        method: 'MANUAL',
        isPrimary: index === 0,
        addedAt: createdAt,
        source: {
            id: 'desk',
            name: 'News desk',
            baseUrl: 'https://news.example',
        },
    })),
});

const makeCandidate = (member: ArticleApiItem): ClusterCandidate => ({
    id: 'proposal',
    title: 'Algorithmic river candidate',
    summary: 'Suggested grouping',
    status: 'PENDING',
    algorithm: 'cosine',
    similarityThreshold: 0.75,
    timeWindowDays: 7,
    minClusterSize: 1,
    maxClusterSize: 10,
    articlesCount: 1,
    averageSimilarity: 0.9,
    startDate: createdAt,
    endDate: createdAt,
    createdAt,
    updatedAt: createdAt,
    articles: [
        {
            articleId: member.id,
            confidence: 0.9,
            isPrimary: true,
            position: 0,
            article: {
                id: member.id,
                title: member.title!,
                summary: member.summary,
                publishedAt: member.publishedAt,
                createdAt: member.createdAt,
                embedding: member.embedding,
                source: member.source,
            },
        },
    ],
});

let articles: ArticleApiItem[];
let clusters: ClusterDetailsApiItem[];
let proposals: ClusterCandidate[];
let client: QueryClient;
let mutations: Map<string, (options: Options) => Promise<unknown>>;

beforeEach(() => {
    apiClient.mockReset();
    articles = [
        makeArticle('original', {
            title: 'Original river report',
            status: 'CLUSTERED',
        }),
        makeArticle('orthogonal', {
            title: 'Orthogonal analysis',
            embedding: [0, 1],
        }),
        makeArticle('unembedded', {
            title: 'Awaiting embedding',
            status: 'APPROVED',
            embedding: null,
        }),
        makeArticle('proposed', { title: 'Algorithmic member' }),
    ];
    clusters = [makeCluster('saved', 'Existing river cluster', [articles[0]])];
    proposals = [makeCandidate(articles[3])];
    mutations = new Map();
    client = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    });
    apiClient.mockImplementation(async (endpoint, options = {}) => {
        const method = options.method ?? 'GET';
        if (method !== 'GET') {
            const mutation = mutations.get(`${method} ${endpoint}`);
            if (!mutation)
                throw new Error(`Unexpected mutation: ${method} ${endpoint}`);
            return mutation(options);
        }
        if (endpoint === '/articles') return { articles };
        if (endpoint.startsWith('/admin/clusters?'))
            return {
                clusters: clusters.map((cluster) => ({
                    ...cluster,
                    averageSimilarity: 0.9,
                    clusterTags: [],
                    _count: {
                        blocks: cluster.blocks.length,
                        articleLinks: cluster.articles.length,
                    },
                })),
            };
        if (endpoint === '/admin/cluster-candidates')
            return { candidates: proposals };
        if (endpoint.startsWith('/admin/article-cluster-candidates?'))
            return {
                candidates: [],
                pagination: {
                    page: 1,
                    limit: 10,
                    total: 0,
                    totalPages: 0,
                    hasNextPage: false,
                    hasPreviousPage: false,
                },
            };
        const detail = clusters.find(
            (cluster) => endpoint === `/admin/clusters/${cluster.id}`,
        );
        if (detail) return detail;
        throw new Error(`Unexpected query: ${endpoint}`);
    });
});

afterEach(() => client.clear());

const mountPage = () =>
    render(
        <QueryClientProvider client={client}>
            <ToastProvider>
                <ClusteringPage />
            </ToastProvider>
        </QueryClientProvider>,
    );

const renderPage = async () => {
    mountPage();
    await screen.findByRole('heading', { name: 'Cluster actions' });
    return userEvent.setup();
};

const articlePanel = () =>
    within(
        screen
            .getByRole('heading', { name: 'Candidate Articles' })
            .closest('section')!,
    );
const selectedPanel = () =>
    within(
        document.querySelector('.clustering__selected-cluster') as HTMLElement,
    );
const clusterPanel = () => within(screen.getByRole('complementary'));
const calls = (method: string, endpoint: string) =>
    apiClient.mock.calls.filter(
        ([url, options]) =>
            url === endpoint && (options?.method ?? 'GET') === method,
    );

const selectFilter = async (
    user: ReturnType<typeof userEvent.setup>,
    panel: ReturnType<typeof within>,
    label: string,
    option: string,
) => {
    await user.click(
        panel.getByRole('button', { name: new RegExp(`^${label}\\b`) }),
    );
    await user.click(panel.getByRole('option', { name: option }));
};

describe('ClusteringPage workflows with real cards and filters', () => {
    it('shows initial loading until articles arrive without repeatedly rendering the empty feed', async () => {
        const backend = apiClient.getMockImplementation()!;
        let resolveArticles!: (value: { articles: ArticleApiItem[] }) => void;
        const response = new Promise<{ articles: ArticleApiItem[] }>(
            (resolve) => {
                resolveArticles = resolve;
            },
        );
        apiClient.mockImplementation((endpoint, options) =>
            endpoint === '/articles' ? response : backend(endpoint, options),
        );
        mountPage();
        expect(
            screen.getByRole('heading', { name: 'Loading clustering data' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('heading', { name: 'Candidate Articles' }),
        ).not.toBeInTheDocument();
        await act(async () => resolveArticles({ articles }));
        await screen.findByRole('heading', { name: 'Candidate Articles' });
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
        expect(calls('GET', '/articles')).toHaveLength(1);
    });

    it('retries a failed initial query and exposes the editor only when data is available', async () => {
        const backend = apiClient.getMockImplementation()!;
        let shouldFail = true;
        apiClient.mockImplementation(async (endpoint, options) => {
            if (endpoint === '/articles' && shouldFail)
                throw new Error('Feed unavailable');
            return backend(endpoint, options);
        });
        mountPage();
        await screen.findByRole('heading', {
            name: 'Failed to load clustering data',
        });
        expect(
            screen.queryByRole('button', { name: 'Add to cluster' }),
        ).not.toBeInTheDocument();
        shouldFail = false;
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByRole('heading', { name: 'Candidate Articles' });
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
        expect(calls('GET', '/articles')).toHaveLength(2);
    });

    it('creates a new cluster from embedded selected articles, preserving the draft after an error', async () => {
        let shouldFail = true;
        mutations.set('POST /admin/clusters/from-articles', async (options) => {
            if (shouldFail) throw new Error('Creation is unavailable');
            const payload = options.json as {
                articleIds: string[];
                title: string;
            };
            const created = makeCluster(
                'created',
                payload.title,
                articles.filter((item) => payload.articleIds.includes(item.id)),
            );
            clusters = [...clusters, created];
            return { cluster: created };
        });
        const user = await renderPage();
        expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Awaiting embedding/,
            }),
        ).toBeDisabled();
        await user.click(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Add to cluster' }),
        );
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
        expect(
            articlePanel().queryByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Create' }));
        expect(
            await screen.findByText('Creation is unavailable'),
        ).toBeInTheDocument();
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
        shouldFail = false;
        await user.click(screen.getByRole('button', { name: 'Create' }));
        await waitFor(() =>
            expect(
                screen.getByText('Saved cluster selected'),
            ).toBeInTheDocument(),
        );
        expect(calls('POST', '/admin/clusters/from-articles')).toHaveLength(2);
        expect(
            calls('POST', '/admin/clusters/from-articles')[1][1]?.json,
        ).toEqual({
            articleIds: ['orthogonal'],
            title: 'Orthogonal analysis',
            summary: null,
            mainCountry: null,
            startDate: createdAt,
        });
        expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
        expect(
            selectedPanel().getByRole('heading', {
                name: 'Orthogonal analysis',
            }),
        ).toBeInTheDocument();
        expect(screen.getByText('Cluster created')).toBeInTheDocument();
    });

    it('recalculates similarity after editing membership and saves the visible composition with confidence and primary metadata', async () => {
        mutations.set(
            'PATCH /admin/clusters/saved/articles',
            async (options) => {
                const payload = JSON.parse(String(options.body)) as {
                    articles: Array<{
                        articleId: string;
                        confidence: number;
                        isPrimary: boolean;
                    }>;
                };
                const cluster = makeCluster(
                    'saved',
                    'Existing river cluster',
                    articles.filter((item) =>
                        payload.articles.some(
                            (entry) => entry.articleId === item.id,
                        ),
                    ),
                );
                cluster.articles = cluster.articles.map((member) => ({
                    ...member,
                    ...payload.articles.find(
                        (entry) => entry.articleId === member.id,
                    )!,
                }));
                clusters = [cluster];
                return { cluster };
            },
        );
        const user = await renderPage();
        await user.click(
            clusterPanel().getByRole('button', {
                name: /Existing river cluster/,
            }),
        );
        await selectedPanel().findByRole('checkbox', {
            name: /Original river report/,
        });
        expect(selectedPanel().getAllByText('1.000')).toHaveLength(2);
        await user.click(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Add to cluster' }),
        );
        expect(selectedPanel().getAllByText('0.707')).toHaveLength(3);
        await user.click(screen.getByRole('button', { name: 'Save' }));
        await screen.findByText('Cluster saved');
        await waitFor(() =>
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument(),
        );
        const requests = calls('PATCH', '/admin/clusters/saved/articles');
        expect(requests).toHaveLength(1);
        const submitted = JSON.parse(String(requests[0][1]?.body));
        expect(submitted).toEqual({
            articles: [
                {
                    articleId: 'original',
                    confidence: expect.closeTo(Math.SQRT1_2, 8),
                    isPrimary: true,
                },
                {
                    articleId: 'orthogonal',
                    confidence: expect.closeTo(Math.SQRT1_2, 8),
                    isPrimary: false,
                },
            ],
        });
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Original river report/,
            }),
        ).toBeInTheDocument();
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
    });

    it('accepts an algorithmic candidate after a recoverable failure and displays the resulting saved cluster', async () => {
        let shouldFail = true;
        mutations.set(
            'POST /admin/cluster-candidates/proposal/accept',
            async () => {
                if (shouldFail)
                    throw new Error('Candidate cannot be accepted yet');
                const accepted = makeCluster(
                    'accepted',
                    'Accepted river cluster',
                    [articles[3]],
                );
                clusters = [...clusters, accepted];
                proposals = [];
                return { cluster: accepted };
            },
        );
        const user = await renderPage();
        await user.click(
            clusterPanel().getByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        );
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Algorithmic member/,
            }),
        ).toBeInTheDocument();
        await user.click(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        );
        expect(
            screen.getByRole('button', { name: 'Add to cluster' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Accept candidate' }),
        );
        expect(
            await screen.findByText('Candidate cannot be accepted yet'),
        ).toBeInTheDocument();
        expect(screen.getByText('Candidate selected')).toBeInTheDocument();
        expect(
            selectedPanel().getByRole('checkbox', {
                name: /Algorithmic member/,
            }),
        ).toBeInTheDocument();
        shouldFail = false;
        await user.click(
            screen.getByRole('button', { name: 'Accept candidate' }),
        );
        await screen.findByText('Candidate accepted');
        await selectedPanel().findByRole('heading', {
            name: 'Accepted river cluster',
        });
        expect(screen.getByText('Saved cluster selected')).toBeInTheDocument();
        expect(
            clusterPanel().queryByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        ).not.toBeInTheDocument();
        expect(
            calls('POST', '/admin/cluster-candidates/proposal/accept'),
        ).toHaveLength(2);
    });

    it('keeps the selected proposal after generation fails and resets the selection when new proposals replace it', async () => {
        let shouldFail = true;
        mutations.set('POST /admin/cluster-candidates/generate', async () => {
            if (shouldFail) throw new Error('Clustering service unavailable');
            proposals = [
                {
                    ...makeCandidate(articles[3]),
                    id: 'replacement',
                    title: 'Replacement river candidate',
                },
            ];
            return {
                candidates: proposals,
                meta: {
                    candidatesCreated: 1,
                    articlesChecked: 3,
                    clustersBuilt: 1,
                },
            };
        });
        const user = await renderPage();
        await user.click(
            clusterPanel().getByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Generate candidates' }),
        );
        expect(
            await screen.findByText('Clustering service unavailable'),
        ).toBeInTheDocument();
        expect(
            selectedPanel().getByRole('heading', {
                name: 'Algorithmic river candidate',
            }),
        ).toBeInTheDocument();
        shouldFail = false;
        await user.click(
            screen.getByRole('button', { name: 'Generate candidates' }),
        );
        await screen.findByText('Cluster candidates generated');
        expect(
            screen.getByText(
                '1 candidate cluster(s) created from 3 article(s).',
            ),
        ).toBeInTheDocument();
        expect(
            selectedPanel().getByRole('heading', { name: 'Cluster draft' }),
        ).toBeInTheDocument();
        expect(
            clusterPanel().getByRole('button', {
                name: /Replacement river candidate/,
            }),
        ).toBeInTheDocument();
        expect(
            clusterPanel().queryByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        ).not.toBeInTheDocument();
        expect(
            calls('POST', '/admin/cluster-candidates/generate'),
        ).toHaveLength(2);
    });

    it.each(['cluster', 'candidate'] as const)(
        'requires confirmation to delete a %s and permits retry after failure',
        async (kind) => {
            const endpoint =
                kind === 'cluster'
                    ? '/admin/clusters/saved'
                    : '/admin/cluster-candidates/proposal';
            let shouldFail = true;
            mutations.set(`DELETE ${endpoint}`, async () => {
                if (shouldFail) throw new Error('Deletion failed');
                if (kind === 'cluster') clusters = [];
                else proposals = [];
                return { message: 'Deleted' };
            });
            const user = await renderPage();
            await user.click(
                clusterPanel().getByRole('button', {
                    name:
                        kind === 'cluster'
                            ? /Existing river cluster/
                            : /Algorithmic river candidate/,
                }),
            );
            if (kind === 'cluster')
                await selectedPanel().findByRole('checkbox', {
                    name: /Original river report/,
                });
            const openLabel =
                kind === 'cluster' ? 'Delete' : 'Delete candidate';
            const confirmLabel =
                kind === 'cluster' ? 'Delete cluster' : 'Delete candidate';
            await user.click(screen.getByRole('button', { name: openLabel }));
            await user.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: 'Cancel',
                }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(calls('DELETE', endpoint)).toHaveLength(0);
            await user.click(screen.getByRole('button', { name: openLabel }));
            await user.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: confirmLabel,
                }),
            );
            expect(
                await screen.findByText('Deletion failed'),
            ).toBeInTheDocument();
            expect(screen.getByRole('dialog')).toBeInTheDocument();
            expect(
                screen.getByText(
                    kind === 'cluster'
                        ? 'Saved cluster selected'
                        : 'Candidate selected',
                ),
            ).toBeInTheDocument();
            shouldFail = false;
            await user.click(
                within(screen.getByRole('dialog')).getByRole('button', {
                    name: confirmLabel,
                }),
            );
            await waitFor(() =>
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
            );
            expect(
                selectedPanel().getByRole('heading', { name: 'Cluster draft' }),
            ).toBeInTheDocument();
            expect(
                clusterPanel().queryByRole('button', {
                    name:
                        kind === 'cluster'
                            ? /Existing river cluster/
                            : /Algorithmic river candidate/,
                }),
            ).not.toBeInTheDocument();
            expect(calls('DELETE', endpoint)).toHaveLength(2);
            expect(
                screen.getByText(
                    kind === 'cluster'
                        ? 'Cluster deleted'
                        : 'Candidate deleted',
                ),
            ).toBeInTheDocument();
        },
    );

    it('generates missing embeddings after an error and enables article selection when refreshed data arrives', async () => {
        let shouldFail = true;
        mutations.set('POST /admin/articles/generate-embeddings', async () => {
            if (shouldFail) throw new Error('Embedding service unavailable');
            articles = articles.map((item) =>
                item.id === 'unembedded'
                    ? { ...item, embedding: [1, 1], status: 'EMBEDDED' }
                    : item,
            );
            return { embedded: 1, skipped: 0, failed: 0, results: [] };
        });
        const user = await renderPage();
        const article = () =>
            articlePanel().getByRole('checkbox', {
                name: /Awaiting embedding/,
            });
        expect(article()).toBeDisabled();
        expect(articlePanel().getByText('Needs embedding')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Generate embeddings' }),
        );
        expect(
            await screen.findByText('Embedding service unavailable'),
        ).toBeInTheDocument();
        expect(article()).toBeDisabled();
        shouldFail = false;
        await user.click(
            screen.getByRole('button', { name: 'Generate embeddings' }),
        );
        await screen.findByText('Embeddings generated');
        expect(article()).toBeEnabled();
        await user.click(article());
        expect(
            screen.getByRole('button', { name: 'Add to cluster' }),
        ).toBeEnabled();
        expect(
            calls('POST', '/admin/articles/generate-embeddings'),
        ).toHaveLength(2);
        expect(
            calls('POST', '/admin/articles/generate-embeddings')[1][1]?.json,
        ).toEqual({ limit: 999 });
    });

    it('filters article candidates by search, source, status, embedding, selection and similarity and clears empty results', async () => {
        articles[1] = {
            ...articles[1],
            source: { id: 'other', name: 'Analysis desk', baseUrl: null },
        };
        const user = await renderPage();
        await user.type(
            articlePanel().getByRole('textbox', { name: 'Search' }),
            'analysis',
        );
        expect(articlePanel().getAllByRole('checkbox')).toHaveLength(2); // Result and selected-only control.
        expect(
            articlePanel().queryByRole('checkbox', {
                name: /Awaiting embedding/,
            }),
        ).not.toBeInTheDocument();
        await user.click(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        );
        await user.click(
            articlePanel().getByRole('checkbox', { name: 'Selected only' }),
        );
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeChecked();
        await user.click(articlePanel().getByRole('button', { name: 'Clear' }));
        expect(
            articlePanel().getByRole('textbox', { name: 'Search' }),
        ).toHaveValue('');
        expect(
            articlePanel().getByRole('checkbox', { name: 'Selected only' }),
        ).not.toBeChecked();
        await selectFilter(user, articlePanel(), 'Source', 'Analysis desk');
        expect(
            articlePanel().queryByRole('checkbox', {
                name: /Algorithmic member/,
            }),
        ).not.toBeInTheDocument();
        await user.click(articlePanel().getByRole('button', { name: 'Clear' }));
        await selectFilter(user, articlePanel(), 'Status', 'Approved');
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Awaiting embedding/,
            }),
        ).toBeInTheDocument();
        await selectFilter(user, articlePanel(), 'Embedding', 'With embedding');
        expect(
            articlePanel().getByRole('heading', {
                name: 'No candidates match filters',
            }),
        ).toBeInTheDocument();
        await user.click(
            articlePanel().getByRole('button', { name: 'Clear filters' }),
        );
        await user.click(
            clusterPanel().getByRole('button', {
                name: /Existing river cluster/,
            }),
        );
        await selectedPanel().findByRole('checkbox', {
            name: /Original river report/,
        });
        await selectFilter(user, articlePanel(), 'Similarity', '> 0.75');
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Algorithmic member/,
            }),
        ).toBeInTheDocument();
        expect(
            articlePanel().queryByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).not.toBeInTheDocument();
        expect(
            articlePanel().queryByRole('checkbox', {
                name: /Awaiting embedding/,
            }),
        ).not.toBeInTheDocument();
        await user.click(articlePanel().getByRole('button', { name: 'Clear' }));
        expect(
            articlePanel().getByRole('checkbox', {
                name: /Orthogonal analysis/,
            }),
        ).toBeInTheDocument();
    });

    it('searches both saved clusters and candidate article contents, filters by status and restores the list with Clear', async () => {
        const user = await renderPage();
        const search = clusterPanel().getByRole('searchbox', {
            name: 'Search',
        });
        await user.type(search, 'Algorithmic member');
        expect(
            clusterPanel().getByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        ).toBeInTheDocument();
        expect(
            clusterPanel().queryByRole('button', {
                name: /Existing river cluster/,
            }),
        ).not.toBeInTheDocument();
        await user.clear(search);
        await selectFilter(user, clusterPanel(), 'Status', 'Draft');
        expect(
            clusterPanel().getByRole('button', {
                name: /Existing river cluster/,
            }),
        ).toBeInTheDocument();
        expect(
            clusterPanel().queryByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        ).not.toBeInTheDocument();
        await user.type(search, 'missing story');
        expect(
            clusterPanel().getByRole('heading', {
                name: 'No clusters match filters',
            }),
        ).toBeInTheDocument();
        await user.click(clusterPanel().getByRole('button', { name: 'Clear' }));
        expect(search).toHaveValue('');
        expect(
            clusterPanel().getByRole('button', {
                name: /Algorithmic river candidate/,
            }),
        ).toBeInTheDocument();
        expect(
            clusterPanel().getByRole('button', {
                name: /Existing river cluster/,
            }),
        ).toBeInTheDocument();
    });

    it('orders candidate articles by title, age and similarity and filters their fetched date', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-05T08:00:00Z'));
        articles[1] = { ...articles[1], createdAt: '2026-10-05T07:00:00Z' };
        articles[2] = { ...articles[2], createdAt: '2026-09-01T07:00:00Z' };
        const user = await renderPage();
        const visibleTitles = () =>
            articlePanel()
                .getAllByRole('checkbox', { name: /ID:/ })
                .map(
                    (checkbox) =>
                        checkbox.closest('label')!.querySelector('strong')!
                            .textContent,
                );
        await selectFilter(user, articlePanel(), 'Sort', 'Title A-Z');
        expect(visibleTitles()).toEqual([
            'Algorithmic member',
            'Awaiting embedding',
            'Orthogonal analysis',
        ]);
        await selectFilter(user, articlePanel(), 'Sort', 'Newest');
        expect(visibleTitles()).toEqual([
            'Orthogonal analysis',
            'Algorithmic member',
            'Awaiting embedding',
        ]);
        await selectFilter(user, articlePanel(), 'Sort', 'Oldest');
        expect(visibleTitles()).toEqual([
            'Awaiting embedding',
            'Algorithmic member',
            'Orthogonal analysis',
        ]);
        await selectFilter(user, articlePanel(), 'Date', 'Today');
        expect(visibleTitles()).toEqual(['Orthogonal analysis']);
        await user.click(articlePanel().getByRole('button', { name: 'Clear' }));
        await user.click(
            clusterPanel().getByRole('button', {
                name: /Existing river cluster/,
            }),
        );
        await selectedPanel().findByRole('checkbox', {
            name: /Original river report/,
        });
        await selectFilter(user, articlePanel(), 'Sort', 'Similarity high');
        expect(visibleTitles()).toEqual([
            'Algorithmic member',
            'Orthogonal analysis',
            'Awaiting embedding',
        ]);
        await selectFilter(user, articlePanel(), 'Sort', 'Similarity low');
        expect(visibleTitles()).toEqual([
            'Orthogonal analysis',
            'Algorithmic member',
            'Awaiting embedding',
        ]);
    });

    it('sorts saved clusters and algorithmic proposals by age, title and article count', async () => {
        const larger = makeCluster('larger', 'Alpha river cluster', [
            articles[1],
            articles[3],
        ]);
        larger.createdAt = '2026-09-01T10:00:00Z';
        clusters = [...clusters, larger];
        proposals = [
            ...proposals,
            {
                ...makeCandidate(articles[1]),
                id: 'older-proposal',
                title: 'Zeta river candidate',
                createdAt: '2026-09-01T10:00:00Z',
                articlesCount: 2,
                averageSimilarity: 0.2,
            },
        ];
        const user = await renderPage();
        const visibleTitles = () =>
            clusterPanel()
                .getAllByRole('button', { name: /river/ })
                .map((button) => button.querySelector('strong')!.textContent);
        expect(visibleTitles()).toEqual([
            'Algorithmic river candidate',
            'Zeta river candidate',
            'Existing river cluster',
            'Alpha river cluster',
        ]);
        await selectFilter(user, clusterPanel(), 'Sort', 'Oldest');
        expect(visibleTitles()).toEqual([
            'Zeta river candidate',
            'Algorithmic river candidate',
            'Alpha river cluster',
            'Existing river cluster',
        ]);
        await selectFilter(user, clusterPanel(), 'Sort', 'Most articles');
        expect(visibleTitles()).toEqual([
            'Zeta river candidate',
            'Algorithmic river candidate',
            'Alpha river cluster',
            'Existing river cluster',
        ]);
        await selectFilter(user, clusterPanel(), 'Sort', 'Title A-Z');
        expect(visibleTitles()).toEqual([
            'Algorithmic river candidate',
            'Zeta river candidate',
            'Alpha river cluster',
            'Existing river cluster',
        ]);
        await selectFilter(user, clusterPanel(), 'Sort', 'Similarity high');
        expect(visibleTitles().slice(0, 2)).toEqual([
            'Algorithmic river candidate',
            'Zeta river candidate',
        ]);
    });

    it.each([true, false])(
        'returns a removed original member to selectable candidates so its removal can be undone (raw feed contains member: %s)',
        async (memberInFeed) => {
            if (!memberInFeed)
                articles = articles.filter((item) => item.id !== 'original');
            const user = await renderPage();
            await user.click(
                clusterPanel().getByRole('button', {
                    name: /Existing river cluster/,
                }),
            );
            const member = await selectedPanel().findByRole('checkbox', {
                name: /Original river report/,
            });
            await user.click(member);
            await user.click(screen.getByRole('button', { name: 'Remove' }));
            expect(
                selectedPanel().queryByRole('checkbox', {
                    name: /Original river report/,
                }),
            ).not.toBeInTheDocument();
            const returned = articlePanel().getByRole('checkbox', {
                name: /Original river report/,
            });
            expect(returned).toBeEnabled();
            await user.click(returned);
            await user.click(
                screen.getByRole('button', { name: 'Add to cluster' }),
            );
            expect(
                selectedPanel().getByRole('checkbox', {
                    name: /Original river report/,
                }),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Unsaved changes'),
            ).not.toBeInTheDocument();
        },
    );
});
