import assert from 'node:assert/strict';
import test from 'node:test';
import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import {
    startEnrichmentJob,
    getEnrichmentJob,
    listEnrichmentJobs,
    stopEnrichmentJob,
    retryEnrichmentJobErrors,
    claimEnrichmentItem,
    settleEnrichmentClaim,
    runEnrichmentWorkerOnce,
    renewEnrichmentLease,
    parseEnrichmentJobRequest,
    parseEnrichmentPagination,
    parseEnrichmentExpectedVersion,
} from '../src/core/enrichmentJobs';
import { assessArticleText } from '../src/core/ingestionNews/enrich/articleContentQuality';

type Row = Record<string, any>;
const initialTime = new Date('2026-09-09T10:00:00.000Z');
const article = (id: string, extra: Row = {}): Row => ({
    id,
    sourceId: 'source',
    url: `https://example.com/${id}`,
    title: 'The council announces a transport plan',
    summary:
        'The council shared details of a new transport plan and its next public review.',
    content: null,
    cleanedAccessibleText: null,
    imageUrl: null,
    publishedAt: null,
    status: ArticleStatus.NEW,
    contentAvailability: 'SUMMARY_ONLY',
    cleaningMethod: null,
    contentProvenance: null,
    contentAssessment: null,
    embedding: null,
    embeddingModel: null,
    embeddingBasis: null,
    updatedAt: initialTime,
    createdAt: initialTime,
    _count: { clusterLinks: 0 },
    ...extra,
});

const fullCandidate = (id: string) => {
    const content = Array.from(
        { length: 6 },
        (_, index) =>
            `The council published measure ${index + 1} after residents discussed how the transport plan could affect daily journeys. Its report identifies stage ${index + 1} and explains the next public consultation for local communities.`,
    ).join('\n\n');
    return {
        content,
        summary: null,
        imageUrl: null,
        sourceUrl: `https://example.com/${id}`,
        method: 'JSON_LD' as const,
        assessment: assessArticleText({
            text: content,
            title: article(id).title,
            url: article(id).url,
            evidence: {
                method: 'JSON_LD',
                sourceUrl: article(id).url,
                sourceTitle: article(id).title,
                articleBody: true,
                documentComplete: true,
            },
        }),
    };
};

