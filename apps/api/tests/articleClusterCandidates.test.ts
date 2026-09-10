import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    CandidateStatus,
    ClusterArticleMethod,
    ClusterStatus,
    type Prisma,
    type PrismaClient,
} from '@prisma/client';
import {
    acceptArticleClusterCandidate,
    generateArticleClusterCandidates,
    listArticleClusterCandidates,
    rejectArticleClusterCandidate,
} from '../src/core/clustering/articleClusterCandidates';

const date = new Date('2026-09-01T12:00:00Z');
const hours = (count: number) => new Date(date.getTime() + count * 3_600_000);

const article = (id: string, embedding: unknown = [1, 0]) => ({
    id,
    title: `Article ${id}`,
    summary: null as string | null,
    status: ArticleStatus.EMBEDDED as ArticleStatus,
    embedding,
    publishedAt: date as Date | null,
    createdAt: date,
    source: { id: 'source', name: 'Source' },
});
const cluster = (id = 'cluster') => ({
    id,
    humanId: `human-${id}`,
    title: `Cluster ${id}`,
    status: ClusterStatus.DRAFT as ClusterStatus,
    embedding: [0, 1] as unknown,
    publishedAt: null as Date | null,
    createdAt: date,
    updatedAt: date,
    blocks: [{ id: 'block', content: 'Existing editorial content' }],
});
const link = (articleId = 'member', clusterId = 'cluster') => ({
    clusterId,
    articleId,
    isPrimary: true,
    confidence: 0.88,
    method: ClusterArticleMethod.MANUAL as ClusterArticleMethod,
    addedByUserId: 'original-editor',
    addedAt: date,
});
const candidate = (
    id = 'candidate',
    articleId = 'new',
    clusterId = 'cluster',
) => ({
    id,
    articleId,
    clusterId,
    score: 0.91,
    status: CandidateStatus.PENDING as CandidateStatus,
    createdAt: date,
    reviewedByUserId: null as string | null,
    reviewedAt: null as Date | null,
});

interface Store {
    articles: ReturnType<typeof article>[];
    clusters: ReturnType<typeof cluster>[];
    links: ReturnType<typeof link>[];
    candidates: ReturnType<typeof candidate>[];
}

const initialStore = (): Store => ({
    articles: [
        { ...article('member'), status: ArticleStatus.CLUSTERED },
        article('new', [0.8, 0.6]),
    ],
    clusters: [cluster()],
    links: [link()],
    candidates: [candidate()],
});

type Filter = {
    id?: string;
    status?: string | { in?: string[]; not?: string };
    embedding?: { not?: unknown };
    clusterLinks?: { none?: object };
    article?: Filter & { is?: Filter };
    cluster?: Filter & { is?: Filter };
    articleId?: string;
    clusterId?: string;
};

