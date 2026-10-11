import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicClusterByHumanId } from '../../../entities/public-clusters/api/getPublicClusterByHumanId';
import type { GetPublicClusterByHumanIdResponse } from '../../../entities/public-clusters';
import { PublicArticleDetailsPage } from './PublicArticleDetailsPage';
import { UserArticleDetailsPage } from '../UserPage/UserArticleDetailsPage/UserArticleDetailsPage';
import { PublicArticleDetailsPreviewPage } from '../AdminPage/Dashboard/PublicArticleDetailsPreviewPage/PublicArticleDetailsPreviewPage';
import {
    makeBlock,
    makeCluster,
    makeSource,
} from '../publicArticlesTestFixtures';

vi.mock(
    '../../../entities/public-clusters/api/getPublicClusterByHumanId',
    () => ({ getPublicClusterByHumanId: vi.fn() }),
);

const queryClients: QueryClient[] = [];

afterEach(() => {
    queryClients.splice(0).forEach((client) => client.clear());
});

beforeEach(() => {
    vi.mocked(getPublicClusterByHumanId)
        .mockReset()
        .mockResolvedValue({ cluster: makeCluster() });
});

describe.each([
    {
        name: 'public article details',
        Page: PublicArticleDetailsPage,
        basePath: '/articles',
        loadingTitle: 'Loading article',
        errorTitle: 'Failed to load article',
        backLabel: 'Back to articles',
        backTo: '/articles',
    },
    {
        name: 'reader article details',
        Page: UserArticleDetailsPage,
        basePath: '/user/articles',
        loadingTitle: 'Loading article',
        errorTitle: 'Failed to load article',
        backLabel: 'Back to feed',
        backTo: '/user',
    },
    {
        name: 'administrator article preview',
        Page: PublicArticleDetailsPreviewPage,
        basePath: '/admin/public-articles',
        loadingTitle: 'Loading article preview',
        errorTitle: 'Failed to load article preview',
        backLabel: 'Back to admin articles preview',
        backTo: '/admin/public-articles',
    },
])(
    '$name',
    ({ Page, basePath, loadingTitle, errorTitle, backLabel, backTo }) => {
        const renderPage = (path = `${basePath}/RZH-001`) => {
            const queryClient = new QueryClient({
                defaultOptions: { queries: { retry: false, gcTime: Infinity } },
            });
            queryClients.push(queryClient);
            return render(
                <QueryClientProvider client={queryClient}>
                    <MemoryRouter initialEntries={[path]}>
                        <Routes>
                            <Route
                                path={`${basePath}/:humanId`}
                                element={<Page />}
                            />
                            <Route path="/details" element={<Page />} />
                        </Routes>
                    </MemoryRouter>
                </QueryClientProvider>,
            );
        };
        it('shows loading until the query resolves and passes the route identifier to the API', async () => {
            let resolveRequest!: (
                value: GetPublicClusterByHumanIdResponse,
            ) => void;
            vi.mocked(getPublicClusterByHumanId).mockReturnValue(
                new Promise((resolve) => {
                    resolveRequest = resolve;
                }),
            );
            renderPage(`${basePath}/RZH-123`);
            expect(
                screen.getByRole('heading', { name: loadingTitle }),
            ).toBeInTheDocument();
            expect(getPublicClusterByHumanId).toHaveBeenCalledExactlyOnceWith(
                'RZH-123',
            );
            await act(async () => resolveRequest({ cluster: makeCluster() }));
            expect(
                await screen.findByRole('heading', {
                    name: 'Published material',
                }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('heading', { name: loadingTitle }),
            ).not.toBeInTheDocument();
        });

        it('shows a recoverable error after the request fails', async () => {
            vi.mocked(getPublicClusterByHumanId).mockRejectedValue(
                new Error('Offline'),
            );
            renderPage();
            expect(
                await screen.findByRole('heading', {
                    name: errorTitle,
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: backLabel }),
            ).toHaveAttribute('href', backTo);
            expect(
                screen.queryByRole('heading', { name: 'Published material' }),
            ).not.toBeInTheDocument();
        });

        it('shows missing content without requesting an undefined route identifier', () => {
            renderPage('/details');
            expect(
                screen.getByRole('heading', {
                    name: 'This article is not available',
                }),
            ).toBeInTheDocument();
            expect(getPublicClusterByHumanId).not.toHaveBeenCalled();
            expect(
                screen.getByRole('link', { name: backLabel }),
            ).toHaveAttribute('href', backTo);
        });

        it('handles an unavailable cluster in a successful response', async () => {
            // The page guards missing content even when a server returns an empty object.
            vi.mocked(getPublicClusterByHumanId).mockResolvedValue(
                {} as GetPublicClusterByHumanIdResponse,
            );
            renderPage();
            expect(
                await screen.findByRole('heading', {
                    name: 'This article is not available',
                }),
            ).toBeInTheDocument();
        });

        it('groups and orders blocks, renders stance and source provenance, and keeps external links', async () => {
            const cluster = makeCluster({
                blocks: [
                    makeBlock({
                        id: 'late',
                        title: 'Second fact',
                        position: 20,
                    }),
                    makeBlock({
                        id: 'opinion',
                        type: 'OPINION',
                        title: 'Expert view',
                        stance: 'CONTRA',
                        content: 'An attributed opinion.',
                        sourceName: 'Commentary Desk',
                    }),
                    makeBlock({
                        id: 'context',
                        type: 'CONTEXT',
                        title: 'Background',
                        content: 'Historical context.',
                    }),
                    makeBlock({
                        id: 'early',
                        title: 'First fact',
                        position: 2,
                        sourceName: 'Fact Desk',
                        sourceUrl: 'https://facts.example/report',
                    }),
                ],
                sources: [
                    makeSource(),
                    makeSource({
                        id: 'unknown',
                        title: 'Unnamed report',
                        source: null,
                        url: null,
                    }),
                ],
            });
            const originalOrder = cluster.blocks.map((block) => block.id);
            vi.mocked(getPublicClusterByHumanId).mockResolvedValue({ cluster });
            renderPage();
            expect(
                await screen.findByRole('heading', { name: cluster.title }),
            ).toBeInTheDocument();
            expect(screen.getByText(cluster.summary!)).toBeInTheDocument();
            expect(screen.getByText('2 sources')).toBeInTheDocument();
            expect(screen.getByText('Belgium')).toBeInTheDocument();
            const facts = screen
                .getByRole('heading', { name: 'Facts' })
                .closest('section')!;
            expect(
                within(facts)
                    .getAllByRole('heading', { level: 3 })
                    .map((heading) => heading.textContent),
            ).toEqual(['First fact', 'Second fact']);
            const context = screen
                .getByRole('heading', { name: 'Context' })
                .closest('section')!;
            expect(
                within(context).getByText('Historical context.'),
            ).toBeInTheDocument();
            const opinions = screen
                .getByRole('heading', { name: 'Opinions' })
                .closest('section')!;
            expect(within(opinions).getByText('CONTRA')).toBeInTheDocument();
            expect(
                within(opinions).getByText('Commentary Desk'),
            ).toBeInTheDocument();
            const blockSource = screen.getByRole('link', { name: 'Fact Desk' });
            expect(blockSource).toHaveAttribute(
                'href',
                'https://facts.example/report',
            );
            expect(blockSource).toHaveAttribute('target', '_blank');
            expect(screen.getByText('Unknown source')).toBeInTheDocument();
            const source = screen.getByRole('link', { name: 'Open source' });
            expect(source).toHaveAttribute(
                'href',
                'https://news.example/report',
            );
            expect(source).toHaveAttribute('rel', 'noreferrer');
            expect(cluster.blocks.map((block) => block.id)).toEqual(
                originalOrder,
            );
        });

        it('provides empty states for absent blocks and sources and omits optional metadata', async () => {
            vi.mocked(getPublicClusterByHumanId).mockResolvedValue({
                cluster: makeCluster({
                    blocks: [],
                    sources: [],
                    summary: null,
                    mainCountry: null,
                    publishedAt: 'invalid-date',
                }),
            });
            renderPage();
            expect(
                await screen.findByRole('heading', { name: 'No fact blocks' }),
            ).toBeInTheDocument();
            for (const title of [
                'No context blocks',
                'No opinion blocks',
                'No sources',
            ])
                expect(
                    screen.getByRole('heading', { name: title }),
                ).toBeInTheDocument();
            expect(screen.getByText('Published —')).toBeInTheDocument();
            expect(screen.getByText('0 sources')).toBeInTheDocument();
            expect(
                screen.queryByText('A concise explanation.'),
            ).not.toBeInTheDocument();
            expect(screen.queryByText('Belgium')).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Open source' }),
            ).not.toBeInTheDocument();
        });

        it('uses singular source metadata and a fallback for an absent publication date', async () => {
            vi.mocked(getPublicClusterByHumanId).mockResolvedValue({
                cluster: makeCluster({ publishedAt: null }),
            });
            renderPage();
            expect(await screen.findByText('1 source')).toBeInTheDocument();
            expect(screen.getByText('Published —')).toBeInTheDocument();
        });
    },
);