// This serial transaction double checks the application's lock/CAS protocol and
// rollback-visible state. It does not execute SQL or replace PostgreSQL tests.
function database(articles: Row[]) {
    let time = new Date(initialTime);
    let state = {
        article: structuredClone(articles),
        enrichmentJob: [] as Row[],
        enrichmentJobItem: [] as Row[],
        articleContentVersion: [] as Row[],
    };
    type State = typeof state;
    let sequence = 0;
    let queue = Promise.resolve();
    let failVersion = false;
    let failItem = false;
    const queries: Prisma.Sql[] = [];
    const count = (value: unknown) =>
        value instanceof Date ? value.getTime() : value;
    const matches = (row: Row, where: Row | undefined, draft: State): boolean =>
        !where ||
        Object.entries(where).every(([key, condition]) => {
            if (key === 'OR')
                return condition.some((part: Row) => matches(row, part, draft));
            if (key === 'NOT') return !matches(row, condition, draft);
            if (key === 'items')
                return draft.enrichmentJobItem.some(
                    (item) =>
                        item.jobId === row.id &&
                        matches(item, condition.some, draft),
                );
            if (key === 'job')
                return matches(
                    draft.enrichmentJob.find((job) => job.id === row.jobId)!,
                    condition,
                    draft,
                );
            if (key === 'clusterLinks') return row._count.clusterLinks === 0;
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
                        if (operator === 'not') return actual !== expected;
                        if (operator === 'lte')
                            return (
                                count(actual) !== null &&
                                (count(actual) as number) <=
                                    (count(expected) as number)
                            );
                        if (operator === 'gt')
                            return (
                                count(actual) !== null &&
                                (count(actual) as number) >
                                    (count(expected) as number)
                            );
                        assert.fail(`Unexpected condition ${operator}`);
                    },
                );
            }
            return count(actual) === count(condition);
        });
    const project = (row: Row | undefined, select?: Row) => {
        if (!row) return null;
        return structuredClone(
            select
                ? Object.fromEntries(
                      Object.keys(select).map((key) => [key, row[key]]),
                  )
                : row,
        );
    };
    const client = (get: () => State): any => {
        const value: Row = {};
        for (const model of [
            'article',
            'enrichmentJob',
            'enrichmentJobItem',
            'articleContentVersion',
        ] as const) {
            const find = (args: Row = {}) =>
                get()[model].filter((row) => matches(row, args.where, get()));
            const update = (row: Row, data: Row) => {
                for (const [key, next] of Object.entries(data)) {
                    if (next === undefined) continue;
                    row[key] =
                        next === Prisma.DbNull
                            ? null
                            : next &&
                                typeof next === 'object' &&
                                'increment' in next
                              ? row[key] + next.increment
                              : structuredClone(next);
                }
                if (!data.updatedAt) row.updatedAt = new Date(time);
            };
            const create = (data: Row) => {
                if (model === 'articleContentVersion' && failVersion)
                    throw new Error('Version persistence failed');
                if (model === 'enrichmentJobItem' && failItem)
                    throw new Error('Item persistence failed');
                const row = {
                    id: `${model}-${++sequence}`,
                    createdAt: new Date(time),
                    updatedAt: new Date(time),
                    ...(model === 'enrichmentJob'
                        ? { status: 'QUEUED', total: 0, requestId: null }
                        : {}),
                    ...(model === 'enrichmentJobItem'
                        ? {
                              status: 'PENDING',
                              attempts: 0,
                              leaseToken: null,
                              leaseExpiresAt: null,
                              proposal: null,
                              proposalStatus: null,
                              reason: null,
                              expectedArticleUpdatedAt: null,
                          }
                        : {}),
                    ...structuredClone(data),
                };
                get()[model].push(row);
                return structuredClone(row);
            };
            value[model] = {
                findUnique: async (args: Row) =>
                    project(find(args)[0], args.select),
                findUniqueOrThrow: async (args: Row) => {
                    const row = project(find(args)[0], args.select);
                    if (!row) throw new Error('Missing row');
                    return row;
                },
                findFirst: async (args: Row) =>
                    project(find(args)[0], args.select),
                findMany: async (args: Row = {}) =>
                    find(args)
                        .slice(
                            args.skip ?? 0,
                            args.take === undefined
                                ? undefined
                                : (args.skip ?? 0) + args.take,
                        )
                        .map((row) => project(row, args.select)),
                count: async (args: Row = {}) => find(args).length,
                create: async ({ data }: Row) => create(data),
                createMany: async ({ data }: Row) => {
                    data.forEach(create);
                    return { count: data.length };
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
                groupBy: async (args: Row) => {
                    const grouped = new Map<string, number>();
                    find(args).forEach(({ status }) =>
                        grouped.set(status, (grouped.get(status) ?? 0) + 1),
                    );
                    return [...grouped].map(([status, n]) => ({
                        status,
                        _count: { _all: n },
                    }));
                },
            };
        }
        value.$queryRaw = async (sql: Prisma.Sql) => {
            queries.push(sql);
            if (sql.sql.includes('FROM "Article" a')) {
                const selected = sql.values.find(
                    (value) =>
                        typeof value === 'string' && value.startsWith('['),
                );
                const ids = selected
                    ? (JSON.parse(String(selected)) as string[])
                    : null;
                return get()
                    .article.filter(({ id }) => !ids || ids.includes(id))
                    .map(({ id }) => ({ id }));
            }
            if (sql.sql.includes('SKIP LOCKED')) {
                assert.match(sql.sql, /FOR UPDATE OF j SKIP LOCKED/);
                const now = sql.values.find(
                    (value) => value instanceof Date,
                ) as Date;
                const job = get().enrichmentJob.find(
                    (job) =>
                        ['QUEUED', 'RUNNING'].includes(job.status) &&
                        get().enrichmentJobItem.some(
                            (item) =>
                                item.jobId === job.id &&
                                (item.status === 'PENDING' ||
                                    (item.status === 'RUNNING' &&
                                        item.leaseExpiresAt <= now)),
                        ),
                );
                return job ? [{ id: job.id }] : [];
            }
            assert.match(sql.sql, /FOR UPDATE/);
            return get()
                .enrichmentJob.filter(({ id }) => id === sql.values[0])
                .map(({ id }) => ({ id }));
        };
        return value;
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
        now: () => new Date(time),
        advance: (ms: number) => {
            time = new Date(time.getTime() + ms);
        },
        get state() {
            return state;
        },
        queries,
        failVersions: () => {
            failVersion = true;
        },
        failItems: () => {
            failItem = true;
        },
    };
}