function matchesStatus(actual: string, expected: Filter['status']) {
    if (!expected) return true;
    if (typeof expected === 'string') return actual === expected;
    return (
        (!expected.in || expected.in.includes(actual)) &&
        actual !== expected.not
    );
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

type Failure =
    'candidate-delete' | 'candidate-create' | 'link-create' | 'cluster-update';

function makePrismaDouble(
    seed = initialStore(),
    options: { failure?: Failure; pauseCreate?: boolean } = {},
) {
    let committed = structuredClone(seed);
    let failure = options.failure;
    let transactionQueue = Promise.resolve();
    const createStarted = deferred();
    const secondTransactionStarted = deferred();
    const createGate = deferred();
    const failureError = new Error('Injected persistence failure');
    const calls = { transactions: 0, creates: 0, claims: 0 };

    const client = (state: () => Store, inTransaction: boolean) => {
        const matchesArticle = (
            row: Store['articles'][number],
            where: Filter = {},
        ) =>
            (!where.id || row.id === where.id) &&
            matchesStatus(row.status, where.status) &&
            (!where.embedding || row.embedding !== null) &&
            (!where.clusterLinks?.none ||
                !state().links.some((item) => item.articleId === row.id));
        const matchesCluster = (
            row: Store['clusters'][number],
            where: Filter = {},
        ) =>
            (!where.id || row.id === where.id) &&
            matchesStatus(row.status, where.status);
        const articleView = (row: Store['articles'][number]) => ({
            ...structuredClone(row),
            clusterLinks: structuredClone(
                state().links.filter((item) => item.articleId === row.id),
            ),
        });
        const clusterView = (row: Store['clusters'][number]) => ({
            ...structuredClone(row),
            articleLinks: state()
                .links.filter((item) => item.clusterId === row.id)
                .map((item) => ({
                    ...structuredClone(item),
                    article: articleView(
                        state().articles.find(
                            (value) => value.id === item.articleId,
                        )!,
                    ),
                })),
            _count: {
                articleLinks: state().links.filter(
                    (item) => item.clusterId === row.id,
                ).length,
            },
        });
        const matchesCandidate = (
            row: Store['candidates'][number],
            where: Filter = {},
        ) => {
            const source = state().articles.find(
                (item) => item.id === row.articleId,
            );
            const target = state().clusters.find(
                (item) => item.id === row.clusterId,
            );
            return (
                (!where.id || row.id === where.id) &&
                matchesStatus(row.status, where.status) &&
                (!where.articleId || row.articleId === where.articleId) &&
                (!where.clusterId || row.clusterId === where.clusterId) &&
                (!where.article ||
                    Boolean(
                        source &&
                        matchesArticle(
                            source,
                            where.article.is ?? where.article,
                        ),
                    )) &&
                (!where.cluster ||
                    Boolean(
                        target &&
                        matchesCluster(
                            target,
                            where.cluster.is ?? where.cluster,
                        ),
                    ))
            );
        };
        const candidateView = (row: Store['candidates'][number]) => {
            const source = state().articles.find(
                (item) => item.id === row.articleId,
            );
            const target = state().clusters.find(
                (item) => item.id === row.clusterId,
            );
            return {
                ...structuredClone(row),
                article: source ? articleView(source) : null,
                cluster: target ? clusterView(target) : null,
            };
        };
        const requireTransaction = () =>
            assert.ok(inTransaction, 'Writes must use the transaction client');

        return {
            article: {
                findMany: async ({ where = {} }: { where?: Filter } = {}) =>
                    state()
                        .articles.filter((row) => matchesArticle(row, where))
                        .map(articleView),
                findUnique: async ({ where }: { where: Filter }) => {
                    const row = state().articles.find((item) =>
                        matchesArticle(item, where),
                    );
                    return row ? articleView(row) : null;
                },
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: Filter;
                    data: Partial<Store['articles'][number]>;
                }) => {
                    requireTransaction();
                    assert.deepEqual(where.status, {
                        in: [ArticleStatus.APPROVED, ArticleStatus.EMBEDDED],
                    });
                    assert.deepEqual(where.clusterLinks, { none: {} });
                    const rows = state().articles.filter((row) =>
                        matchesArticle(row, where),
                    );
                    rows.forEach((row) => Object.assign(row, data));
                    return { count: rows.length };
                },
            },
            cluster: {
                findMany: async ({ where = {} }: { where?: Filter } = {}) =>
                    state()
                        .clusters.filter((row) => matchesCluster(row, where))
                        .map(clusterView),
                findUnique: async ({ where }: { where: Filter }) => {
                    const row = state().clusters.find((item) =>
                        matchesCluster(item, where),
                    );
                    return row ? clusterView(row) : null;
                },
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: Filter;
                    data: Partial<Store['clusters'][number]>;
                }) => {
                    requireTransaction();
                    assert.ok(
                        where.status,
                        'Lock only a currently eligible target cluster',
                    );
                    const rows = state().clusters.filter((row) =>
                        matchesCluster(row, where),
                    );
                    rows.forEach((row) => Object.assign(row, data));
                    return { count: rows.length };
                },
                update: async ({
                    where,
                    data,
                }: {
                    where: Filter;
                    data: Partial<Store['clusters'][number]>;
                }) => {
                    requireTransaction();
                    const row = state().clusters.find((item) =>
                        matchesCluster(item, where),
                    );
                    assert.ok(row);
                    Object.assign(row, data);
                    if (failure === 'cluster-update') throw failureError;
                    return clusterView(row);
                },
            },
            clusterArticle: {
                findUnique: async ({
                    where,
                }: {
                    where: {
                        clusterId_articleId: {
                            clusterId: string;
                            articleId: string;
                        };
                    };
                }) => {
                    const pair = where.clusterId_articleId;
                    return structuredClone(
                        state().links.find(
                            (row) =>
                                row.articleId === pair.articleId &&
                                row.clusterId === pair.clusterId,
                        ) ?? null,
                    );
                },
                findMany: async ({ where }: { where: Filter }) =>
                    state()
                        .links.filter(
                            (row) =>
                                (!where.clusterId ||
                                    row.clusterId === where.clusterId) &&
                                (!where.articleId ||
                                    row.articleId === where.articleId),
                        )
                        .map((row) => ({
                            ...structuredClone(row),
                            article: articleView(
                                state().articles.find(
                                    (value) => value.id === row.articleId,
                                )!,
                            ),
                        })),
                create: async ({
                    data,
                }: {
                    data: Omit<Store['links'][number], 'addedAt'>;
                }) => {
                    requireTransaction();
                    calls.creates += 1;
                    if (calls.creates === 1) {
                        createStarted.resolve();
                        if (options.pauseCreate) await createGate.promise;
                    }
                    assert.equal(
                        state().links.some(
                            (row) =>
                                row.articleId === data.articleId &&
                                row.clusterId === data.clusterId,
                        ),
                        false,
                    );
                    const row = { ...data, addedAt: new Date() };
                    state().links.push(row);
                    if (failure === 'link-create') throw failureError;
                    return structuredClone(row);
                },
            },
            articleClusterCandidate: {
                findUnique: async ({ where }: { where: Filter }) => {
                    const row = state().candidates.find((item) =>
                        matchesCandidate(item, where),
                    );
                    return row ? candidateView(row) : null;
                },
                findMany: async ({
                    where = {},
                    skip = 0,
                    take,
                }: { where?: Filter; skip?: number; take?: number } = {}) => {
                    const rows = state()
                        .candidates.filter((row) =>
                            matchesCandidate(row, where),
                        )
                        .sort(
                            (a, b) =>
                                b.score - a.score || a.id.localeCompare(b.id),
                        );
                    return rows
                        .slice(
                            skip,
                            take === undefined ? undefined : skip + take,
                        )
                        .map(candidateView);
                },
                count: async ({ where = {} }: { where?: Filter } = {}) =>
                    state().candidates.filter((row) =>
                        matchesCandidate(row, where),
                    ).length,
                updateMany: async ({
                    where,
                    data,
                }: {
                    where: Filter;
                    data: Partial<Store['candidates'][number]>;
                }) => {
                    assert.equal(
                        where.status,
                        CandidateStatus.PENDING,
                        'Review must conditionally claim a pending candidate',
                    );
                    if (data.status === CandidateStatus.ACCEPTED) {
                        requireTransaction();
                        calls.claims += 1;
                    }
                    const rows = state().candidates.filter((row) =>
                        matchesCandidate(row, where),
                    );
                    rows.forEach((row) => Object.assign(row, data));
                    return { count: rows.length };
                },
                deleteMany: async ({ where }: { where: Filter }) => {
                    requireTransaction();
                    assert.deepEqual(where, {
                        status: CandidateStatus.PENDING,
                    });
                    if (failure === 'candidate-delete') throw failureError;
                    const previous = state().candidates.length;
                    state().candidates = state().candidates.filter(
                        (row) => !matchesCandidate(row, where),
                    );
                    return { count: previous - state().candidates.length };
                },
                createMany: async ({
                    data,
                    skipDuplicates,
                }: {
                    data: Pick<
                        Store['candidates'][number],
                        'articleId' | 'clusterId' | 'score'
                    >[];
                    skipDuplicates?: boolean;
                }) => {
                    requireTransaction();
                    assert.equal(skipDuplicates, true);
                    let count = 0;
                    for (const row of data) {
                        if (
                            state().candidates.some(
                                (item) =>
                                    item.articleId === row.articleId &&
                                    item.clusterId === row.clusterId,
                            )
                        )
                            continue;
                        state().candidates.push({
                            ...candidate(
                                `generated-${count}`,
                                row.articleId,
                                row.clusterId,
                            ),
                            ...row,
                        });
                        count += 1;
                        if (failure === 'candidate-create') throw failureError;
                    }
                    return { count };
                },
            },
        };
    };

    // Stage writes and serialize test transactions to exercise conditional
    // eligibility and rollback boundaries; this does not emulate PostgreSQL.
    const prisma = {
        ...client(() => committed, false),
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
            calls.transactions += 1;
            if (calls.transactions === 2) secondTransactionStarted.resolve();
            const previous = transactionQueue;
            const next = deferred();
            transactionQueue = next.promise;
            await previous;
            const staged = structuredClone(committed);
            try {
                const result = await run(
                    client(
                        () => staged,
                        true,
                    ) as unknown as Prisma.TransactionClient,
                );
                committed = staged;
                return result;
            } finally {
                next.resolve();
            }
        },
    } as unknown as PrismaClient;

    return {
        prisma,
        calls,
        failureError,
        getState: () => structuredClone(committed),
        clearFailure: () => {
            failure = undefined;
        },
        createStarted: createStarted.promise,
        secondTransactionStarted: secondTransactionStarted.promise,
        releaseCreate: createGate.resolve,
    };
}

