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

import { acceptClusterCandidate } from '../src/core/clustering/acceptClusterCandidate';

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

const makeCandidate = (status: CandidateStatus = CandidateStatus.PENDING) => ({
    id: 'candidate-1',
    title: '  Candidate title  ',
    summary: '  Candidate summary  ',
    status,
    startDate: new Date('2026-09-01T12:00:00Z'),
    reviewedByUserId:
        status === CandidateStatus.PENDING ? null : 'original-reviewer',
    reviewedAt:
        status === CandidateStatus.PENDING
            ? null
            : new Date('2026-09-01T13:00:00Z'),
    articles: ['article-1', 'article-2'].map((articleId, index) => ({
        articleId,
        confidence: 0.9 - index / 10,
        isPrimary: false,
        position: index + 1,
        article: { id: articleId, title: `Title ${articleId}` },
    })),
});

interface ClusterCreateData {
    humanId: string;
    title: string;
    summary: string | null;
    status: ClusterStatus;
    createdByUserId: string;
    articleLinks: {
        create: {
            articleId: string;
            addedByUserId: string;
            isPrimary: boolean;
            confidence: number | null;
            method: ClusterArticleMethod;
        }[];
    };
}

interface Store {
    candidate: ReturnType<typeof makeCandidate> | null;
    clusters: { id: string; data: ClusterCreateData }[];
    articleStatuses: Record<string, ArticleStatus>;
    existingArticleLinks: string[];
}

type Failure = 'create' | 'article-update';

