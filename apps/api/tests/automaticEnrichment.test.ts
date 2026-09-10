import assert from 'node:assert/strict';
import test from 'node:test';
import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import {
    enqueueAutomaticEnrichment,
    refreshAutomaticEnrichment,
    type AutomaticEnrichmentContext,
} from '../src/core/enrichmentJobs/automaticEnrichment';
import {
    retryEnrichmentJobErrors,
    stopEnrichmentJob,
} from '../src/core/enrichmentJobs/jobs';
import {
    renewEnrichmentLease,
    settleEnrichmentClaim,
    type EnrichmentClaim,
} from '../src/core/enrichmentJobs/worker';
import type { EnrichmentArticle } from '../src/core/enrichmentJobs/types';
import { makeManualContentAssessment } from '../src/core/ingestionNews/enrich/articleContentQuality';

type Row = Record<string, any>;
const initialTime = new Date('2026-09-09T15:00:00.000Z');
const context: AutomaticEnrichmentContext = {
    jobId: 'automatic-fetch',
    createdByUserId: 'editor',
};

function article(
    id: string,
    changes: Partial<EnrichmentArticle> = {},
): EnrichmentArticle {
    return {
        id,
        sourceId: 'source',
        url: `https://example.com/${id}`,
        title: `Article ${id}`,
        summary: 'Summary from the feed.',
        content: null,
        cleanedAccessibleText: null,
        imageUrl: null,
        publishedAt: null,
        status: ArticleStatus.NEW,
        contentAvailability: 'SUMMARY_ONLY',
        cleaningMethod: null,
        contentProvenance: null,
        contentAssessment: null,
        createdAt: initialTime,
        updatedAt: initialTime,
        _count: { clusterLinks: 0 },
        ...changes,
    };
}