const accept = (
    harness: ReturnType<typeof makePrismaDouble>,
    candidateId = 'candidate',
    reviewedByUserId = 'reviewer',
) =>
    acceptArticleClusterCandidate({
        prisma: harness.prisma,
        candidateId,
        reviewedByUserId,
    });

test('generation uses current cluster members, ready unlinked articles and inclusive 72-hour boundaries', async () => {
    const state = initialStore();
    state.candidates = [];
    state.articles = [
        { ...article('member'), status: ArticleStatus.CLUSTERED },
        {
            ...article('older-member'),
            status: ArticleStatus.CLUSTERED,
            publishedAt: hours(-100),
        },
        { ...article('after'), publishedAt: hours(72) },
        { ...article('before'), publishedAt: hours(-72) },
        { ...article('approved'), status: ArticleStatus.APPROVED },
        { ...article('fallback'), publishedAt: null },
        {
            ...article('too-late'),
            publishedAt: new Date(hours(72).getTime() + 1),
        },
        {
            ...article('too-early'),
            publishedAt: new Date(hours(-72).getTime() - 1),
        },
        { ...article('unprepared'), status: ArticleStatus.NEEDS_REVIEW },
        article('already-linked'),
        article('empty', []),
        article('zero', [0, 0]),
        article('null', null),
        article('nan', [NaN, 0]),
        article('infinite', [Infinity, 0]),
        article('wrong-dimensions', [1, 0, 0]),
        article('unlinked-wrong-dimensions', [1, 0, 0]),
        article('different-topic', [0, 1]),
    ];
    state.clusters.push(
        { ...cluster('archived'), status: ClusterStatus.ARCHIVED },
        cluster('empty-cluster'),
        cluster('mixed-dimensions'),
    );
    state.links.push(
        link('older-member'),
        link('already-linked', 'archived'),
        link('member', 'mixed-dimensions'),
        link('wrong-dimensions', 'mixed-dimensions'),
    );
    const harness = makePrismaDouble(state);
    const result = await generateArticleClusterCandidates({
        prisma: harness.prisma,
    });
    const generated = harness.getState().candidates;

    assert.deepEqual(generated.map((row) => row.articleId).sort(), [
        'after',
        'approved',
        'before',
        'fallback',
    ]);
    assert.ok(
        generated.every(
            (row) =>
                row.clusterId === 'cluster' && Math.abs(row.score - 1) < 1e-12,
        ),
    );
    assert.equal(result.meta.candidatesCreated, 4);
    assert.equal(result.meta.similarityThreshold, 0.759);
    assert.equal(result.meta.timeWindowHours, 72);
});

