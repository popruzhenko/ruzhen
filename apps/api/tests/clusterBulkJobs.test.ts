import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
    cancelClusterBulkJob,
    claimClusterBulkItem,
    getClusterBulkJob,
    listClusterBulkJobs,
    renewClusterBulkLease,
    runClusterBulkWorkerOnce,
    startClusterBulkJob,
} from '../src/core/clusterBulkJobs';

type Row = Record<string, any>;
const initialTime = new Date('2026-09-11T10:00:00Z');
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
                articleId: `${id}-article`,
                addedByUserId: 'editor',
                addedAt: initialTime,
                isPrimary: true,
                confidence: 0.9,
                method: 'MANUAL',
                article: {
                    id: `${id}-article`,
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

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

// A serial transaction double stages changes and commits only after the
// callback succeeds. It tests application transitions, fencing and rollback;
// clusterBulkPostgres.test.ts separately exercises the real PostgreSQL locks.
function database(clusters = [makeCluster()]) {
    let state = {
        cluster: structuredClone(clusters),
        clusterBulkJob: [] as Row[],
        clusterBulkJobItem: [] as Row[],
        clusterBulkJobRequest: [] as Row[],
    };
    type State = typeof state;
    let afterCommit: ((committed: State) => Promise<void>) | undefined;
    let currentTime = new Date(initialTime);
    let queue = Promise.resolve();
    let sequence = 0;
    let failItemInsert = false;
    let failSuccess = false;
    let failBlock = false;
    const calls = { sql: [] as Prisma.Sql[], writes: 0, transactions: 0 };
    const scalar = (value: any): any =>
        value instanceof Date ? value.getTime() : value;
    const matches = (
        row: Row,
        where: Row | undefined,
        staged: State,
    ): boolean =>
        !where ||
        Object.entries(where).every(([key, condition]) => {
            if (condition === undefined) return true;
            if (key === 'AND')
                return (
                    Array.isArray(condition) ? condition : [condition]
                ).every((part: Row) => matches(row, part, staged));
            if (key === 'OR')
                return condition.some((part: Row) =>
                    matches(row, part, staged),
                );
            if (key === 'NOT') return !matches(row, condition, staged);
            if (key === 'job')
                return matches(
                    staged.clusterBulkJob.find((job) => job.id === row.jobId)!,
                    condition,
                    staged,
                );
            if (key === 'items') {
                const children = staged.clusterBulkJobItem.filter(
                    (item) => item.jobId === row.id,
                );
                if ('some' in condition)
                    return children.some((item) =>
                        matches(item, condition.some, staged),
                    );
                if ('none' in condition)
                    return !children.some((item) =>
                        matches(item, condition.none, staged),
                    );
                assert.fail(
                    `Unsupported relation predicate ${JSON.stringify(condition)}`,
                );
            }
            const actual = row[key];
            if (
                condition &&
                typeof condition === 'object' &&
                !(condition instanceof Date)
            ) {
                return Object.entries(condition).every(
                    ([operator, expected]) => {
                        if (operator === 'in')
                            return (expected as unknown[]).includes(actual);
                        if (operator === 'notIn')
                            return !(expected as unknown[]).includes(actual);
                        if (operator === 'not')
                            return scalar(actual) !== scalar(expected);
                        if (operator === 'equals')
                            return scalar(actual) === scalar(expected);
                        if (operator === 'lte')
                            return (
                                actual !== null &&
                                scalar(actual) <= scalar(expected)
                            );
                        if (operator === 'lt')
                            return (
                                actual !== null &&
                                scalar(actual) < scalar(expected)
                            );
                        if (operator === 'gte')
                            return (
                                actual !== null &&
                                scalar(actual) >= scalar(expected)
                            );
                        if (operator === 'gt')
                            return (
                                actual !== null &&
                                scalar(actual) > scalar(expected)
                            );
                        assert.fail(`Unsupported operator ${operator}`);
                    },
                );
            }
            return scalar(actual) === scalar(condition);
        });
    const client = (get: () => State): Row => {
        const value: Row = {};
        const sort = (rows: Row[], orderBy: Row | Row[] | undefined) => {
            const order = orderBy
                ? Array.isArray(orderBy)
                    ? orderBy
                    : [orderBy]
                : [];
            return [...rows].sort((a, b) => {
                for (const fields of order) {
                    for (const [key, direction] of Object.entries(fields)) {
                        const left = scalar(a[key]);
                        const right = scalar(b[key]);
                        const comparison =
                            left === right ? 0 : left < right ? -1 : 1;
                        if (comparison)
                            return direction === 'desc'
                                ? -comparison
                                : comparison;
                    }
                }
                return 0;
            });
        };
        const project = (row: Row | undefined, args: Row = {}) => {
            if (!row) return null;
            const result = structuredClone(row);
            if (args.include?.job)
                result.job = structuredClone(
                    get().clusterBulkJob.find((job) => job.id === row.jobId),
                );
            if (args.include?.items)
                result.items = structuredClone(
                    get().clusterBulkJobItem.filter(
                        (item) => item.jobId === row.id,
                    ),
                );
            return result;
        };
        for (const model of Object.keys(state) as Array<keyof State>) {
            const find = (args: Row = {}) => {
                let found = sort(
                    get()[model].filter((row) =>
                        matches(row, args.where, get()),
                    ),
                    args.orderBy,
                );
                if (args.cursor)
                    found = found.slice(
                        found.findIndex((row) =>
                            matches(row, args.cursor, get()),
                        ),
                    );
                return found.slice(
                    args.skip ?? 0,
                    args.take === undefined
                        ? undefined
                        : (args.skip ?? 0) + args.take,
                );
            };
            const update = (row: Row, data: Row) => {
                if (
                    model === 'clusterBulkJobItem' &&
                    data.status === 'SUCCEEDED' &&
                    failSuccess
                )
                    throw new Error(
                        'Injected item success persistence failure',
                    );
                for (const [key, next] of Object.entries(data)) {
                    if (next === undefined) continue;
                    row[key] =
                        next && typeof next === 'object' && 'increment' in next
                            ? (row[key] ?? 0) + next.increment
                            : structuredClone(next);
                }
                if (!data.updatedAt) row.updatedAt = new Date(currentTime);
                calls.writes++;
            };
            const create = (data: Row) => {
                if (model === 'clusterBulkJobItem' && failItemInsert)
                    throw new Error('Injected item insertion failure');
                const row: Row = {
                    id: `${model}-${++sequence}`,
                    createdAt: new Date(currentTime),
                    updatedAt: new Date(currentTime),
                    ...(model === 'clusterBulkJob'
                        ? {
                              status: 'QUEUED',
                              activeKey: null,
                              total: 0,
                              retryOfJobId: null,
                              startedAt: null,
                              finishedAt: null,
                          }
                        : {}),
                    ...(model === 'clusterBulkJobItem'
                        ? {
                              status: 'PENDING',
                              executionRevision: null,
                              reason: null,
                              leaseToken: null,
                              leaseExpiresAt: null,
                              aiStartedAt: null,
                              attempts: 0,
                              startedAt: null,
                              finishedAt: null,
                          }
                        : {}),
                    ...(model === 'clusterBulkJobRequest'
                        ? { retryOfJobId: null }
                        : {}),
                    ...structuredClone(data),
                };
                if (
                    model === 'clusterBulkJob' &&
                    row.activeKey &&
                    get()[model].some(
                        (existing) => existing.activeKey === row.activeKey,
                    )
                )
                    throw new Prisma.PrismaClientKnownRequestError(
                        'Unique active job',
                        { code: 'P2002', clientVersion: 'test' },
                    );
                if (
                    model === 'clusterBulkJobRequest' &&
                    get()[model].some(
                        (existing) => existing.requestId === row.requestId,
                    )
                )
                    throw new Prisma.PrismaClientKnownRequestError(
                        'Unique request',
                        { code: 'P2002', clientVersion: 'test' },
                    );
                if (
                    model === 'clusterBulkJobItem' &&
                    get()[model].some(
                        (existing) =>
                            existing.jobId === row.jobId &&
                            existing.clusterId === row.clusterId,
                    )
                )
                    throw new Prisma.PrismaClientKnownRequestError(
                        'Unique job cluster',
                        { code: 'P2002', clientVersion: 'test' },
                    );
                get()[model].push(row);
                calls.writes++;
                return structuredClone(row);
            };
            value[model] = {
                findUnique: async (args: Row) => project(find(args)[0], args),
                findFirst: async (args: Row = {}) =>
                    project(find(args)[0], args),
                findMany: async (args: Row = {}) =>
                    find(args).map((row) => project(row, args)),
                count: async (args: Row = {}) => find(args).length,
                create: async ({ data }: Row) => create(data),
                createMany: async ({ data }: Row) => {
                    data.forEach(create);
                    return { count: data.length };
                },
                update: async ({ where, data }: Row) => {
                    const row = find({ where })[0];
                    assert.ok(row, `Missing ${model} update row`);
                    update(row, data);
                    return structuredClone(row);
                },
                updateMany: async ({ where, data }: Row) => {
                    const rows = find({ where });
                    rows.forEach((row) => update(row, data));
                    return { count: rows.length };
                },
                groupBy: async (args: Row) => {
                    const groups = new Map<string, number>();
                    find(args).forEach((row) =>
                        groups.set(
                            row.status,
                            (groups.get(row.status) ?? 0) + 1,
                        ),
                    );
                    return [...groups].map(([status, count]) => ({
                        status,
                        _count: { _all: count },
                    }));
                },
            };
        }
        value.clusterBlock = {
            deleteMany: async ({ where }: Row) => {
                const cluster = get().cluster.find(
                    ({ id }) => id === where.clusterId,
                );
                assert.ok(cluster);
                const count = cluster.blocks.length;
                cluster.blocks = [];
                calls.writes++;
                return { count };
            },
            create: async ({ data }: Row) => {
                if (failBlock)
                    throw new Error('Injected block persistence failure');
                const cluster = get().cluster.find(
                    ({ id }) => id === data.clusterId,
                );
                assert.ok(cluster);
                const block = {
                    ...data,
                    id: `generated-${++sequence}`,
                    createdAt: new Date(currentTime),
                    updatedAt: new Date(currentTime),
                };
                cluster.blocks.push(block);
                calls.writes++;
                return structuredClone(block);
            },
            findMany: async ({ where }: Row) =>
                structuredClone(
                    get().cluster.find(({ id }) => id === where.clusterId)
                        ?.blocks ?? [],
                ),
        };
        value.$queryRaw = async (sql: Prisma.Sql) => {
            calls.sql.push(sql);
            if (/pg_advisory_xact_lock/.test(sql.sql)) return [];
            if (/FROM "ClusterBulkJob"/.test(sql.sql)) {
                assert.match(sql.sql, /FOR UPDATE/);
                return get()
                    .clusterBulkJob.filter(
                        (row) =>
                            sql.values.includes(row.id) ||
                            sql.values.includes(row.activeKey),
                    )
                    .map(({ id }) => ({ id }));
            }
            if (/FROM "Cluster" WHERE/.test(sql.sql)) {
                assert.match(sql.sql, /FOR UPDATE/);
                return get()
                    .cluster.filter((row) => sql.values.includes(row.id))
                    .map(({ id }) => ({ id }));
            }
            if (
                /FROM "ClusterBlock"/.test(sql.sql) ||
                /FROM "ClusterArticle" WHERE/.test(sql.sql)
            ) {
                assert.match(sql.sql, /FOR UPDATE/);
                return [];
            }
            if (
                /FROM "Source" s/.test(sql.sql) ||
                /FROM "Article" a/.test(sql.sql)
            ) {
                assert.match(sql.sql, /FOR SHARE/);
                return [];
            }
            assert.fail(`Unexpected SQL: ${sql.sql}`);
        };
        value.$executeRaw = async (sql: Prisma.Sql) => {
            assert.match(sql.sql, /pg_advisory_xact_lock/);
            calls.sql.push(sql);
            return 1;
        };
        return value;
    };
    const prisma = client(() => state);
    prisma.$transaction = async (
        run: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
        calls.transactions++;
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        const staged = structuredClone(state);
        let result: unknown;
        try {
            result = await run(
                client(() => staged) as unknown as Prisma.TransactionClient,
            );
            state = staged;
        } finally {
            release();
        }
        await afterCommit?.(structuredClone(state));
        return result;
    };
    return {
        prisma: prisma as unknown as PrismaClient,
        calls,
        now: () => new Date(currentTime),
        advance: (ms: number) => {
            currentTime = new Date(currentTime.getTime() + ms);
        },
        get: () => structuredClone(state),
        edit: (change: (rows: State) => void) => change(state),
        onCommit: (callback: (committed: State) => Promise<void>) => {
            afterCommit = callback;
        },
        failItemCreation: (enabled = true) => {
            failItemInsert = enabled;
        },
        failSucceeded: () => {
            failSuccess = true;
        },
        failBlocks: () => {
            failBlock = true;
        },
    };
}

type Database = ReturnType<typeof database>;
const requestA = '10000000-0000-4000-8000-000000000001';
const requestB = '10000000-0000-4000-8000-000000000002';
const start = (
    db: Database,
    action: 'CONTEXTUALIZE' | 'PUBLISH' = 'CONTEXTUALIZE',
    requestId = requestA,
) =>
    startClusterBulkJob({
        prisma: db.prisma,
        action,
        requestId,
        createdByUserId: 'editor',
    });

const run = (
    db: Database,
    generate: (prompt: string) => Promise<string> = async () => draftResponse,
) =>
    runClusterBulkWorkerOnce({
        prisma: db.prisma,
        provider: { generateAnalyzedNews: generate },
        now: db.now,
        leaseMs: 1000,
        heartbeatMs: 100000,
    });

test('concurrent starts reuse one frozen job and preserve request idempotency', async () => {
    const db = database([makeCluster('a'), makeCluster('b')]);
    const [first, repeated] = await Promise.all([start(db), start(db)]);
    assert.equal(first.job.id, repeated.job.id);
    assert.equal(db.get().clusterBulkJob.length, 1);
    assert.equal(db.get().clusterBulkJobRequest.length, 1);
    assert.equal(db.get().clusterBulkJobItem.length, 2);
    assert.ok(
        db.calls.sql.some((sql) => /pg_advisory_xact_lock/.test(sql.sql)),
    );

    db.edit((state) => state.cluster.push(makeCluster('new-after-start')));
    const alias = await start(db, 'CONTEXTUALIZE', requestB);
    assert.equal(alias.job.id, first.job.id);
    assert.equal(alias.reused, true);
    assert.equal(db.get().clusterBulkJobRequest.length, 2);
    assert.equal(db.get().clusterBulkJobItem.length, 2);

    await cancelClusterBulkJob({ prisma: db.prisma, jobId: first.job.id });
    const historical = await start(db);
    assert.equal(historical.job.id, first.job.id);
    assert.equal(historical.job.status, 'CANCELED');
    assert.equal(db.get().clusterBulkJob.length, 1);
});

test('request aliases cannot be reused for another action or user and active actions serialize globally', async () => {
    const db = database();
    await start(db);
    await assert.rejects(start(db, 'PUBLISH', requestA));
    await assert.rejects(
        startClusterBulkJob({
            prisma: db.prisma,
            action: 'CONTEXTUALIZE',
            requestId: requestA,
            createdByUserId: 'another-editor',
        }),
    );
    await assert.rejects(start(db, 'PUBLISH', requestB));
    assert.equal(db.get().clusterBulkJob.length, 1);
    assert.equal(db.get().clusterBulkJobRequest.length, 1);
    assert.equal(db.get().clusterBulkJob[0].activeKey, 'editorial');
});

test('queue insertion failure rolls back the job, idempotency key and active slot', async () => {
    const db = database();
    db.failItemCreation();
    await assert.rejects(start(db), /item insertion failure/);
    assert.equal(db.get().clusterBulkJob.length, 0);
    assert.equal(db.get().clusterBulkJobRequest.length, 0);
    assert.equal(db.get().clusterBulkJobItem.length, 0);
    db.failItemCreation(false);
    const started = await start(db);
    assert.equal(started.job.status, 'QUEUED');
    assert.equal(db.get().clusterBulkJobItem.length, 1);
});

test('canceling pending work finishes immediately and repeated cancellation is idempotent', async () => {
    const db = database([makeCluster('a'), makeCluster('b')]);
    const started = await start(db);
    await cancelClusterBulkJob({ prisma: db.prisma, jobId: started.job.id });
    const canceled = db.get();
    assert.equal(canceled.clusterBulkJob[0].status, 'CANCELED');
    assert.equal(canceled.clusterBulkJob[0].activeKey, null);
    assert.ok(
        canceled.clusterBulkJobItem.every((item) => item.status === 'CANCELED'),
    );
    await cancelClusterBulkJob({ prisma: db.prisma, jobId: started.job.id });
    assert.equal(db.get().clusterBulkJob[0].status, 'CANCELED');
    assert.equal(
        await claimClusterBulkItem({ prisma: db.prisma, now: db.now }),
        null,
    );
});

test('one live claim blocks other items globally; an expired pre-AI claim gets a new fencing token', async () => {
    const db = database([makeCluster('a'), makeCluster('b')]);
    await start(db);
    const claim = await claimClusterBulkItem({
        prisma: db.prisma,
        now: db.now,
        leaseMs: 1000,
    });
    assert.ok(claim);
    assert.equal(
        await claimClusterBulkItem({
            prisma: db.prisma,
            now: db.now,
            leaseMs: 1000,
        }),
        null,
    );
    assert.equal(
        db.get().clusterBulkJobItem.filter((item) => item.status === 'RUNNING')
            .length,
        1,
    );
    db.advance(1001);
    const recovered = await claimClusterBulkItem({
        prisma: db.prisma,
        now: db.now,
        leaseMs: 1000,
    });
    assert.ok(recovered);
    assert.notEqual(recovered.leaseToken, claim.leaseToken);
    assert.equal(
        await renewClusterBulkLease({
            prisma: db.prisma,
            claim,
            now: db.now,
            leaseMs: 1000,
        }),
        false,
    );
    assert.equal(
        await renewClusterBulkLease({
            prisma: db.prisma,
            claim: recovered,
            now: db.now,
            leaseMs: 1000,
        }),
        true,
    );
    assert.equal(
        db.get().clusterBulkJobItem.filter((item) => item.status === 'RUNNING')
            .length,
        1,
    );
});

test('stopping keeps a live claim and active slot, then cancels expired pre-AI work without starting another item', async () => {
    const db = database([makeCluster('a'), makeCluster('b')]);
    const started = await start(db);
    const claim = await claimClusterBulkItem({
        prisma: db.prisma,
        now: db.now,
        leaseMs: 1000,
    });
    assert.ok(claim);
    await cancelClusterBulkJob({ prisma: db.prisma, jobId: started.job.id });
    assert.equal(db.get().clusterBulkJob[0].status, 'STOPPING');
    assert.equal(db.get().clusterBulkJob[0].activeKey, 'editorial');
    assert.deepEqual(
        db
            .get()
            .clusterBulkJobItem.map((item) => item.status)
            .sort(),
        ['CANCELED', 'RUNNING'],
    );
    db.advance(1001);
    assert.equal(
        await claimClusterBulkItem({
            prisma: db.prisma,
            now: db.now,
            leaseMs: 1000,
        }),
        null,
    );
    assert.equal(db.get().clusterBulkJob[0].status, 'CANCELED');
    assert.equal(db.get().clusterBulkJob[0].activeKey, null);
    assert.ok(
        db.get().clusterBulkJobItem.every((item) => item.status === 'CANCELED'),
    );
});

test('a resumed worker with an expired pre-AI claim cannot invoke the provider after another worker reclaimed it', async () => {
    const db = database();
    await start(db);
    const claimCommitted = deferred<void>();
    const resumeOldWorker = deferred<void>();
    let paused = false;
    db.onCommit(async (state) => {
        if (
            paused ||
            !state.clusterBulkJobItem.some(
                (item) => item.status === 'RUNNING' && !item.aiStartedAt,
            )
        )
            return;
        paused = true;
        claimCommitted.resolve();
        await resumeOldWorker.promise;
    });
    let oldCalls = 0;
    let recoveredCalls = 0;
    const oldWorker = run(db, async () => {
        oldCalls++;
        return draftResponse;
    });
    await Promise.race([
        claimCommitted.promise,
        oldWorker.then(() => {
            throw new Error('Expected the old worker to pause after claiming');
        }),
    ]);
    try {
        db.advance(1001);
        await run(db, async () => {
            recoveredCalls++;
            return draftResponse;
        });
    } finally {
        resumeOldWorker.resolve();
        await oldWorker;
    }
    assert.equal(oldCalls, 0);
    assert.equal(recoveredCalls, 1);
    assert.equal(db.get().clusterBulkJobItem[0].status, 'SUCCEEDED');
    assert.equal(db.get().clusterBulkJobItem[0].attempts, 2);
    assert.equal(db.get().cluster[0].title, 'Generated analytical title');
});

async function beginGeneration(db: Database) {
    const began = deferred<void>();
    const response = deferred<string>();
    let calls = 0;
    const work = run(db, async () => {
        calls++;
        const running = db
            .get()
            .clusterBulkJobItem.find((item) => item.status === 'RUNNING');
        assert.ok(
            running?.aiStartedAt instanceof Date,
            'The AI start marker must commit before calling the provider',
        );
        assert.ok(
            running.executionRevision,
            'The consumed revision must be durable before calling the provider',
        );
        began.resolve();
        return response.promise;
    });
    await Promise.race([
        began.promise,
        work.then(() => {
            throw new Error(
                'Worker finished before invoking the fixture provider',
            );
        }),
    ]);
    return { work, response, calls: () => calls };
}

test('expired AI-started work fails without another provider call and fences a delayed response', async () => {
    const original = makeCluster();
    const db = database([original]);
    await start(db);
    const running = await beginGeneration(db);
    try {
        db.advance(1001);
        await run(db, async () => {
            assert.fail(
                'Recovery must not repeat a potentially billed AI call',
            );
        });
        const recovered = db.get();
        assert.equal(recovered.clusterBulkJobItem[0].status, 'FAILED');
        assert.match(
            recovered.clusterBulkJobItem[0].reason,
            /interrupt|expired|uncertain|manual|retry|review/i,
        );
        assert.equal(recovered.clusterBulkJob[0].status, 'COMPLETED');
        assert.equal(recovered.clusterBulkJob[0].activeKey, null);
        assert.equal(running.calls(), 1);
    } finally {
        running.response.resolve(draftResponse);
        await running.work;
    }
    const saved = db.get();
    assert.equal(saved.clusterBulkJobItem[0].status, 'FAILED');
    assert.equal(saved.cluster[0].title, original.title);
    assert.deepEqual(saved.cluster[0].blocks, original.blocks);
});

test('stop lets current generation finish, cancels unsent work and releases the active slot only afterward', async () => {
    const db = database([makeCluster('a'), makeCluster('b')]);
    const started = await start(db);
    const running = await beginGeneration(db);
    try {
        await cancelClusterBulkJob({
            prisma: db.prisma,
            jobId: started.job.id,
        });
        assert.equal(db.get().clusterBulkJob[0].status, 'STOPPING');
        assert.equal(db.get().clusterBulkJob[0].activeKey, 'editorial');
        assert.equal(
            db
                .get()
                .clusterBulkJobItem.filter((item) => item.status === 'CANCELED')
                .length,
            1,
        );
        await run(db, async () => {
            assert.fail('No new item may start while stopping');
        });
    } finally {
        running.response.resolve(draftResponse);
        await running.work;
    }
    const saved = db.get();
    assert.equal(saved.clusterBulkJob[0].status, 'CANCELED');
    assert.equal(saved.clusterBulkJob[0].activeKey, null);
    assert.deepEqual(
        saved.clusterBulkJobItem.map((item) => item.status).sort(),
        ['CANCELED', 'SUCCEEDED'],
    );
    assert.equal(
        saved.cluster.filter(
            (cluster) => cluster.title === 'Generated analytical title',
        ).length,
        1,
    );
    assert.equal(
        saved.cluster.find((cluster) => cluster.id === 'b')?.title,
        'Original editorial title',
    );
});

test('generated contents and succeeded marker commit together and roll back together on item persistence failure', async () => {
    const original = makeCluster();
    const db = database([original]);
    await start(db);
    db.failSucceeded();
    let calls = 0;
    await run(db, async () => {
        calls++;
        return draftResponse;
    });
    const saved = db.get();
    assert.equal(calls, 1);
    assert.equal(saved.clusterBulkJobItem[0].status, 'FAILED');
    assert.equal(saved.cluster[0].title, original.title);
    assert.equal(saved.cluster[0].summary, original.summary);
    assert.deepEqual(saved.cluster[0].blocks, original.blocks);
    assert.equal(saved.clusterBulkJob[0].status, 'COMPLETED');
    await run(db, async () => {
        assert.fail('A failed AI request requires explicit retry');
    });
});

test('block persistence failure preserves the old draft and records a terminal failure without automatic AI retry', async () => {
    const original = makeCluster();
    const db = database([original]);
    await start(db);
    db.failBlocks();
    await run(db);
    assert.equal(db.get().clusterBulkJobItem[0].status, 'FAILED');
    assert.equal(db.get().cluster[0].title, original.title);
    assert.deepEqual(db.get().cluster[0].blocks, original.blocks);
    await run(db, async () => {
        assert.fail(
            'Do not automatically repeat generation after save failure',
        );
    });
});

test('publication and its succeeded marker are atomic and never invoke AI', async () => {
    for (const fail of [false, true]) {
        const original = makeCluster();
        const db = database([original]);
        await start(db, 'PUBLISH');
        if (fail) db.failSucceeded();
        await run(db, async () => {
            assert.fail('Publication must not call the AI provider');
        });
        const saved = db.get();
        assert.equal(
            saved.clusterBulkJobItem[0].status,
            fail ? 'FAILED' : 'SUCCEEDED',
        );
        assert.equal(saved.cluster[0].status, fail ? 'DRAFT' : 'PUBLISHED');
        if (fail) assert.equal(saved.cluster[0].publishedAt, null);
        else assert.ok(saved.cluster[0].publishedAt instanceof Date);
        assert.equal(saved.cluster[0].title, original.title);
        assert.deepEqual(saved.cluster[0].blocks, original.blocks);
        assert.equal(saved.clusterBulkJob[0].status, 'COMPLETED');
        assert.equal(saved.clusterBulkJob[0].activeKey, null);
    }
});

test('editorial changes before processing skip stale snapshots without a provider call', async () => {
    const db = database();
    await start(db);
    db.edit((state) => {
        state.cluster[0].blocks[0].content =
            'A concurrent editorial correction.';
    });
    const edited = db.get().cluster[0];
    await run(db, async () => {
        assert.fail('A stale snapshot must not trigger AI');
    });
    assert.equal(db.get().clusterBulkJobItem[0].status, 'SKIPPED');
    assert.deepEqual(db.get().cluster[0], edited);
});

test('editorial changes during generation are preserved when the delayed result arrives', async () => {
    const db = database();
    await start(db);
    const running = await beginGeneration(db);
    db.edit((state) => {
        state.cluster[0].blocks[0].content =
            'A manual correction made while AI was running.';
    });
    const edited = db.get().cluster[0];
    running.response.resolve(draftResponse);
    await running.work;
    assert.equal(db.get().clusterBulkJobItem[0].status, 'SKIPPED');
    assert.deepEqual(db.get().cluster[0], edited);
});

test('completed jobs stay completed when stopped and their request IDs remain idempotent after a later job starts', async () => {
    const db = database();
    const started = await start(db);
    await run(db);
    await cancelClusterBulkJob({ prisma: db.prisma, jobId: started.job.id });
    assert.equal(db.get().clusterBulkJob[0].status, 'COMPLETED');
    assert.equal(db.get().clusterBulkJobItem[0].status, 'SUCCEEDED');
    const publication = await start(db, 'PUBLISH', requestB);
    assert.notEqual(publication.job.id, started.job.id);
    const repeated = await start(db);
    assert.equal(repeated.job.id, started.job.id);
    assert.equal(repeated.job.status, 'COMPLETED');
    assert.equal(db.get().clusterBulkJob.length, 2);
    assert.equal(
        db.get().clusterBulkJob.filter((job) => job.activeKey === 'editorial')
            .length,
        1,
    );
});
