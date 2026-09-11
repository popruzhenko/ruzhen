import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
    executeClusterBulkItem,
    parseClusterBulkExecution,
    parseClusterBulkPreview,
    previewClusterBulk,
    type ClusterBulkAction,
    type ClusterBulkItem,
} from '../src/core/clusterBulk';
import {
    clusterBulkItem,
    clusterBulkRevision,
    type ClusterBulkSnapshot,
} from '../src/core/clusterBulk/revision';
import { getClusterPublicationErrors } from '../src/core/publication/clusterReadiness';
import { generateAnalyzedNewsForCluster } from '../src/core/contextualization/generateAnalyzedNewsForCluster';

type Row = Record<string, any>;
const initialTime = new Date('2026-09-11T10:00:00Z');
function makeCluster(id = 'cluster-a', changes: Row = {}): Row {
    return {
        id,
        humanId: `human-${id}`,
        title: 'Original editorial title',
        summary: 'Original editorial summary',
        mainCountry: 'BE',
        startDate: initialTime,
        status: 'DRAFT',
        publishedAt: null,
        createdAt: initialTime,
        updatedAt: initialTime,
        blocks: ['FACT', 'CONTEXT'].map((type, index) => ({
            id: `${id}-block-${index}`,
            clusterId: id,
            type,
            title: `${type} title`,
            content: `Original ${type} content.`,
            position: index + 1,
            sourceName: 'Publisher',
            sourceUrl: 'https://example.com/article',
            authorName: null,
            stance: null,
            createdByUserId: 'editor',
            createdAt: initialTime,
            updatedAt: initialTime,
        })),
        articleLinks: [
            {
                articleId: 'article-a',
                addedByUserId: 'editor',
                addedAt: initialTime,
                isPrimary: true,
                confidence: 0.9,
                method: 'MANUAL',
                article: {
                    id: 'article-a',
                    updatedAt: initialTime,
                    sourceId: 'publisher',
                    title: 'Source headline',
                    summary: 'Source summary',
                    content: 'Source article body.',
                    cleanedAccessibleText: null,
                    url: 'https://example.com/article',
                    publishedAt: initialTime,
                    country: 'BE',
                    language: 'en',
                    source: { id: 'publisher', name: 'Publisher' },
                },
            },
        ],
        ...changes,
    };
}

const snapshot = (cluster: Row) =>
    clusterBulkItem(cluster as ClusterBulkSnapshot);
const draftResponse = JSON.stringify({
    title: 'Generated analytical title',
    summary: 'Generated analytical summary',
    blocks: [
        { type: 'FACT', content: 'The report establishes the verified facts.' },
        {
            type: 'CONTEXT',
            content: 'The preceding decisions explain the context.',
        },
    ],
});