test('regeneration preserves reviewed pairs and replaces only pending candidates', async () => {
    const state = initialStore();
    state.articles.push(article('rejected'), article('fresh'));
    state.candidates = [
        {
            ...candidate('accepted'),
            status: CandidateStatus.ACCEPTED,
            reviewedByUserId: 'first-reviewer',
            reviewedAt: date,
        },
        {
            ...candidate('rejected', 'rejected'),
            status: CandidateStatus.REJECTED,
            reviewedByUserId: 'second-reviewer',
            reviewedAt: date,
        },
        candidate('obsolete', 'removed-article'),
    ];
    const harness = makePrismaDouble(state);
    const result = await generateArticleClusterCandidates({
        prisma: harness.prisma,
    });
    assert.deepEqual(
        harness.getState().candidates.slice(0, 2),
        state.candidates.slice(0, 2),
    );
    assert.equal(harness.getState().candidates.length, 3);
    assert.equal(harness.getState().candidates[2].articleId, 'fresh');
    assert.equal(result.meta.candidatesCreated, 1);
});

test('generation rolls back delete/insert failures and clears stale pending results for empty input', async () => {
    for (const failure of ['candidate-delete', 'candidate-create'] as const) {
        const harness = makePrismaDouble(initialStore(), { failure });
        const before = harness.getState();
        await assert.rejects(
            generateArticleClusterCandidates({ prisma: harness.prisma }),
            (error) => error === harness.failureError,
        );
        assert.deepEqual(harness.getState(), before);
    }
    const state = initialStore();
    state.articles[1].embedding = [];
    state.candidates.push({
        ...candidate('reviewed', 'old'),
        status: CandidateStatus.REJECTED,
    });
    const harness = makePrismaDouble(state);
    const result = await generateArticleClusterCandidates({
        prisma: harness.prisma,
    });
    assert.equal(result.meta.candidatesCreated, 0);
    assert.deepEqual(harness.getState().candidates, [state.candidates[1]]);
});