const createJob = (
    db: ReturnType<typeof database>,
    ids?: string[],
    requestId?: string,
) =>
    startEnrichmentJob({
        prisma: db.prisma,
        createdByUserId: 'editor',
        now: db.now,
        requestId,
        scope: ids
            ? { type: 'SELECTED', ids }
            : { type: 'FILTERED', filters: { onlyProblematic: false } },
    });

test('job validation bounds pagination and requires exact scope and restore versions', () => {
    assert.equal(
        parseEnrichmentJobRequest({ scope: { type: 'SELECTED', ids: ['a'] } })
            .scope.type,
        'SELECTED',
    );
    for (const request of [
        null,
        { scope: { type: 'ALL' } },
        { scope: { type: 'SELECTED', ids: ['a', 'a'] } },
        { scope: { type: 'FILTERED', filters: {} }, requestId: 'bad' },
    ])
        assert.throws(() => parseEnrichmentJobRequest(request));
    assert.deepEqual(parseEnrichmentPagination({ page: '2', limit: '500' }), {
        page: 2,
        limit: 100,
    });
    assert.throws(() => parseEnrichmentPagination({ page: '1.5' }));
    assert.throws(() => parseEnrichmentExpectedVersion({}));
    assert.equal(
        parseEnrichmentExpectedVersion({
            expectedUpdatedAt: initialTime.toISOString(),
        }).getTime(),
        initialTime.getTime(),
    );
});

test('start freezes eligible, protected and missing articles atomically and request IDs reuse the original selection', async () => {
    const db = database([
        article('a'),
        article('rejected', { status: 'REJECTED' }),
    ]);
    const requestId = 'b7b3499b-9305-4c98-bbcc-f0c9baf449a3';
    const first = await createJob(db, ['a', 'rejected', 'deleted'], requestId);
    assert.equal(first.job.total, 3);
    assert.equal(first.job.counts.PENDING, 1);
    assert.equal(first.job.counts.SKIPPED, 2);
    assert.equal(
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt.getTime(),
        initialTime.getTime(),
    );
    db.state.article[0].updatedAt = new Date(initialTime.getTime() + 1000);
    db.state.enrichmentJob[0].scope = {
        type: 'SELECTED',
        ids: ['a', 'deleted', 'rejected'],
    }; // JSONB key order differs.
    const same = await createJob(db, ['deleted', 'rejected', 'a'], requestId);
    assert.equal(same.job.id, first.job.id);
    assert.equal(db.state.enrichmentJobItem.length, 3);
    assert.equal(
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt.getTime(),
        initialTime.getTime(),
    );
    await assert.rejects(
        createJob(db, ['a'], requestId),
        /different selection/,
    );
    await assert.rejects(
        startEnrichmentJob({
            prisma: db.prisma,
            scope: { type: 'SELECTED', ids: ['a', 'rejected', 'deleted'] },
            createdByUserId: 'someone-else',
            requestId,
        }),
        /different selection/,
    );
    const failed = database([article('a')]);
    failed.failItems();
    await assert.rejects(createJob(failed), /Item persistence/);
    assert.equal(failed.state.enrichmentJob.length, 0);
    assert.equal(failed.state.enrichmentJobItem.length, 0);
});