// Models serialized commit/rollback and records SQL lock order; it does not
// execute PostgreSQL or call an external generation service.
function database(clusters: Row[]) {
    let state = structuredClone(clusters);
    let queue = Promise.resolve();
    let failBlock = false;
    let sequence = 0;
    const calls = {
        locks: [] as string[],
        reads: [] as Row[],
        writes: 0,
        transactions: 0,
    };
    const client = (get: () => Row[]) => ({
        $queryRaw: async (sql: Prisma.Sql) => {
            const clusterId = String(sql.values[0]);
            const cluster = get().find(({ id }) => id === clusterId);
            if (/FROM "Cluster" WHERE/.test(sql.sql)) {
                assert.match(sql.sql, /FOR UPDATE/);
                calls.locks.push('cluster');
                return cluster ? [{ id: clusterId }] : [];
            }
            if (/FROM "ClusterBlock"/.test(sql.sql)) {
                assert.match(sql.sql, /ORDER BY "id" ASC FOR UPDATE/);
                calls.locks.push('blocks');
                return cluster?.blocks.map(({ id }: Row) => ({ id })) ?? [];
            }
            if (/FROM "ClusterArticle" WHERE/.test(sql.sql)) {
                assert.match(sql.sql, /ORDER BY "articleId" ASC FOR UPDATE/);
                calls.locks.push('links');
                return [];
            }
            if (/FROM "Source" s/.test(sql.sql)) {
                assert.match(sql.sql, /FOR SHARE OF s/);
                calls.locks.push('sources');
                return [];
            }
            assert.match(sql.sql, /FOR SHARE OF a/);
            calls.locks.push('articles');
            return [];
        },
        cluster: {
            findMany: async (args: Row) => {
                calls.reads.push(args);
                assert.deepEqual(args.where, {
                    status: { in: ['DRAFT', 'UPDATED'] },
                });
                assert.deepEqual(args.orderBy, { id: 'asc' });
                const matching = get()
                    .filter((cluster) =>
                        args.where.status.in.includes(cluster.status),
                    )
                    .sort((a, b) => a.id.localeCompare(b.id));
                const offset = args.cursor
                    ? matching.findIndex(({ id }) => id === args.cursor.id) +
                      args.skip
                    : 0;
                return structuredClone(
                    matching.slice(offset, offset + args.take),
                );
            },
            findUnique: async ({ where }: Row) =>
                structuredClone(
                    get().find(({ id }) => id === where.id) ?? null,
                ),
            update: async ({ where, data }: Row) => {
                const cluster = get().find(({ id }) => id === where.id);
                assert.ok(cluster);
                Object.assign(cluster, data);
                if (!data.updatedAt)
                    cluster.updatedAt = new Date(
                        cluster.updatedAt.getTime() + 1,
                    );
                calls.writes++;
                return structuredClone(cluster);
            },
        },
        clusterBlock: {
            deleteMany: async ({ where }: Row) => {
                const cluster = get().find(({ id }) => id === where.clusterId);
                assert.ok(cluster);
                const count = cluster.blocks.length;
                cluster.blocks = [];
                calls.writes++;
                return { count };
            },
            create: async ({ data }: Row) => {
                if (failBlock)
                    throw new Error('Injected block storage failure');
                const cluster = get().find(({ id }) => id === data.clusterId);
                assert.ok(cluster);
                const block = {
                    ...data,
                    id: `generated-${++sequence}`,
                    createdAt: initialTime,
                    updatedAt: initialTime,
                };
                cluster.blocks.push(block);
                calls.writes++;
                return structuredClone(block);
            },
            findMany: async ({ where }: Row) => {
                const cluster = get().find(({ id }) => id === where.clusterId);
                assert.ok(cluster);
                return structuredClone(cluster.blocks);
            },
        },
    });
    const prisma: any = client(() => state);
    prisma.$transaction = async (
        run: (tx: Prisma.TransactionClient) => Promise<unknown>,
        options: Row = {},
    ) => {
        calls.transactions++;
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        const staged = structuredClone(state);
        try {
            const result = await run(
                client(() => staged) as unknown as Prisma.TransactionClient,
            );
            state = staged;
            if (calls.reads.length && options.isolationLevel)
                assert.equal(options.isolationLevel, 'RepeatableRead');
            return result;
        } finally {
            release();
        }
    };
    return {
        prisma: prisma as PrismaClient,
        calls,
        get: () => structuredClone(state),
        edit: (mutate: (clusters: Row[]) => void) => mutate(state),
        failBlocks: () => {
            failBlock = true;
        },
    };
}

const execute = (
    db: ReturnType<typeof database>,
    action: ClusterBulkAction,
    item: ClusterBulkItem,
    generate: (prompt: string) => Promise<string> = async () => draftResponse,
) =>
    executeClusterBulkItem({
        prisma: db.prisma,
        action,
        item,
        createdByUserId: 'bulk-editor',
        provider: { generateAnalyzedNews: generate },
    });

test('bulk request validation requires a supported action and exact snapshot item', () => {
    const item = snapshot(makeCluster());
    assert.deepEqual(parseClusterBulkPreview({ action: 'PUBLISH' }), {
        action: 'PUBLISH',
    });
    assert.deepEqual(
        parseClusterBulkExecution({ action: 'CONTEXTUALIZE', item }),
        { action: 'CONTEXTUALIZE', item },
    );
    for (const value of [
        null,
        [],
        {},
        { action: 'DELETE' },
        { action: 'PUBLISH', ids: ['a'] },
    ])
        assert.throws(() => parseClusterBulkPreview(value));
    for (const value of [
        { action: 'PUBLISH' },
        { action: 'DELETE', item },
        { action: 'PUBLISH', item: { ...item, revision: 'old' } },
        { action: 'PUBLISH', item: { ...item, clusterId: ['a'] } },
        { action: 'PUBLISH', item: { ...item, title: null } },
        { action: 'PUBLISH', item, all: true },
    ])
        assert.throws(() => parseClusterBulkExecution(value));
});

