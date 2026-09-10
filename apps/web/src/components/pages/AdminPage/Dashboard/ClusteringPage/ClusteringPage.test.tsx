// @vitest-environment jsdom

import { act, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClusteringPage } from './ClusteringPage';

const article = (id: string) => ({
    id,
    title: `Article ${id}`,
    summary: null,
    source: { name: 'Example source' },
    country: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    publishedAt: null,
    embedding: [1, 0],
    confidence: 1,
    isPrimary: true,
    status: 'EMBEDDED',
});

const savedCluster = (id: string, articleIds: string[]) => ({
    id,
    humanId: id,
    title: `Cluster ${id}`,
    summary: null,
    status: 'DRAFT',
    createdAt: '2026-09-01T12:00:00.000Z',
    averageSimilarity: 1,
    _count: { articleLinks: articleIds.length },
    articles: articleIds.map(article),
});

type SavedCluster = ReturnType<typeof savedCluster>;

const query = <T,>(data: T) => ({
    data,
    dataUpdatedAt: 1,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn<
        () => Promise<{
            data: T;
            isSuccess: boolean;
            dataUpdatedAt: number;
        }>
    >(),
});

type DetailQuery = ReturnType<typeof query<SavedCluster | undefined>>;

const mocks = vi.hoisted(() => ({
    details: new Map<string, DetailQuery>(),
    emptyDetail: {} as DetailQuery,
    clusters: {} as ReturnType<typeof query<{ clusters: SavedCluster[] }>>,
    articles: {} as ReturnType<
        typeof query<{ articles: ReturnType<typeof article>[] }>
    >,
    candidates: {} as ReturnType<
        typeof query<{
            candidates: {
                id: string;
                title: string;
                summary: null;
                articlesCount: number;
                averageSimilarity: number;
                createdAt: string;
                articles: {
                    article: ReturnType<typeof article>;
                    confidence: number;
                    isPrimary: boolean;
                }[];
            }[];
        }>
    >,
    save: { isPending: false, mutateAsync: vi.fn() },
    create: { isPending: false, mutateAsync: vi.fn() },
    remove: { isPending: false, mutateAsync: vi.fn() },
    generate: { isPending: false, mutateAsync: vi.fn() },
    accept: { isPending: false, mutateAsync: vi.fn() },
    removeCandidate: { isPending: false, mutateAsync: vi.fn() },
    embeddings: { isPending: false, mutateAsync: vi.fn() },
    showToast: vi.fn(),
}));

vi.mock('../../../../../entities/cluster', () => ({
    useClustersQuery: () => mocks.clusters,
    useClusterByIdQuery: (id: string | null) =>
        (id ? mocks.details.get(id) : undefined) ?? mocks.emptyDetail,
    useUpdateClusterArticlesMutation: () => mocks.save,
    useCreateClusterFromArticlesMutation: () => mocks.create,
    useDeleteClusterMutation: () => mocks.remove,
}));

vi.mock('../../../../../entities/cluster-candidate', () => ({
    useClusterCandidatesQuery: () => mocks.candidates,
    useGenerateClusterCandidatesMutation: () => mocks.generate,
    useAcceptClusterCandidateMutation: () => mocks.accept,
    useDeleteClusterCandidateMutation: () => mocks.removeCandidate,
}));

vi.mock('../../../../../entities/clustering', async () => {
    const metrics =
        await import('../../../../../entities/clustering/lib/calculateClusterMetrics');

    return {
        ...metrics,
        useGenerateArticleEmbeddingsMutation: () => mocks.embeddings,
    };
});

vi.mock('../../../../../entities/raw-news/hooks/useArticlesQuery', () => ({
    useArticlesQuery: () => mocks.articles,
}));

