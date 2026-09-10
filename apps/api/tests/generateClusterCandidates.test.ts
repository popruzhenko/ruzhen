import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    CandidateStatus,
    type Article,
    type Prisma,
    type PrismaClient,
} from '@prisma/client';

import { generateClusterCandidates } from '../src/core/clustering/generateClusterCandidates';

interface CandidateRow {
    id: string;
    status: CandidateStatus;
}

interface CandidateArticleRow {
    candidateId: string;
    articleId: string;
    confidence: number | null;
    isPrimary: boolean;
    position: number;
}

interface CandidateStore {
    candidates: CandidateRow[];
    articles: CandidateArticleRow[];
}

const makeArticle = (id: string, embedding: number[]): Article => ({
    id,
    sourceId: 'source-1',
    url: `https://example.test/articles/${id}`,
    title: `Article ${id}`,
    summary: null,
    content: null,
    cleanedAccessibleText: null,
    imageUrl: null,
    publishedAt: new Date('2026-09-01T12:00:00Z'),
    language: null,
    country: null,
    status: ArticleStatus.EMBEDDED,
    contentAvailability: null,
    embeddingBasis: null,
    cleaningMethod: null,
    embeddingModel: null,
    embedding,
    createdAt: new Date('2026-09-01T12:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
});

const groupedArticles = () => [
    makeArticle('a-1', [1, 0]),
    makeArticle('a-2', [1, 0]),
    makeArticle('b-1', [0, 1]),
    makeArticle('b-2', [0, 1]),
];

function makePrismaDouble(
    articles: Article[],
    failure?: 'delete' | 'second-create',
) {
    const initialCandidates: CandidateRow[] = [
        { id: 'old-pending', status: CandidateStatus.PENDING },
        { id: 'old-accepted', status: CandidateStatus.ACCEPTED },
        { id: 'old-rejected', status: CandidateStatus.REJECTED },
    ];
    let committed: CandidateStore = {
        candidates: initialCandidates,
        articles: initialCandidates.map((candidate) => ({
            candidateId: candidate.id,
            articleId: `${candidate.id}-article`,
            confidence: null,
            isPrimary: true,
            position: 1,
        })),
    };
    const calls = { transactions: 0, deletes: 0, creates: 0 };
    const failureError = new Error(`Injected ${failure} failure`);
    const outsideTransaction = async () => {
        assert.fail('Candidate writes must use the transaction client');
    };

    // Stage writes on a separate store to observe the application's transaction
    // boundary. This double does not exercise PostgreSQL or Prisma rollback.
    const prisma = {
        article: {
            findMany: async () => articles,
        },
        clusterCandidate: {
            deleteMany: outsideTransaction,
            create: outsideTransaction,
        },
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
            calls.transactions += 1;
            const staged = structuredClone(committed);
            const tx = {
                clusterCandidate: {
                    deleteMany: async ({
                        where,
                    }: {
                        where: { status: CandidateStatus };
                    }) => {
                        calls.deletes += 1;
                        assert.deepEqual(where, {
                            status: CandidateStatus.PENDING,
                        });

                        if (failure === 'delete') {
                            throw failureError;
                        }

                        const previousCount = staged.candidates.length;
                        staged.candidates = staged.candidates.filter(
                            (candidate) => candidate.status !== where.status,
                        );
                        const retainedIds = new Set(
                            staged.candidates.map((candidate) => candidate.id),
                        );
                        staged.articles = staged.articles.filter((article) =>
                            retainedIds.has(article.candidateId),
                        );

                        return {
                            count: previousCount - staged.candidates.length,
                        };
                    },
                    create: async ({
                        data,
                    }: {
                        data: {
                            status: CandidateStatus;
                            articles: {
                                create: Omit<
                                    CandidateArticleRow,
                                    'candidateId'
                                >[];
                            };
                        };
                    }) => {
                        calls.creates += 1;

                        if (
                            failure === 'second-create' &&
                            calls.creates === 2
                        ) {
                            throw failureError;
                        }

                        const candidate = {
                            id: `new-${calls.creates}`,
                            status: data.status,
                        };
                        staged.candidates.push(candidate);
                        staged.articles.push(
                            ...data.articles.create.map((article) => ({
                                ...article,
                                candidateId: candidate.id,
                            })),
                        );

                        return candidate;
                    },
                },
            } as unknown as Prisma.TransactionClient;

            const result = await run(tx);
            committed = staged;
            return result;
        },
    } as unknown as PrismaClient;

    return {
        prisma,
        calls,
        failureError,
        getState: () => structuredClone(committed),
    };
}