// Serial transactions exercise queue atomicity and the job-lock/version/lease
// protocol. This double does not execute SQL or simulate PostgreSQL deadlocks.
function database() {
    let state = {
        article: [] as Row[],
        enrichmentJob: [] as Row[],
        enrichmentJobItem: [] as Row[],
    };
    type State = typeof state;
    let nextId = 0;
    let queue = Promise.resolve();
    const locked: string[] = [];
    const scalar = (value: unknown) =>
        value instanceof Date ? value.getTime() : value;
    const matches = (row: Row, where?: Row): boolean =>
        !where ||
        Object.entries(where).every(([key, condition]) => {
            const value = row[key];
            if (
                condition &&
                typeof condition === 'object' &&
                !(condition instanceof Date)
            ) {
                return Object.entries(condition).every(([operator, next]) => {
                    if (operator === 'in')
                        return (next as unknown[]).includes(value);
                    if (operator === 'not') return value !== next;
                    if (operator === 'gt')
                        return (
                            value !== null &&
                            (scalar(value) as number) > (scalar(next) as number)
                        );
                    assert.fail(`Unexpected predicate ${operator}`);
                });
            }
            return scalar(value) === scalar(condition);
        });
    const client = (get: () => State): any => {
        const tx: Row = {};
        for (const model of [
            'article',
            'enrichmentJob',
            'enrichmentJobItem',
        ] as const) {
            const find = (args: Row = {}) =>
                get()[model].filter((row) => matches(row, args.where));
            const project = (row: Row | undefined, select?: Row) =>
                row
                    ? structuredClone(
                          select
                              ? Object.fromEntries(
                                    Object.keys(select).map((key) => [
                                        key,
                                        row[key],
                                    ]),
                                )
                              : row,
                      )
                    : null;
            const create = (data: Row) => {
                const row = {
                    id: `${model}-${++nextId}`,
                    createdAt: initialTime,
                    updatedAt: initialTime,
                    ...(model === 'enrichmentJob'
                        ? { status: 'QUEUED', total: 0, requestId: null }
                        : {}),
                    ...(model === 'enrichmentJobItem'
                        ? {
                              status: 'PENDING',
                              reason: null,
                              expectedArticleUpdatedAt: null,
                              attempts: 0,
                              leaseToken: null,
                              leaseExpiresAt: null,
                              proposal: null,
                              proposalStatus: null,
                          }
                        : {}),
                    ...structuredClone(data),
                };
                get()[model].push(row);
                return structuredClone(row);
            };
            const update = (row: Row, data: Row) => {
                for (const [key, value] of Object.entries(data)) {
                    if (value === undefined) continue;
                    row[key] =
                        value === Prisma.DbNull
                            ? null
                            : value &&
                                typeof value === 'object' &&
                                'increment' in value
                              ? row[key] + value.increment
                              : structuredClone(value);
                }
            };
            tx[model] = {
                create: async ({ data }: Row) => create(data),
                createMany: async ({ data, skipDuplicates }: Row) => {
                    let count = 0;
                    for (const item of data) {
                        const duplicate = get()[model].some(
                            (row) =>
                                row.jobId === item.jobId &&
                                row.articleId === item.articleId,
                        );
                        if (duplicate && skipDuplicates) continue;
                        assert.equal(duplicate, false);
                        create(item);
                        count++;
                    }
                    return { count };
                },
                upsert: async (args: Row) => {
                    const existing = find(args)[0];
                    if (!existing) return create(args.create);
                    update(existing, args.update);
                    return structuredClone(existing);
                },
                findUnique: async (args: Row) =>
                    project(find(args)[0], args.select),
                findUniqueOrThrow: async (args: Row) => {
                    const row = find(args)[0];
                    assert.ok(row);
                    return project(row, args.select);
                },
                update: async (args: Row) => {
                    const row = find(args)[0];
                    assert.ok(row);
                    update(row, args.data);
                    return structuredClone(row);
                },
                updateMany: async (args: Row) => {
                    const rows = find(args);
                    rows.forEach((row) => update(row, args.data));
                    return { count: rows.length };
                },
                count: async (args: Row) => find(args).length,
                groupBy: async (args: Row) => {
                    const groups = new Map<string, number>();
                    for (const row of find(args))
                        groups.set(
                            row.status,
                            (groups.get(row.status) ?? 0) + 1,
                        );
                    return [...groups].map(([status, count]) => ({
                        status,
                        _count: { _all: count },
                    }));
                },
            };
        }
        tx.$queryRaw = async (sql: Prisma.Sql) => {
            assert.match(sql.sql, /FROM "EnrichmentJob".*FOR UPDATE/);
            const jobId = String(sql.values[0]);
            locked.push(jobId);
            return get()
                .enrichmentJob.filter(({ id }) => id === jobId)
                .map(({ id }) => ({ id }));
        };
        return tx;
    };
    const prisma = client(() => state);
    prisma.$transaction = async (
        run: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        const draft = structuredClone(state);
        try {
            const result = await run(client(() => draft));
            state = draft;
            return result;
        } finally {
            release();
        }
    };
    return {
        prisma: prisma as PrismaClient,
        get state() {
            return state;
        },
        locked,
    };
}

type Database = ReturnType<typeof database>;
const enqueue = (db: Database, value = article('a')) =>
    db.prisma.$transaction((tx) =>
        enqueueAutomaticEnrichment(tx, value, context),
    );
const refresh = (
    db: Database,
    value: EnrichmentArticle,
    previousUpdatedAt = initialTime,
) =>
    db.prisma.$transaction((tx) =>
        refreshAutomaticEnrichment(tx, value, context, previousUpdatedAt),
    );

test('empty or already complete/protected fetch results never create an automatic job', async () => {
    const db = database();
    const fullText = 'The complete short article, verified by an editor.';
    for (const value of [
        article('rejected', { status: ArticleStatus.REJECTED }),
        article('clustered', { status: ArticleStatus.CLUSTERED }),
        article('linked', { _count: { clusterLinks: 1 } }),
        article('full', {
            content: fullText,
            contentAssessment: JSON.parse(
                JSON.stringify(makeManualContentAssessment(fullText)),
            ),
        }),
    ])
        await enqueue(db, value);
    assert.equal(db.state.enrichmentJob.length, 0);
    assert.equal(db.state.enrichmentJobItem.length, 0);
    assert.equal(db.locked.length, 0);
});