test('preview includes all 601 draft/updated clusters beyond list caps and excludes other statuses', async () => {
    const clusters = Array.from({ length: 601 }, (_, index) =>
        makeCluster(`c-${String(index).padStart(4, '0')}`, {
            status: index % 2 ? 'UPDATED' : 'DRAFT',
        }),
    );
    const db = database([
        ...clusters,
        makeCluster('no-sources', { articleLinks: [] }),
        makeCluster('published', { status: 'PUBLISHED' }),
        makeCluster('archived', { status: 'ARCHIVED' }),
    ]);
    const result = await previewClusterBulk({
        prisma: db.prisma,
        action: 'CONTEXTUALIZE',
    });
    assert.equal(result.items.length, 601);
    assert.equal(
        result.items[result.items.length - 1]?.clusterId,
        clusters[600].id,
    );
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].clusterId, 'no-sources');
    assert.match(result.skipped[0].reason, /source articles/);
    assert.equal(db.calls.reads.length, 3);
    assert.ok(
        result.items.every(({ revision }) => /^[0-9a-f]{64}$/.test(revision)),
    );
    assert.equal(db.calls.writes, 0);
    assert.deepEqual(Object.keys(result.items[0]).sort(), [
        'clusterId',
        'humanId',
        'revision',
        'title',
    ]);
});