test('replaces pending candidates and their links in one transaction, preserving reviewed candidates', async () => {
    const harness = makePrismaDouble(groupedArticles());
    const before = harness.getState();

    const result = await generateClusterCandidates({ prisma: harness.prisma });

    assert.deepEqual(harness.calls, {
        transactions: 1,
        deletes: 1,
        creates: 2,
    });
    assert.deepEqual(result.meta, {
        articlesChecked: 4,
        clustersBuilt: 2,
        candidatesCreated: 2,
    });
    assert.deepEqual(
        result.candidates.map((candidate) => candidate.id),
        ['new-1', 'new-2'],
    );
    const after = harness.getState();
    assert.deepEqual(after.candidates, [
        ...before.candidates.slice(1),
        { id: 'new-1', status: CandidateStatus.PENDING },
        { id: 'new-2', status: CandidateStatus.PENDING },
    ]);
    assert.deepEqual(
        after.articles.filter((article) =>
            article.candidateId.startsWith('old-'),
        ),
        before.articles.slice(1),
    );
    assert.deepEqual(
        ['new-1', 'new-2'].map((candidateId) =>
            after.articles
                .filter((article) => article.candidateId === candidateId)
                .map((article) => article.articleId)
                .sort(),
        ),
        [
            ['a-1', 'a-2'],
            ['b-1', 'b-2'],
        ],
    );
});

test('propagates a later insert failure without committing deleted candidates or partial new links', async () => {
    const harness = makePrismaDouble(groupedArticles(), 'second-create');
    const before = harness.getState();

    await assert.rejects(
        generateClusterCandidates({ prisma: harness.prisma }),
        (error) => error === harness.failureError,
    );

    assert.deepEqual(harness.calls, {
        transactions: 1,
        deletes: 1,
        creates: 2,
    });
    assert.deepEqual(harness.getState(), before);
});

test('propagates a delete failure without attempting inserts or changing the stored list', async () => {
    const harness = makePrismaDouble(groupedArticles(), 'delete');
    const before = harness.getState();

    await assert.rejects(
        generateClusterCandidates({ prisma: harness.prisma }),
        (error) => error === harness.failureError,
    );

    assert.deepEqual(harness.calls, {
        transactions: 1,
        deletes: 1,
        creates: 0,
    });
    assert.deepEqual(harness.getState(), before);
});

test('preserves the current list without a transaction when no valid articles are available', async () => {
    for (const articles of [[], [makeArticle('invalid-embedding', [])]]) {
        const harness = makePrismaDouble(articles);
        const before = harness.getState();

        const result = await generateClusterCandidates({
            prisma: harness.prisma,
        });

        assert.deepEqual(result, {
            candidates: [],
            meta: {
                articlesChecked: 0,
                clustersBuilt: 0,
                candidatesCreated: 0,
            },
        });
        assert.deepEqual(harness.calls, {
            transactions: 0,
            deletes: 0,
            creates: 0,
        });
        assert.deepEqual(harness.getState(), before);
    }
});

test('preserves successful empty replacement when all generated groups are below the minimum size', async () => {
    const harness = makePrismaDouble([makeArticle('single-article', [1, 0])]);
    const before = harness.getState();

    const result = await generateClusterCandidates({ prisma: harness.prisma });

    assert.deepEqual(result, {
        candidates: [],
        meta: { articlesChecked: 1, clustersBuilt: 1, candidatesCreated: 0 },
    });
    assert.deepEqual(harness.calls, {
        transactions: 1,
        deletes: 1,
        creates: 0,
    });
    assert.deepEqual(harness.getState(), {
        candidates: before.candidates.slice(1),
        articles: before.articles.slice(1),
    });
});