test('one fetch creates one durable job with frozen article versions and unique items', async () => {
    const db = database();
    await Promise.all([enqueue(db), enqueue(db), enqueue(db, article('b'))]);
    await enqueue(
        db,
        article('a', {
            title: 'A later duplicate must not silently refresh this item',
            updatedAt: new Date(initialTime.getTime() + 1),
        }),
    );
    assert.equal(db.state.enrichmentJob.length, 1);
    assert.equal(db.state.enrichmentJob[0].total, 2);
    assert.equal(db.state.enrichmentJob[0].requestId, 'fetch:automatic-fetch');
    assert.equal(db.state.enrichmentJob[0].createdByUserId, 'editor');
    assert.deepEqual(db.state.enrichmentJob[0].scope, {
        type: 'AUTOMATIC_FETCH',
    });
    assert.equal(db.state.enrichmentJobItem.length, 2);
    assert.equal(db.state.enrichmentJobItem[0].title, 'Article a');
    assert.deepEqual(
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt,
        initialTime,
    );
    assert.equal(db.locked.length, 4);
});

test('later source batches reopen a completed job without losing earlier outcomes', async () => {
    const db = database();
    await enqueue(db);
    db.state.enrichmentJob[0].status = 'COMPLETED';
    db.state.enrichmentJobItem[0].status = 'FULL_TEXT';
    await enqueue(db, article('b'));
    assert.equal(db.state.enrichmentJob[0].status, 'QUEUED');
    assert.equal(db.state.enrichmentJob[0].total, 2);
    assert.deepEqual(
        db.state.enrichmentJobItem.map(({ status }) => status),
        ['FULL_TEXT', 'PENDING'],
    );
    db.state.enrichmentJob[0].status = 'RUNNING';
    await enqueue(db, article('c'));
    assert.equal(db.state.enrichmentJob[0].status, 'RUNNING');
});

test('stop between source batches preserves cancellation even after the worker completed', async () => {
    const db = database();
    await enqueue(db);
    db.state.enrichmentJob[0].status = 'COMPLETED';
    db.state.enrichmentJobItem[0].status = 'UNCHANGED';
    await stopEnrichmentJob({ prisma: db.prisma, jobId: context.jobId });
    await enqueue(db, article('b'));
    assert.equal(db.state.enrichmentJob[0].status, 'CANCELED');
    assert.equal(db.state.enrichmentJob[0].total, 2);
    assert.deepEqual(
        db.state.enrichmentJobItem.map(({ status }) => status),
        ['UNCHANGED', 'CANCELED'],
    );
    assert.match(db.state.enrichmentJobItem[1].reason, /Canceled before/);
});

test('stopping a completed manual job keeps its completed status', async () => {
    const db = database();
    await enqueue(db);
    db.state.enrichmentJob[0].scope = { type: 'SELECTED', ids: ['a'] };
    db.state.enrichmentJob[0].status = 'COMPLETED';
    db.state.enrichmentJobItem[0].status = 'FULL_TEXT';
    await stopEnrichmentJob({ prisma: db.prisma, jobId: context.jobId });
    assert.equal(db.state.enrichmentJob[0].status, 'COMPLETED');
    assert.deepEqual(db.state.enrichmentJob[0].scope, {
        type: 'SELECTED',
        ids: ['a'],
    });
});