test('publication preview uses the shared readiness rules and preserves reason details', async () => {
    const valid = makeCluster();
    const invalid = [
        makeCluster('no-title', { title: ' ' }),
        makeCluster('no-summary', { summary: null }),
        makeCluster('no-facts', {
            blocks: valid.blocks.filter((block: Row) => block.type !== 'FACT'),
        }),
        makeCluster('no-context', {
            blocks: valid.blocks.filter(
                (block: Row) => block.type !== 'CONTEXT',
            ),
        }),
        makeCluster('empty-block', {
            blocks: valid.blocks.map((block: Row) => ({
                ...block,
                content: ' \n ',
            })),
        }),
    ];
    const db = database([valid, ...invalid]);
    const result = await previewClusterBulk({
        prisma: db.prisma,
        action: 'PUBLISH',
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.skipped.length, invalid.length);
    for (const cluster of invalid)
        assert.equal(
            result.skipped.find(({ clusterId }) => clusterId === cluster.id)
                ?.reason,
            getClusterPublicationErrors(cluster as ClusterBulkSnapshot).join(
                ' ',
            ),
        );
    assert.equal(db.calls.writes, 0);
});

test('revision includes child content, ordering, membership, primary selection and source versions independent of parent timestamp', () => {
    const original = makeCluster();
    const revision = clusterBulkRevision(original as ClusterBulkSnapshot);
    const reordered = structuredClone(original);
    reordered.blocks.reverse();
    assert.equal(
        clusterBulkRevision(reordered as ClusterBulkSnapshot),
        revision,
    );
    for (const mutate of [
        (cluster: Row) => {
            cluster.blocks[0].content = 'A manual block edit.';
        },
        (cluster: Row) => {
            cluster.blocks[0].position = 5;
        },
        (cluster: Row) => {
            cluster.articleLinks = [];
        },
        (cluster: Row) => {
            cluster.articleLinks[0].isPrimary = false;
        },
        (cluster: Row) => {
            cluster.articleLinks[0].confidence = 0.5;
        },
        (cluster: Row) => {
            cluster.articleLinks[0].article.updatedAt = new Date(
                initialTime.getTime() + 1,
            );
        },
        (cluster: Row) => {
            cluster.articleLinks[0].article.source.name = 'Edited publisher';
        },
    ]) {
        const cluster = structuredClone(original);
        mutate(cluster);
        assert.deepEqual(cluster.updatedAt, original.updatedAt);
        assert.notEqual(
            clusterBulkRevision(cluster as ClusterBulkSnapshot),
            revision,
        );
    }
});

test('stale, deleted, published and source-less snapshots skip before AI or publication writes', async () => {
    for (const action of ['CONTEXTUALIZE', 'PUBLISH'] as const) {
        for (const mutate of [
            (clusters: Row[]) => {
                clusters[0].title = 'Edited headline';
            },
            (clusters: Row[]) => {
                clusters[0].blocks[0].content = 'Edited block';
            },
            (clusters: Row[]) => {
                clusters[0].articleLinks = [];
            },
            (clusters: Row[]) => {
                clusters[0].status = 'PUBLISHED';
            },
            (clusters: Row[]) => {
                clusters.length = 0;
            },
        ]) {
            const original = makeCluster();
            const db = database([original]);
            db.edit(mutate);
            const before = db.get();
            let aiCalls = 0;
            const result = await execute(
                db,
                action,
                snapshot(original),
                async () => {
                    aiCalls++;
                    return draftResponse;
                },
            );
            assert.equal(result.outcome, 'skipped');
            assert.equal(aiCalls, 0);
            assert.equal(db.calls.writes, 0);
            assert.deepEqual(db.get(), before);
        }
    }
    const noSources = makeCluster('empty', { articleLinks: [] });
    const empty = database([noSources]);
    assert.equal(
        (await execute(empty, 'CONTEXTUALIZE', snapshot(noSources))).outcome,
        'skipped',
    );
    assert.equal(empty.calls.writes, 0);
});

test('contextualization replaces blocks once, preserves draft/updated state, and never publishes', async () => {
    for (const status of ['DRAFT', 'UPDATED']) {
        const original = makeCluster('cluster', { status });
        const db = database([original]);
        let calls = 0;
        const result = await execute(
            db,
            'CONTEXTUALIZE',
            snapshot(original),
            async (prompt) => {
                calls++;
                assert.ok(
                    prompt.includes(original.articleLinks[0].article.content),
                );
                return draftResponse;
            },
        );
        assert.equal(result.outcome, 'succeeded');
        assert.equal(calls, 1);
        const saved = db.get()[0];
        assert.equal(saved.title, 'Generated analytical title');
        assert.equal(saved.status, status);
        assert.equal(saved.publishedAt, null);
        assert.equal(saved.blocks.length, 2);
        assert.ok(
            saved.blocks.every(
                (block: Row) => block.createdByUserId === 'bulk-editor',
            ),
        );
        assert.deepEqual(saved.articleLinks, original.articleLinks);
        assert.deepEqual(db.calls.locks, [
            'cluster',
            'blocks',
            'links',
            'articles',
            'sources',
            'cluster',
            'blocks',
            'links',
            'articles',
            'sources',
        ]);
        assert.equal(
            (
                await execute(
                    db,
                    'CONTEXTUALIZE',
                    snapshot(original),
                    async () => {
                        calls++;
                        return draftResponse;
                    },
                )
            ).outcome,
            'skipped',
        );
        assert.equal(calls, 1);
    }
});

test('an edit to blocks, membership, source data or publication while AI runs prevents replacement', async () => {
    for (const mutate of [
        (cluster: Row) => {
            cluster.blocks[0].content = 'An editor saved this during AI.';
        },
        (cluster: Row) => {
            cluster.articleLinks = [];
        },
        (cluster: Row) => {
            cluster.articleLinks[0].article.updatedAt = new Date(
                initialTime.getTime() + 1,
            );
        },
        (cluster: Row) => {
            cluster.status = 'PUBLISHED';
        },
    ]) {
        const original = makeCluster();
        const db = database([original]);
        let afterEdit: Row[] = [];
        const result = await execute(
            db,
            'CONTEXTUALIZE',
            snapshot(original),
            async () => {
                db.edit((clusters) => mutate(clusters[0]));
                afterEdit = db.get();
                return draftResponse;
            },
        );
        assert.equal(result.outcome, 'skipped');
        assert.deepEqual(db.get(), afterEdit);
        assert.equal(db.get()[0].title, original.title);
    }
});

test('duplicate concurrent submissions of one snapshot call the provider once', async () => {
    const original = makeCluster();
    const db = database([original]);
    let started!: () => void;
    let release!: () => void;
    const aiStarted = new Promise<void>((resolve) => {
        started = resolve;
    });
    const aiGate = new Promise<void>((resolve) => {
        release = resolve;
    });
    let calls = 0;
    const provider = async () => {
        calls++;
        started();
        await aiGate;
        return draftResponse;
    };
    const first = execute(db, 'CONTEXTUALIZE', snapshot(original), provider);
    await aiStarted;
    const second = await execute(
        db,
        'CONTEXTUALIZE',
        snapshot(original),
        provider,
    );
    assert.equal(second.outcome, 'skipped');
    assert.equal(calls, 1);
    release();
    assert.equal((await first).outcome, 'succeeded');
});

test('provider and storage failures preserve editorial content and do not automatically retry the consumed snapshot', async () => {
    for (const failStorage of [false, true]) {
        const original = makeCluster();
        const db = database([original]);
        if (failStorage) db.failBlocks();
        let calls = 0;
        const provider = async () => {
            calls++;
            if (!failStorage) throw new Error('Provider unavailable');
            return draftResponse;
        };
        assert.equal(
            (await execute(db, 'CONTEXTUALIZE', snapshot(original), provider))
                .outcome,
            'failed',
        );
        const saved = db.get()[0];
        assert.equal(saved.title, original.title);
        assert.equal(saved.summary, original.summary);
        assert.deepEqual(saved.blocks, original.blocks);
        assert.equal(saved.status, original.status);
        assert.equal(
            (await execute(db, 'CONTEXTUALIZE', snapshot(original), provider))
                .outcome,
            'skipped',
        );
        assert.equal(calls, 1);
        assert.notEqual(snapshot(saved).revision, snapshot(original).revision);
    }
});

test('publication changes only ready current draft/updated clusters and repeats skip without another publication', async () => {
    for (const status of ['DRAFT', 'UPDATED']) {
        const original = makeCluster('cluster', { status });
        const db = database([original]);
        const result = await execute(
            db,
            'PUBLISH',
            snapshot(original),
            async () => {
                assert.fail('Publishing must not call AI');
            },
        );
        assert.equal(result.outcome, 'succeeded');
        assert.equal(db.get()[0].status, 'PUBLISHED');
        assert.ok(db.get()[0].publishedAt instanceof Date);
        assert.deepEqual(db.get()[0].blocks, original.blocks);
        assert.equal(db.get()[0].title, original.title);
        assert.equal(
            (await execute(db, 'PUBLISH', snapshot(original))).outcome,
            'skipped',
        );
    }
    const invalid = makeCluster('invalid', { summary: ' ' });
    const db = database([invalid]);
    const result = await execute(db, 'PUBLISH', snapshot(invalid));
    assert.equal(result.outcome, 'skipped');
    assert.match(result.message, /Summary is required/);
    assert.equal(db.calls.writes, 0);
});

test('single contextualization retains its existing contract without requiring a bulk revision', async () => {
    const db = database([makeCluster()]);
    const result = await generateAnalyzedNewsForCluster({
        prisma: db.prisma,
        clusterId: 'cluster-a',
        createdByUserId: 'single-editor',
        provider: { generateAnalyzedNews: async () => draftResponse },
    });
    assert.equal(result.cluster.title, 'Generated analytical title');
    assert.equal(result.blocks.length, 2);
    assert.ok(
        result.blocks.every(
            (block) => block.createdByUserId === 'single-editor',
        ),
    );
    assert.equal(db.calls.transactions, 1);
});

test('generation saves a version newer than its claim even when stored timestamps are ahead of the clock', async () => {
    const original = makeCluster('future', {
        updatedAt: new Date('2100-01-01T00:00:00Z'),
    });
    const db = database([original]);
    let claimedAt = initialTime;
    const result = await execute(
        db,
        'CONTEXTUALIZE',
        snapshot(original),
        async () => {
            claimedAt = db.get()[0].updatedAt;
            assert.ok(claimedAt > original.updatedAt);
            return draftResponse;
        },
    );
    assert.equal(result.outcome, 'succeeded');
    assert.ok(db.get()[0].updatedAt > claimedAt);
});

test('raw PostgreSQL deadlocks and serialization conflicts return a friendly skip without retrying', async () => {
    for (const meta of [
        { code: '40P01' },
        { driverAdapterError: { cause: { originalCode: '40P01' } } },
        { driverAdapterError: { cause: { code: '40001' } } },
    ]) {
        let transactions = 0;
        const result = await executeClusterBulkItem({
            prisma: {
                $transaction: async () => {
                    transactions++;
                    throw new Prisma.PrismaClientKnownRequestError(
                        'Internal raw SQL details',
                        {
                            code: 'P2010',
                            clientVersion: 'test',
                            meta,
                        },
                    );
                },
            } as unknown as PrismaClient,
            action: 'PUBLISH',
            item: snapshot(makeCluster()),
            createdByUserId: 'editor',
            provider: {
                generateAnalyzedNews: async () => {
                    assert.fail('Do not call AI');
                },
            },
        });
        assert.equal(result.outcome, 'skipped');
        assert.match(result.message, /concurrently/);
        assert.ok(!result.message.includes('Internal'));
        assert.equal(transactions, 1);
    }
});