test('details paginate items while counts cover the whole job and omit proposal bodies', async () => {
    const db = database(
        Array.from({ length: 105 }, (_, i) => article(`a-${i}`)),
    );
    const { job } = await createJob(db);
    const details = await getEnrichmentJob({
        prisma: db.prisma,
        jobId: job.id,
        page: 99,
        limit: 50,
    });
    assert.equal(details.pagination.page, 3);
    assert.equal(details.pagination.total, 105);
    assert.equal(details.items.length, 5);
    assert.equal(details.job.counts.PENDING, 105);
    assert.equal('proposal' in details.items[0], false);
    assert.equal('leaseToken' in details.items[0], false);
});

test('recent job limits never hide older running work, pending proposals or retryable errors', async () => {
    const db = database([article('a')]);
    const { job } = await createJob(db);
    const proposal = {
        ...db.state.enrichmentJob[0],
        id: 'proposal-old',
        status: 'COMPLETED',
    };
    const failed = {
        ...db.state.enrichmentJob[0],
        id: 'failed-old',
        status: 'COMPLETED',
    };
    db.state.enrichmentJob.push(proposal, failed);
    db.state.enrichmentJobItem.push(
        {
            ...db.state.enrichmentJobItem[0],
            id: 'proposal-item',
            jobId: proposal.id,
            status: 'PROPOSED',
            proposalStatus: 'PENDING',
        },
        {
            ...db.state.enrichmentJobItem[0],
            id: 'failed-item',
            jobId: failed.id,
            status: 'ERROR',
        },
    );
    for (let index = 0; index < 25; index++)
        db.state.enrichmentJob.push({
            ...proposal,
            id: `recent-${index}`,
            total: 0,
        });
    const result = await listEnrichmentJobs({ prisma: db.prisma, limit: 2 });
    assert.equal(result.jobs.length, 5);
    assert.ok(result.jobs.some(({ id }) => id === job.id));
    assert.ok(result.jobs.some(({ id }) => id === proposal.id));
    assert.ok(result.jobs.some(({ id }) => id === failed.id));
});

test('overlapping workers claim an item once, recover an expired lease and reject the former owner', async () => {
    const db = database([article('a')]);
    await createJob(db);
    const claims = await Promise.all([
        claimEnrichmentItem({ prisma: db.prisma, now: db.now, leaseMs: 1000 }),
        claimEnrichmentItem({ prisma: db.prisma, now: db.now, leaseMs: 1000 }),
    ]);
    const first = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1);
    db.advance(1001);
    const recovered = await claimEnrichmentItem({
        prisma: db.prisma,
        now: db.now,
        leaseMs: 1000,
    });
    assert.ok(recovered);
    assert.notEqual(recovered.leaseToken, first.leaseToken);
    assert.equal(
        await renewEnrichmentLease({
            prisma: db.prisma,
            claim: first,
            now: db.now,
        }),
        false,
    );
    assert.equal(
        await settleEnrichmentClaim({
            prisma: db.prisma,
            claim: first,
            candidate: fullCandidate('a'),
            now: db.now,
        }),
        false,
    );
    assert.equal(db.state.article[0].content, null);
    await settleEnrichmentClaim({
        prisma: db.prisma,
        claim: recovered,
        candidate: fullCandidate('a'),
        now: db.now,
    });
    assert.equal(db.state.enrichmentJobItem[0].status, 'FULL_TEXT');
    assert.equal(db.state.enrichmentJobItem[0].attempts, 2);
    assert.equal(db.state.articleContentVersion.length, 1);
    assert.equal(db.state.enrichmentJob[0].status, 'COMPLETED');
});