test('retrying errors after Stop does not restart later automatic arrivals or duplicate updates', async () => {
    const db = database();
    await enqueue(db, article('failed'));
    await enqueue(db, article('unsent'));
    db.state.enrichmentJobItem[0].status = 'ERROR';
    db.state.enrichmentJobItem[0].reason = 'Publisher request failed.';

    await stopEnrichmentJob({ prisma: db.prisma, jobId: context.jobId });
    assert.deepEqual(db.state.enrichmentJob[0].scope, {
        type: 'AUTOMATIC_FETCH',
        stopRequested: true,
    });
    await retryEnrichmentJobErrors({
        prisma: db.prisma,
        jobId: context.jobId,
    });
    assert.equal(db.state.enrichmentJob[0].status, 'QUEUED');
    await enqueue(db, article('later'));
    await refresh(
        db,
        article('unsent', {
            updatedAt: new Date(initialTime.getTime() + 1),
        }),
    );
    assert.deepEqual(
        db.state.enrichmentJobItem.map(({ articleId, status }) => ({
            articleId,
            status,
        })),
        [
            { articleId: 'failed', status: 'PENDING' },
            { articleId: 'unsent', status: 'CANCELED' },
            { articleId: 'later', status: 'CANCELED' },
        ],
    );
    assert.equal(db.state.enrichmentJobItem[0].reason, null);
    assert.equal(db.state.enrichmentJob[0].status, 'QUEUED');
    assert.equal(db.state.enrichmentJob[0].total, 3);

    // Completion of the requested retry must not reopen the stopped producer.
    db.state.enrichmentJobItem[0].status = 'UNCHANGED';
    db.state.enrichmentJob[0].status = 'COMPLETED';
    await enqueue(db, article('after-retry'));
    assert.equal(db.state.enrichmentJobItem[3].status, 'CANCELED');
    assert.equal(db.state.enrichmentJob[0].status, 'COMPLETED');
    assert.equal(db.state.enrichmentJob[0].total, 4);
});

test('duplicate feed updates refresh pending work and the displayed title without increasing total', async () => {
    const db = database();
    await enqueue(db);
    const updated = article('a', {
        title: 'Updated headline from a second feed',
        updatedAt: new Date(initialTime.getTime() + 1),
    });
    await refresh(db, updated);
    assert.equal(db.state.enrichmentJob[0].total, 1);
    assert.equal(db.state.enrichmentJobItem.length, 1);
    assert.equal(db.state.enrichmentJobItem[0].title, updated.title);
    assert.deepEqual(
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt,
        updated.updatedAt,
    );
    assert.equal(db.state.enrichmentJobItem[0].status, 'PENDING');
});

test('refreshing an in-flight version invalidates its lease so the previous worker cannot settle', async () => {
    const db = database();
    await enqueue(db);
    Object.assign(db.state.enrichmentJobItem[0], {
        status: 'RUNNING',
        attempts: 1,
        leaseToken: 'old-worker',
        leaseExpiresAt: new Date(initialTime.getTime() + 120000),
    });
    db.state.enrichmentJob[0].status = 'RUNNING';
    const claim: EnrichmentClaim = {
        id: db.state.enrichmentJobItem[0].id,
        jobId: context.jobId,
        articleId: 'a',
        expectedArticleUpdatedAt: initialTime,
        leaseToken: 'old-worker',
        createdByUserId: 'editor',
    };
    await refresh(
        db,
        article('a', { updatedAt: new Date(initialTime.getTime() + 1) }),
    );
    assert.equal(db.state.enrichmentJobItem[0].status, 'PENDING');
    assert.equal(db.state.enrichmentJobItem[0].leaseToken, null);
    assert.equal(db.state.enrichmentJobItem[0].leaseExpiresAt, null);
    assert.equal(db.state.enrichmentJobItem[0].attempts, 1);
    assert.equal(
        await renewEnrichmentLease({
            prisma: db.prisma,
            claim,
            now: () => initialTime,
        }),
        false,
    );
    assert.equal(
        await settleEnrichmentClaim({
            prisma: db.prisma,
            claim,
            failed: true,
            reason: 'Old worker failed after the feed update',
            now: () => initialTime,
        }),
        false,
    );
    assert.equal(db.state.enrichmentJobItem[0].status, 'PENDING');
    assert.equal(db.state.enrichmentJobItem[0].reason, null);
});