function makePrismaDouble(
    candidate: Store['candidate'] = makeCandidate(),
    options: {
        failure?: Failure;
        pauseFirstCreate?: boolean;
        existingArticleLinks?: string[];
        articleStatuses?: Record<string, ArticleStatus>;
    } = {},
) {
    let committed: Store = {
        candidate: structuredClone(candidate),
        clusters: [],
        articleStatuses: {
            'article-1': ArticleStatus.APPROVED,
            'article-2': ArticleStatus.EMBEDDED,
            unrelated: ArticleStatus.NEW,
            ...options.articleStatuses,
        },
        existingArticleLinks: options.existingArticleLinks ?? [],
    };
    let failure = options.failure;
    let rowLock = Promise.resolve();
    const firstCreateStarted = deferred();
    const secondClaimStarted = deferred();
    const createGate = deferred();
    const calls = { transactions: 0, claims: 0, creates: 0, articleUpdates: 0 };
    const failureError = new Error('Injected persistence failure');
    const outsideTransaction = async () => {
        assert.fail('Acceptance must use the transaction client');
    };

    // Model a locked candidate row and staged writes to check the application's
    // transaction boundary. This is not a PostgreSQL integration test.
    const prisma = {
        clusterCandidate: {
            findUnique: outsideTransaction,
            updateMany: outsideTransaction,
        },
        cluster: { create: outsideTransaction },
        article: { updateMany: outsideTransaction },
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
            calls.transactions += 1;
            let staged: Store | undefined;
            let releaseRow: (() => void) | undefined;
            const state = () => {
                assert.ok(
                    staged,
                    'Claim the candidate before reading or saving',
                );
                return staged;
            };
            const tx = {
                clusterCandidate: {
                    updateMany: async ({
                        where,
                        data,
                    }: {
                        where: { id: string; status: CandidateStatus };
                        data: {
                            status: CandidateStatus;
                            reviewedByUserId: string;
                            reviewedAt: Date;
                        };
                    }) => {
                        assert.equal(staged, undefined, 'Claim only once');
                        assert.equal(where.status, CandidateStatus.PENDING);
                        assert.equal(data.status, CandidateStatus.ACCEPTED);
                        calls.claims += 1;
                        if (calls.claims === 2) secondClaimStarted.resolve();

                        const previousLock = rowLock;
                        const nextLock = deferred();
                        rowLock = nextLock.promise;
                        releaseRow = nextLock.resolve;
                        await previousLock;
                        staged = structuredClone(committed);

                        if (
                            staged.candidate?.id !== where.id ||
                            staged.candidate.status !== where.status
                        ) {
                            return { count: 0 };
                        }

                        Object.assign(staged.candidate, data);
                        return { count: 1 };
                    },
                    findUnique: async ({
                        where,
                    }: {
                        where: { id: string };
                    }) => {
                        const current = state().candidate;
                        return current?.id === where.id
                            ? structuredClone(current)
                            : null;
                    },
                },
                cluster: {
                    create: async ({ data }: { data: ClusterCreateData }) => {
                        const current = state();
                        assert.equal(
                            current.candidate?.status,
                            CandidateStatus.ACCEPTED,
                        );
                        for (const article of data.articleLinks.create) {
                            assert.equal(
                                current.articleStatuses[article.articleId],
                                ArticleStatus.CLUSTERED,
                            );
                        }
                        calls.creates += 1;
                        if (calls.creates === 1) {
                            firstCreateStarted.resolve();
                            if (options.pauseFirstCreate)
                                await createGate.promise;
                        }
                        if (failure === 'create') throw failureError;

                        const id = `cluster-${calls.creates}`;
                        current.clusters.push({
                            id,
                            data: structuredClone(data),
                        });
                        return { id, ...data };
                    },
                },
                article: {
                    updateMany: async ({
                        where,
                        data,
                    }: {
                        where: {
                            id: { in: string[] };
                            status: { in: ArticleStatus[] };
                            clusterLinks: { none: object };
                        };
                        data: { status: ArticleStatus };
                    }) => {
                        const current = state();
                        calls.articleUpdates += 1;
                        if (failure === 'article-update') throw failureError;
                        assert.deepEqual(where.status.in, [
                            ArticleStatus.APPROVED,
                            ArticleStatus.EMBEDDED,
                        ]);
                        assert.deepEqual(where.clusterLinks, { none: {} });
                        const eligibleIds = where.id.in.filter(
                            (id) =>
                                where.status.in.includes(
                                    current.articleStatuses[id],
                                ) &&
                                !current.existingArticleLinks.includes(id) &&
                                !current.clusters.some((cluster) =>
                                    cluster.data.articleLinks.create.some(
                                        (link) => link.articleId === id,
                                    ),
                                ),
                        );
                        for (const id of eligibleIds) {
                            current.articleStatuses[id] = data.status;
                        }
                        return { count: eligibleIds.length };
                    },
                },
            } as unknown as Prisma.TransactionClient;

            try {
                const result = await run(tx);
                committed = state();
                return result;
            } finally {
                releaseRow?.();
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
        firstCreateStarted: firstCreateStarted.promise,
        secondClaimStarted: secondClaimStarted.promise,
        releaseFirstCreate: createGate.resolve,
    };
}

const accept = (
    harness: ReturnType<typeof makePrismaDouble>,
    reviewedByUserId = 'reviewer-1',
    candidateId = 'candidate-1',
) =>
    acceptClusterCandidate({
        prisma: harness.prisma,
        candidateId,
        reviewedByUserId,
    });

test('accepts once with article links and reviewer metadata, then rejects a repeated request', async () => {
    const harness = makePrismaDouble();
    const result = await accept(harness);
    const saved = harness.getState();

    assert.equal(result.id, 'cluster-1');
    assert.ok(saved.candidate);
    assert.equal(saved.candidate.status, CandidateStatus.ACCEPTED);
    assert.equal(saved.candidate.reviewedByUserId, 'reviewer-1');
    assert.ok(saved.candidate.reviewedAt instanceof Date);
    assert.equal(saved.clusters.length, 1);
    const data = saved.clusters[0].data;
    assert.equal(data.title, 'Candidate title');
    assert.equal(data.summary, 'Candidate summary');
    assert.equal(data.status, ClusterStatus.DRAFT);
    assert.equal(data.createdByUserId, 'reviewer-1');
    assert.deepEqual(
        data.articleLinks.create,
        makeCandidate().articles.map((article, index) => ({
            articleId: article.articleId,
            addedByUserId: 'reviewer-1',
            isPrimary: index === 0,
            confidence: article.confidence,
            method: ClusterArticleMethod.AUTO,
        })),
    );
    assert.deepEqual(saved.articleStatuses, {
        'article-1': ArticleStatus.CLUSTERED,
        'article-2': ArticleStatus.CLUSTERED,
        unrelated: ArticleStatus.NEW,
    });

    await assert.rejects(accept(harness, 'reviewer-2'), {
        message: 'Only pending cluster candidates can be accepted',
    });
    assert.equal(harness.calls.creates, 1);
    assert.equal(harness.calls.articleUpdates, 1);
    assert.deepEqual(harness.getState(), saved);
});

test(
    'overlapping requests produce one winner while the second waits for the candidate claim',
    { timeout: 5000 },
    async () => {
        const harness = makePrismaDouble(makeCandidate(), {
            pauseFirstCreate: true,
        });
        const before = harness.getState();
        const first = accept(harness, 'reviewer-1');
        await harness.firstCreateStarted;
        const second = accept(harness, 'reviewer-2');
        const completed = Promise.allSettled([first, second]);

        try {
            await harness.secondClaimStarted;
            assert.equal(harness.calls.transactions, 2);
            assert.equal(harness.calls.creates, 1);
            assert.deepEqual(harness.getState(), before);
        } finally {
            harness.releaseFirstCreate();
        }

        const [winner, loser] = await completed;
        assert.equal(winner.status, 'fulfilled');
        assert.ok(loser.status === 'rejected');
        assert.equal(
            loser.reason.message,
            'Only pending cluster candidates can be accepted',
        );
        assert.equal(harness.calls.creates, 1);
        assert.equal(harness.calls.articleUpdates, 1);
        const saved = harness.getState();
        assert.equal(saved.clusters.length, 1);
        assert.equal(saved.candidate?.reviewedByUserId, 'reviewer-1');
    },
);

test('persistence failures roll back the claim, cluster and article statuses so acceptance can be retried', async () => {
    for (const failure of ['create', 'article-update'] as const) {
        const harness = makePrismaDouble(makeCandidate(), { failure });
        const before = harness.getState();

        await assert.rejects(
            accept(harness),
            (error) => error === harness.failureError,
        );
        assert.equal(harness.calls.creates, failure === 'create' ? 1 : 0);
        assert.equal(harness.calls.articleUpdates, 1);
        assert.deepEqual(harness.getState(), before);

        harness.clearFailure();
        await accept(harness, 'retry-reviewer');
        assert.equal(harness.getState().clusters.length, 1);
        assert.equal(
            harness.getState().candidate?.reviewedByUserId,
            'retry-reviewer',
        );
    }
});

test('keeps existing errors for missing, processed, empty and invalid candidates without creating clusters', async () => {
    const cases = [
        {
            candidate: null,
            id: 'candidate-1',
            message: 'Cluster candidate not found',
        },
        ...[CandidateStatus.ACCEPTED, CandidateStatus.REJECTED].map(
            (status) => ({
                candidate: makeCandidate(status),
                id: 'candidate-1',
                message: 'Only pending cluster candidates can be accepted',
            }),
        ),
        {
            candidate: { ...makeCandidate(), articles: [] },
            id: 'candidate-1',
            message: 'Cluster candidate has no articles',
        },
        {
            candidate: makeCandidate(),
            id: ' ',
            message: 'Candidate ID is required',
        },
    ];

    for (const entry of cases) {
        const harness = makePrismaDouble(entry.candidate);
        const before = harness.getState();
        await assert.rejects(accept(harness, 'reviewer-1', entry.id), {
            message: entry.message,
        });
        assert.equal(harness.calls.creates, 0);
        assert.equal(harness.calls.articleUpdates, 0);
        assert.deepEqual(harness.getState(), before);
        if (!entry.id.trim()) assert.equal(harness.calls.transactions, 0);
    }
});

test('rejects a stale group after an article was assigned to an existing cluster, rolling back all claims', async () => {
    for (const options of [
        { articleStatuses: { 'article-1': ArticleStatus.CLUSTERED } },
        { existingArticleLinks: ['article-1'] },
    ]) {
        const harness = makePrismaDouble(makeCandidate(), options);
        const before = harness.getState();

        await assert.rejects(accept(harness), {
            message:
                'Some candidate articles are no longer available for clustering. Generate candidates again.',
        });
        assert.equal(harness.calls.creates, 0);
        assert.equal(harness.calls.articleUpdates, 1);
        assert.deepEqual(harness.getState(), before);
    }
});