test('acceptance appends one AUTO link with fresh confidence and updates the published cluster without rewriting its contents', async () => {
    const state = initialStore();
    state.clusters[0].status = ClusterStatus.PUBLISHED;
    state.clusters[0].publishedAt = hours(-24);
    const harness = makePrismaDouble(state);
    await accept(harness);
    const saved = harness.getState();
    assert.equal(saved.candidates[0].status, CandidateStatus.ACCEPTED);
    assert.equal(saved.candidates[0].reviewedByUserId, 'reviewer');
    assert.ok(saved.candidates[0].reviewedAt instanceof Date);
    assert.equal(saved.articles[1].status, ArticleStatus.CLUSTERED);
    assert.deepEqual(saved.links[0], state.links[0]);
    assert.equal(saved.links.length, 2);
    assert.equal(saved.links[1].isPrimary, false);
    assert.equal(saved.links[1].method, ClusterArticleMethod.AUTO);
    assert.equal(saved.links[1].addedByUserId, 'reviewer');
    assert.ok(Math.abs(saved.links[1].confidence - 0.8) < 1e-12);
    assert.equal(saved.clusters[0].status, ClusterStatus.UPDATED);
    assert.deepEqual(
        saved.clusters[0].publishedAt,
        state.clusters[0].publishedAt,
    );
    assert.deepEqual(saved.clusters[0].blocks, state.clusters[0].blocks);
    assert.deepEqual(saved.clusters[0].embedding, [0.9, 0.3]);
    await assert.rejects(accept(harness, 'candidate', 'other-reviewer'));
    assert.deepEqual(harness.getState(), saved);
});

test(
    'overlapping acceptances of the same or different candidates for one article produce one winner',
    { timeout: 5000 },
    async () => {
        for (const differentCandidate of [false, true]) {
            const state = initialStore();
            if (differentCandidate) {
                state.clusters.push(cluster('other'));
                state.links.push(link('member', 'other'));
                state.candidates.push(candidate('second', 'new', 'other'));
            }
            const harness = makePrismaDouble(state, { pauseCreate: true });
            const first = accept(harness);
            await harness.createStarted;
            const second = accept(
                harness,
                differentCandidate ? 'second' : 'candidate',
                'other-reviewer',
            );
            const completed = Promise.allSettled([first, second]);
            try {
                await harness.secondTransactionStarted;
                assert.deepEqual(harness.getState(), state);
            } finally {
                harness.releaseCreate();
            }
            const results = await completed;
            assert.deepEqual(
                results.map((result) => result.status),
                ['fulfilled', 'rejected'],
            );
            const saved = harness.getState();
            assert.equal(
                saved.links.filter((row) => row.articleId === 'new').length,
                1,
            );
            assert.equal(
                saved.candidates.filter(
                    (row) => row.status === CandidateStatus.ACCEPTED,
                ).length,
                1,
            );
            if (differentCandidate)
                assert.equal(
                    saved.candidates[1].status,
                    CandidateStatus.PENDING,
                );
        }
    },
);

test(
    'generation planned during acceptance cannot restore the accepted pair to pending',
    { timeout: 5000 },
    async () => {
        const harness = makePrismaDouble(initialStore(), { pauseCreate: true });
        const acceptance = accept(harness, 'candidate', 'winning-reviewer');
        await harness.createStarted;

        // Generation reads the committed ready article before acceptance
        // finishes, so its proposal for this pair will already be stale.
        const generation = generateArticleClusterCandidates({
            prisma: harness.prisma,
        });
        const completed = Promise.all([acceptance, generation]);
        try {
            await harness.secondTransactionStarted;
            assert.equal(
                harness.getState().articles[1].status,
                ArticleStatus.EMBEDDED,
            );
            assert.equal(
                harness.getState().candidates[0].status,
                CandidateStatus.PENDING,
            );
        } finally {
            harness.releaseCreate();
        }

        const [, generated] = await completed;
        const saved = harness.getState();
        assert.equal(generated.meta.articlesChecked, 1);
        assert.equal(generated.meta.clustersChecked, 1);
        assert.equal(generated.meta.candidatesCreated, 0);
        assert.equal(saved.candidates.length, 1);
        assert.equal(saved.candidates[0].id, 'candidate');
        assert.equal(saved.candidates[0].status, CandidateStatus.ACCEPTED);
        assert.equal(saved.candidates[0].reviewedByUserId, 'winning-reviewer');
        assert.ok(saved.candidates[0].reviewedAt instanceof Date);
        assert.equal(
            saved.links.filter((row) => row.articleId === 'new').length,
            1,
        );
    },
);