test('refresh reopens completed work and discards a proposal based on the previous feed version', async () => {
    const db = database();
    await enqueue(db);
    db.state.enrichmentJob[0].status = 'COMPLETED';
    Object.assign(db.state.enrichmentJobItem[0], {
        status: 'PROPOSED',
        proposal: { content: 'Old candidate' },
        proposalStatus: 'PENDING',
        reason: 'Review the old candidate.',
    });
    await refresh(
        db,
        article('a', { updatedAt: new Date(initialTime.getTime() + 1) }),
    );
    assert.equal(db.state.enrichmentJob[0].status, 'QUEUED');
    assert.equal(db.state.enrichmentJobItem[0].proposal, null);
    assert.equal(db.state.enrichmentJobItem[0].proposalStatus, null);
    assert.equal(db.state.enrichmentJobItem[0].reason, null);
});

test('refresh skips newly protected work and finishes a job with no outstanding items', async () => {
    const db = database();
    await enqueue(db);
    await refresh(
        db,
        article('a', {
            status: ArticleStatus.REJECTED,
            updatedAt: new Date(initialTime.getTime() + 1),
        }),
    );
    assert.equal(db.state.enrichmentJobItem[0].status, 'SKIPPED');
    assert.match(db.state.enrichmentJobItem[0].reason, /Rejected/);
    assert.equal(db.state.enrichmentJob[0].status, 'COMPLETED');
    assert.equal(db.state.enrichmentJob[0].total, 1);
});

test('refresh cannot restart a canceled job', async () => {
    const db = database();
    await enqueue(db);
    await stopEnrichmentJob({ prisma: db.prisma, jobId: context.jobId });
    await refresh(
        db,
        article('a', { updatedAt: new Date(initialTime.getTime() + 1) }),
    );
    assert.equal(db.state.enrichmentJob[0].status, 'CANCELED');
    assert.equal(db.state.enrichmentJobItem[0].status, 'CANCELED');
    assert.equal(db.state.enrichmentJobItem[0].leaseToken, null);
});

test('refresh never adopts an existing article, another fetch, or a version changed outside this job', async () => {
    const db = database();
    await refresh(db, article('legacy'));
    assert.equal(db.state.enrichmentJob.length, 0);
    await enqueue(db);
    const before = structuredClone(db.state);
    await refresh(db, article('legacy'));
    await refresh(
        db,
        article('a', { updatedAt: new Date(initialTime.getTime() + 2) }),
        new Date(initialTime.getTime() + 1),
    );
    await db.prisma.$transaction((tx) =>
        refreshAutomaticEnrichment(
            tx,
            article('a'),
            { ...context, jobId: 'another-fetch' },
            initialTime,
        ),
    );
    assert.deepEqual(db.state, before);
});

test('an article failure rolls back its queue entry and the same context remains usable', async () => {
    const db = database();
    const originalContext = structuredClone(context);
    await assert.rejects(
        db.prisma.$transaction(async (tx) => {
            await tx.article.create({
                data: {
                    id: 'a',
                    sourceId: 'source',
                    url: 'https://example.com/a',
                    title: 'Article a',
                },
            });
            await enqueueAutomaticEnrichment(tx, article('a'), context);
            throw new Error('Later article persistence failed');
        }),
        /Later article persistence failed/,
    );
    assert.equal(db.state.article.length, 0);
    assert.equal(db.state.enrichmentJob.length, 0);
    assert.equal(db.state.enrichmentJobItem.length, 0);
    assert.deepEqual(context, originalContext);
    await enqueue(db, article('b'));
    assert.equal(db.state.enrichmentJob.length, 1);
    assert.equal(db.state.enrichmentJob[0].total, 1);
    assert.equal(db.state.enrichmentJobItem[0].articleId, 'b');
});

test('a colliding context cannot append articles to a different user or manual job', async () => {
    const db = database();
    await enqueue(db);
    db.state.enrichmentJob[0].createdByUserId = 'another-editor';
    await assert.rejects(enqueue(db, article('b')), /different fetch/);
    assert.equal(db.state.enrichmentJob[0].total, 1);
    assert.equal(db.state.enrichmentJobItem.length, 1);
    db.state.enrichmentJob[0].createdByUserId = context.createdByUserId;
    db.state.enrichmentJob[0].scope = { type: 'SELECTED', ids: ['a'] };
    await assert.rejects(enqueue(db, article('b')), /different fetch/);
    assert.equal(db.state.enrichmentJobItem.length, 1);
});