test('stop cancels pending work while an already running item may finish; expired canceled work cannot remain running', async () => {
    const db = database([article('a'), article('b')]);
    const { job } = await createJob(db);
    const claim = await claimEnrichmentItem({ prisma: db.prisma, now: db.now });
    assert.ok(claim);
    await stopEnrichmentJob({ prisma: db.prisma, jobId: job.id });
    assert.deepEqual(
        db.state.enrichmentJobItem.map(({ status }) => status),
        ['RUNNING', 'CANCELED'],
    );
    assert.equal(
        await claimEnrichmentItem({ prisma: db.prisma, now: db.now }),
        null,
    );
    await settleEnrichmentClaim({
        prisma: db.prisma,
        claim,
        candidate: fullCandidate('a'),
        now: db.now,
    });
    assert.deepEqual(
        db.state.enrichmentJobItem.map(({ status }) => status),
        ['FULL_TEXT', 'CANCELED'],
    );
    assert.equal(db.state.enrichmentJob[0].status, 'CANCELED');
    const abandoned = database([article('a')]);
    const created = await createJob(abandoned);
    await claimEnrichmentItem({
        prisma: abandoned.prisma,
        now: abandoned.now,
        leaseMs: 1000,
    });
    await stopEnrichmentJob({
        prisma: abandoned.prisma,
        jobId: created.job.id,
    });
    abandoned.advance(1001);
    await claimEnrichmentItem({ prisma: abandoned.prisma, now: abandoned.now });
    assert.equal(abandoned.state.enrichmentJobItem[0].status, 'CANCELED');
});

test('retry changes only errors, preserves frozen versions, and never fetches a changed article', async () => {
    const db = database([article('a')]);
    const { job } = await createJob(db);
    let calls = 0;
    await runEnrichmentWorkerOnce({
        prisma: db.prisma,
        now: db.now,
        heartbeatMs: 0,
        retrieve: async () => {
            calls++;
            throw new Error('Timed out');
        },
    });
    assert.equal(db.state.enrichmentJobItem[0].status, 'ERROR');
    const original =
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt.getTime();
    await retryEnrichmentJobErrors({ prisma: db.prisma, jobId: job.id });
    assert.equal(
        db.state.enrichmentJobItem[0].expectedArticleUpdatedAt.getTime(),
        original,
    );
    db.state.article[0].updatedAt = new Date(initialTime.getTime() + 1);
    await runEnrichmentWorkerOnce({
        prisma: db.prisma,
        now: db.now,
        heartbeatMs: 0,
        retrieve: async () => {
            calls++;
            return { candidate: fullCandidate('a'), reasons: [] };
        },
    });
    assert.equal(calls, 1);
    assert.equal(db.state.enrichmentJobItem[0].status, 'SKIPPED');
    await retryEnrichmentJobErrors({ prisma: db.prisma, jobId: job.id });
    assert.equal(db.state.enrichmentJobItem[0].status, 'SKIPPED');
});

test('content, version and item completion are atomic when history storage fails', async () => {
    const original = article('a', {
        status: 'APPROVED',
        embedding: [1, 0],
        embeddingModel: 'model',
        embeddingBasis: 'SUMMARY_ONLY',
    });
    const db = database([original]);
    await createJob(db);
    db.failVersions();
    await runEnrichmentWorkerOnce({
        prisma: db.prisma,
        now: db.now,
        heartbeatMs: 0,
        retrieve: async () => ({ candidate: fullCandidate('a'), reasons: [] }),
    });
    assert.deepEqual(db.state.article[0], original);
    assert.equal(db.state.articleContentVersion.length, 0);
    assert.equal(db.state.enrichmentJobItem[0].status, 'ERROR');
    assert.match(db.state.enrichmentJobItem[0].reason, /Version persistence/);
});

test('a manual edit during retrieval is skipped and its text is preserved', async () => {
    const db = database([article('a')]);
    await createJob(db);
    await runEnrichmentWorkerOnce({
        prisma: db.prisma,
        now: db.now,
        heartbeatMs: 0,
        retrieve: async () => {
            db.state.article[0].content =
                'Text entered by the editor while the request was in progress.';
            db.state.article[0].updatedAt = new Date(initialTime.getTime() + 1);
            return { candidate: fullCandidate('a'), reasons: [] };
        },
    });
    assert.match(db.state.article[0].content, /Text entered by the editor/);
    assert.equal(db.state.enrichmentJobItem[0].status, 'SKIPPED');
    assert.equal(db.state.articleContentVersion.length, 0);
});