test('acceptance rechecks missing, processed, linked, unprepared and stale recommendations without partial writes', async () => {
    const cases: [string, (state: Store) => void][] = [
        [
            'missing',
            (state) => {
                state.candidates = [];
            },
        ],
        [
            'reviewed',
            (state) => {
                state.candidates[0].status = CandidateStatus.REJECTED;
            },
        ],
        [
            'archived',
            (state) => {
                state.clusters[0].status = ClusterStatus.ARCHIVED;
            },
        ],
        [
            'unprepared',
            (state) => {
                state.articles[1].status = ArticleStatus.NEEDS_REVIEW;
            },
        ],
        [
            'linked',
            (state) => {
                state.links.push(link('new'));
            },
        ],
        [
            'invalid vector',
            (state) => {
                state.articles[1].embedding = [0, 0];
            },
        ],
        [
            'no cluster members',
            (state) => {
                state.links = [];
            },
        ],
        [
            'expired',
            (state) => {
                state.articles[1].publishedAt = hours(73);
            },
        ],
        [
            'topic changed',
            (state) => {
                state.articles[1].embedding = [0, 1];
            },
        ],
        [
            'dimensions changed',
            (state) => {
                state.articles[1].embedding = [1, 0, 0];
            },
        ],
    ];
    for (const [name, change] of cases) {
        const state = initialStore();
        change(state);
        const harness = makePrismaDouble(state);
        await assert.rejects(accept(harness), name);
        assert.deepEqual(harness.getState(), state, name);
    }
});

test('failed acceptance restores candidate, article, cluster and links and can then be retried', async () => {
    for (const failure of ['link-create', 'cluster-update'] as const) {
        const state = initialStore();
        const harness = makePrismaDouble(state, { failure });
        await assert.rejects(
            accept(harness),
            (error) => error === harness.failureError,
        );
        assert.deepEqual(harness.getState(), state);
        harness.clearFailure();
        await accept(harness, 'candidate', 'retry-reviewer');
        assert.equal(harness.getState().links.length, state.links.length + 1);
        assert.equal(
            harness.getState().candidates[0].reviewedByUserId,
            'retry-reviewer',
        );
    }
});

test('listing excludes unavailable articles before pagination and rejected pairs stay rejected after regeneration', async () => {
    const state = initialStore();
    state.articles.push(article('second'), {
        ...article('stale'),
        status: ArticleStatus.REJECTED,
    });
    state.candidates.push(candidate('second', 'second'), {
        ...candidate('stale', 'stale'),
        score: 1,
    });
    const harness = makePrismaDouble(state);
    const listed = await listArticleClusterCandidates({
        prisma: harness.prisma,
        page: 2,
        limit: 1,
    });
    assert.equal(listed.pagination.total, 2);
    assert.equal(listed.pagination.page, 2);
    assert.equal(listed.pagination.totalPages, 2);
    assert.equal(listed.candidates.length, 1);
    assert.notEqual(listed.candidates[0].id, 'stale');
    await rejectArticleClusterCandidate({
        prisma: harness.prisma,
        candidateId: 'candidate',
        reviewedByUserId: 'rejecting-reviewer',
    });
    const reviewed = harness.getState().candidates[0];
    assert.equal(reviewed.status, CandidateStatus.REJECTED);
    assert.equal(reviewed.reviewedByUserId, 'rejecting-reviewer');
    assert.ok(reviewed.reviewedAt instanceof Date);
    await assert.rejects(
        rejectArticleClusterCandidate({
            prisma: harness.prisma,
            candidateId: 'candidate',
            reviewedByUserId: 'other-reviewer',
        }),
    );
    await generateArticleClusterCandidates({ prisma: harness.prisma });
    assert.deepEqual(
        harness.getState().candidates.find((row) => row.id === 'candidate'),
        reviewed,
    );
    assert.equal(
        harness.getState().candidates.filter((row) => row.articleId === 'new')
            .length,
        1,
    );
});