vi.mock('../../../../ui/Toast/ToastProvider', () => ({
    useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('../../../../ui/Button/Button', () => ({
    Button: ({
        children,
        onClick,
        disabled,
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button type="button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
}));

vi.mock('../../../../ui/PageState/PageState', () => ({
    PageState: ({ title }: { title: string }) => <p>{title}</p>,
}));

vi.mock('../../../../ui/Modal/ConfirmModal/ConfirmModal', () => ({
    ConfirmModal: ({
        isOpen,
        title,
        description,
        confirmLabel,
        cancelLabel,
        onConfirm,
        onCancel,
    }: {
        isOpen: boolean;
        title: string;
        description: ReactNode;
        confirmLabel: string;
        cancelLabel: string;
        onConfirm: () => void;
        onCancel: () => void;
    }) =>
        isOpen ? (
            <div role="dialog" aria-label={title}>
                <p>{description}</p>
                <button onClick={onConfirm}>{confirmLabel}</button>
                <button onClick={onCancel}>{cancelLabel}</button>
            </div>
        ) : null,
}));

vi.mock('./ClusteringCards/ClusterCard', () => ({
    ClusterCard: ({
        cluster,
        isActive,
        onSelect,
    }: {
        cluster: { id: string };
        isActive: boolean;
        onSelect: (id: string) => void;
    }) => (
        <button
            data-active={isActive}
            data-cluster={cluster.id}
            onClick={() => onSelect(cluster.id)}
        >
            Choose {cluster.id}
        </button>
    ),
}));

vi.mock('./ExistingClusterSuggestions/ExistingClusterSuggestions', () => ({
    ExistingClusterSuggestions: ({
        disabled,
        hasUnsavedChanges,
        dataRevision,
        onBusyChange,
        onOpenCluster,
    }: {
        disabled: boolean;
        hasUnsavedChanges: boolean;
        dataRevision: string;
        onBusyChange: (busy: boolean) => void;
        onOpenCluster: (clusterId: string) => void;
    }) => (
        <div
            data-suggestion-panel
            data-disabled={disabled}
            data-unsaved={hasUnsavedChanges}
            data-revision={dataRevision}
        >
            <button disabled={disabled} onClick={() => onOpenCluster('b')}>
                Open suggested cluster b
            </button>
            <button disabled={disabled} onClick={() => onBusyChange(true)}>
                Begin suggestion action
            </button>
            <button onClick={() => onBusyChange(false)}>
                Finish suggestion action
            </button>
        </div>
    ),
}));

vi.mock('./ClusteringCards/ArticleCandidateCard', () => ({
    ArticleCandidateCard: ({
        article: item,
        isSelected,
        onToggle,
    }: {
        article: { id: string };
        isSelected: boolean;
        onToggle: (id: string) => void;
    }) => (
        <button aria-pressed={isSelected} onClick={() => onToggle(item.id)}>
            Toggle candidate {item.id}
        </button>
    ),
}));

vi.mock('./ClusteringCards/ClusterArticleCard', () => ({
    ClusterArticleCard: ({
        article: item,
        isSelected,
        onToggle,
    }: {
        article: { id: string };
        isSelected: boolean;
        onToggle: (id: string) => void;
    }) => (
        <button
            data-cluster-article={item.id}
            aria-pressed={isSelected}
            onClick={() => onToggle(item.id)}
        >
            Toggle member {item.id}
        </button>
    ),
}));

vi.mock('./ClusteringFilters/ClusteringFilters', () => ({
    ClusteringFilters: () => null,
}));

vi.mock('./ClusterListFilters/ClusterListFilters', () => ({
    ClusterListFilters: () => null,
}));

let container: HTMLDivElement;
let root: Root;

const render = async () => {
    await act(async () => root.render(<ClusteringPage />));
};

const button = (label: string) => {
    const target = Array.from(container.querySelectorAll('button')).find(
        (element) => element.textContent === label,
    );

    expect(target, `Expected button "${label}"`).toBeDefined();
    return target!;
};

const click = async (label: string) => {
    await act(async () => button(label).click());
};

const composition = () =>
    Array.from(container.querySelectorAll('[data-cluster-article]'))
        .map((element) => element.getAttribute('data-cluster-article'))
        .sort();

const activeCluster = () =>
    container
        .querySelector('[data-active="true"]')
        ?.getAttribute('data-cluster');

const expectDirty = (isDirty: boolean) => {
    expect(container.textContent?.includes('Unsaved changes')).toBe(isDirty);
};

const addArticle = async (id = 'extra') => {
    await click(`Toggle candidate ${id}`);
    await click('Add to cluster');
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((finish) => {
        resolve = finish;
    });

    return { promise, resolve };
};

beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

    mocks.details.clear();
    mocks.details.set(
        'a',
        query<SavedCluster | undefined>(savedCluster('a', ['original'])),
    );
    mocks.details.set(
        'b',
        query<SavedCluster | undefined>(savedCluster('b', ['other'])),
    );
    mocks.emptyDetail = query<SavedCluster | undefined>(undefined);
    mocks.clusters = query({
        clusters: [
            savedCluster('a', ['original']),
            savedCluster('b', ['other']),
        ],
    });
    mocks.articles = query({
        articles: [article('extra'), article('another')],
    });
    mocks.candidates = query({
        candidates: [
            {
                id: 'algorithmic',
                title: 'Algorithmic candidate',
                summary: null,
                articlesCount: 1,
                averageSimilarity: 1,
                createdAt: '2026-09-01T12:00:00.000Z',
                articles: [
                    {
                        article: article('proposed'),
                        confidence: 1,
                        isPrimary: true,
                    },
                ],
            },
        ],
    });

    for (const detail of mocks.details.values()) {
        detail.refetch.mockImplementation(async () => ({
            data: detail.data,
            isSuccess: true,
            dataUpdatedAt: detail.dataUpdatedAt,
        }));
    }

    mocks.clusters.refetch.mockImplementation(async () => ({
        data: mocks.clusters.data,
        isSuccess: true,
        dataUpdatedAt: mocks.clusters.dataUpdatedAt,
    }));
    mocks.articles.refetch.mockImplementation(async () => ({
        data: mocks.articles.data,
        isSuccess: true,
        dataUpdatedAt: mocks.articles.dataUpdatedAt,
    }));
    mocks.candidates.refetch.mockImplementation(async () => ({
        data: mocks.candidates.data,
        isSuccess: true,
        dataUpdatedAt: mocks.candidates.dataUpdatedAt,
    }));
    mocks.save.mutateAsync.mockResolvedValue({ cluster: { id: 'a' } });
    mocks.generate.mutateAsync.mockResolvedValue({
        meta: { candidatesCreated: 1, articlesChecked: 2 },
    });

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('unsaved cluster composition', () => {
    it('protects the draft when opening a suggested existing cluster', async () => {
        await render();
        await click('Choose a');
        await addArticle();
        expect(
            container
                .querySelector('[data-suggestion-panel]')
                ?.getAttribute('data-unsaved'),
        ).toBe('true');

        await click('Open suggested cluster b');
        expect(container.querySelector('[role="dialog"]')).not.toBeNull();
        await click('Keep editing');
        expect(activeCluster()).toBe('a');
        expect(composition()).toEqual(['extra', 'original']);

        await click('Open suggested cluster b');
        await click('Discard changes');
        expect(activeCluster()).toBe('b');
        expectDirty(false);
        await click('Open suggested cluster b');
        expect(activeCluster()).toBe('b');
    });

    it('locks the editor for suggestion actions and passes refreshed data to the list', async () => {
        await render();
        await click('Choose a');
        await addArticle();
        await click('Begin suggestion action');
        expect(button('Save').disabled).toBe(true);
        expect(button('Add to cluster').disabled).toBe(true);
        expect(button('Open suggested cluster b').disabled).toBe(true);
        await click('Choose b');
        expect(activeCluster()).toBe('a');
        expect(composition()).toEqual(['extra', 'original']);
        expectDirty(true);

        await click('Finish suggestion action');
        expect(button('Save').disabled).toBe(false);
        expectDirty(true);
        mocks.articles.dataUpdatedAt = 2;
        mocks.clusters.dataUpdatedAt = 3;
        mocks.details.get('a')!.dataUpdatedAt = 4;
        await render();
        expect(
            container
                .querySelector('[data-suggestion-panel]')
                ?.getAttribute('data-revision'),
        ).toBe('2:3:4');
        expect(composition()).toEqual(['extra', 'original']);
        expectDirty(true);
    });

    it('keeps a dirty saved cluster when background data is refreshed', async () => {
        await render();
        await click('Choose a');
        await addArticle();
        expectDirty(true);
        const leaving = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(leaving);
        expect(leaving.defaultPrevented).toBe(true);

        const detail = mocks.details.get('a')!;
        detail.data = savedCluster('a', ['server-replacement']);
        detail.dataUpdatedAt += 1;
        mocks.articles.data = {
            articles: [article('extra'), article('another')],
        };
        await render();

        expect(composition()).toEqual(['extra', 'original']);
        expectDirty(true);
    });

    it('asks before switching, deselecting, or opening an algorithmic candidate', async () => {
        await render();
        await click('Choose a');
        await addArticle();

        for (const target of ['b', 'a', 'algorithmic']) {
            await click(`Choose ${target}`);
            expect(
                container
                    .querySelector('[role="dialog"]')
                    ?.getAttribute('aria-label'),
            ).toBe('Discard unsaved changes?');
            await click('Keep editing');
            expect(activeCluster()).toBe('a');
            expect(composition()).toEqual(['extra', 'original']);
            expectDirty(true);
        }

        await click('Choose b');
        await click('Discard changes');
        expect(activeCluster()).toBe('b');
        expect(composition()).toEqual(['other']);
        expectDirty(false);
    });

    it('protects a new draft and returns to clean after undoing an addition', async () => {
        await render();
        await addArticle();
        expectDirty(true);

        mocks.articles.data = {
            articles: [article('extra'), article('another')],
        };
        await render();
        expect(composition()).toEqual(['extra']);

        await click('Choose a');
        await click('Keep editing');
        expect(activeCluster()).toBeUndefined();
        expect(composition()).toEqual(['extra']);

        await click('Toggle member extra');
        await click('Remove');
        expectDirty(false);
        await click('Choose a');
        await addArticle();
        await click('Toggle member extra');
        await click('Remove');
        expectDirty(false);
        await click('Choose b');
        expect(activeCluster()).toBe('b');
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('retains changes after a failed save and clears them after a successful save', async () => {
        await render();
        await click('Choose a');
        await addArticle();
        mocks.save.mutateAsync.mockRejectedValueOnce(
            new Error('Save unavailable'),
        );
        await click('Save');
        expectDirty(true);
        expect(composition()).toEqual(['extra', 'original']);

        const detail = mocks.details.get('a')!;
        detail.refetch.mockImplementation(async () => {
            detail.data = savedCluster('a', ['original', 'extra']);
            detail.dataUpdatedAt += 1;
            return {
                data: detail.data,
                isSuccess: true,
                dataUpdatedAt: detail.dataUpdatedAt,
            };
        });
        await click('Save');
        await render();
        expectDirty(false);
        expect(composition()).toEqual(['extra', 'original']);
        const leaving = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(leaving);
        expect(leaving.defaultPrevented).toBe(false);
        await click('Choose b');
        expect(activeCluster()).toBe('b');
    });

    it('keeps the saved composition if detail refresh fails and resumes later updates', async () => {
        await render();
        await click('Choose a');
        await addArticle();

        const detail = mocks.details.get('a')!;
        detail.refetch.mockImplementationOnce(async () => {
            detail.isError = true;
            return {
                data: detail.data,
                isSuccess: false,
                dataUpdatedAt: detail.dataUpdatedAt,
            };
        });
        await click('Save');
        expectDirty(false);
        expect(composition()).toEqual(['extra', 'original']);

        await addArticle('another');
        expectDirty(true);
        expect(composition()).toEqual(['another', 'extra', 'original']);
        await click('Toggle member another');
        await click('Remove');
        expectDirty(false);
        expect(composition()).toEqual(['extra', 'original']);

        detail.isError = false;
        detail.data = savedCluster('a', ['latest']);
        detail.dataUpdatedAt += 1;
        await render();
        expect(composition()).toEqual(['latest']);
        expectDirty(false);
    });

    it.each([false, true])(
        'preserves the draft when generating candidates (saved: %s)',
        async (saved) => {
            await render();
            if (saved) await click('Choose a');
            await addArticle();
            await click('Generate candidates');

            expect(mocks.generate.mutateAsync).toHaveBeenCalledOnce();
            expect(composition()).toEqual(
                saved ? ['extra', 'original'] : ['extra'],
            );
            expectDirty(true);
            expect(activeCluster()).toBe(saved ? 'a' : undefined);
        },
    );

    it('locks composition and selection until save and detail refresh both finish', async () => {
        await render();
        await click('Choose a');
        await addArticle();
        await click('Toggle candidate another');
        await click('Toggle member extra');

        const saving = deferred<{ cluster: { id: string } }>();
        const refreshing = deferred<{
            data: SavedCluster;
            isSuccess: boolean;
            dataUpdatedAt: number;
        }>();
        mocks.save.mutateAsync.mockReturnValueOnce(saving.promise);
        mocks.details.get('a')!.refetch.mockReturnValueOnce(refreshing.promise);
        await click('Save');

        const expectLocked = async () => {
            expect(button('Add to cluster').disabled).toBe(true);
            expect(button('Remove').disabled).toBe(true);
            expect(button('Create').disabled).toBe(true);
            expect(button('Save').disabled).toBe(true);
            await click('Choose b');
            expect(activeCluster()).toBe('a');
            expect(container.querySelector('[role="dialog"]')).toBeNull();
            expect(composition()).toEqual(['extra', 'original']);
        };

        await expectLocked();
        await act(async () => saving.resolve({ cluster: { id: 'a' } }));
        await expectLocked();

        const detail = mocks.details.get('a')!;
        detail.data = savedCluster('a', ['original', 'extra']);
        detail.dataUpdatedAt += 1;
        await act(async () =>
            refreshing.resolve({
                data: detail.data!,
                isSuccess: true,
                dataUpdatedAt: detail.dataUpdatedAt,
            }),
        );
        await render();
        expectDirty(false);
        await click('Choose b');
        expect(activeCluster()).toBe('b');
    });
});
