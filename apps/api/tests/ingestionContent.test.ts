import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    ContentAvailability,
    Prisma,
    type PrismaClient,
} from '@prisma/client';
import { mapFeedItemToArticleInput } from '../src/core/ingestionNews/parse/mapArticleCandidate';
import { normalizeArticleCandidate } from '../src/core/normalize/article/normalizeArticleCandidate';
import { detectContentAvailability } from '../src/core/normalize/article/detectContentAvailability';
import {
    getArticleTextHash,
    assessArticleText,
    makeManualContentAssessment,
} from '../src/core/ingestionNews/enrich/articleContentQuality';
import { saveParsedArticles } from '../src/core/ingestionNews/parse/saveParsedArticles';
import { syncPoliticsSources } from '../src/core/ingestionNews/parse/syncSources';
import type {
    ArticleCreateCandidate,
    ParseSourceInput,
} from '../src/core/ingestionNews/parse/types';
import type { AutomaticEnrichmentContext } from '../src/core/enrichmentJobs/automaticEnrichment';

const source: ParseSourceInput = {
    id: 'source-1',
    name: 'A publisher',
    baseUrl: 'https://example.org/feed',
    accessMode: 'METADATA_ONLY',
    fetchMode: 'RSS',
    language: 'en',
};
const body = 'The council voted today.\n\nThe new rules take effect on Monday.';
function candidate(content = body): ArticleCreateCandidate {
    return {
        sourceId: source.id,
        url: 'https://example.org/article',
        title: 'Council approves new rules',
        summary:
            'The council has approved new local rules at its public meeting.',
        content,
        contentAssessment: assessArticleText({ text: content }),
        cleanedAccessibleText: null,
        imageUrl: null,
        publishedAt: null,
        language: 'en',
        country: null,
        rawPayload: { content },
    };
}
function article() {
    const feed = candidate();
    return {
        ...feed,
        id: 'article-1',
        updatedAt: new Date('2026-09-01T12:00:00Z'),
        status: ArticleStatus.EMBEDDED as ArticleStatus,
        contentAvailability:
            ContentAvailability.PARTIAL_TEXT as ContentAvailability,
        contentProvenance: {
            origin: 'INGESTION',
            textHash: getArticleTextHash(feed.content ?? ''),
        } as unknown,
        embedding: [0.2, 0.8] as number[] | null,
        embeddingBasis: 'PARTIAL_TEXT' as string | null,
        embeddingModel: 'test-model' as string | null,
        _count: { clusterLinks: 0 },
    };
}

// In-memory transaction double; no publisher or PostgreSQL calls are made.
function database(initial: ReturnType<typeof article> | null = null) {
    let state = structuredClone(initial);
    const versions: Record<string, unknown>[] = [];
    const raw: Record<string, unknown>[] = [];
    type QueueRow = Record<string, any>;
    const jobs: QueueRow[] = [];
    const items: QueueRow[] = [];
    let beforeWrite: (() => void) | undefined;
    let failVersion = false;
    let queueFailure: Error | undefined;
    const equal = (left: unknown, right: unknown) =>
        left instanceof Date && right instanceof Date
            ? left.getTime() === right.getTime()
            : left === right;
    const matches = (row: QueueRow, where: QueueRow) =>
        Object.entries(where).every(([key, value]) => {
            if (
                value &&
                typeof value === 'object' &&
                !(value instanceof Date)
            ) {
                if ('in' in value) return value.in.includes(row[key]);
                if ('not' in value) return row[key] !== value.not;
                assert.fail(`Unexpected queue filter ${key}`);
            }
            return equal(row[key], value);
        });
    const queueModel = (rows: QueueRow[]) => {
        const find = (where: QueueRow) =>
            rows.find((row) => matches(row, where));
        const update = (row: QueueRow, data: QueueRow) => {
            for (const [key, value] of Object.entries(data))
                row[key] =
                    value === Prisma.DbNull
                        ? null
                        : value &&
                            typeof value === 'object' &&
                            'increment' in value
                          ? row[key] + value.increment
                          : structuredClone(value);
            return structuredClone(row);
        };
        return {
            findUnique: async ({ where }: { where: QueueRow }) =>
                structuredClone(find(where) ?? null),
            findUniqueOrThrow: async ({ where }: { where: QueueRow }) => {
                const row = find(where);
                assert.ok(row);
                return structuredClone(row);
            },
            upsert: async ({ where, create, update: data }: QueueRow) => {
                if (
                    queueFailure instanceof
                        Prisma.PrismaClientKnownRequestError &&
                    queueFailure.code === 'P2002'
                )
                    throw queueFailure;
                const existing = find(where);
                if (existing) return update(existing, data);
                const row = { status: 'QUEUED', ...structuredClone(create) };
                rows.push(row);
                return structuredClone(row);
            },
            createMany: async ({ data, skipDuplicates }: QueueRow) => {
                if (queueFailure) throw queueFailure;
                let count = 0;
                for (const value of data) {
                    const duplicate = rows.some(
                        (row) =>
                            row.jobId === value.jobId &&
                            row.articleId === value.articleId,
                    );
                    if (duplicate && skipDuplicates) continue;
                    assert.equal(duplicate, false);
                    rows.push({
                        id: `item-${rows.length + 1}`,
                        attempts: 0,
                        leaseToken: null,
                        leaseExpiresAt: null,
                        proposal: null,
                        proposalStatus: null,
                        ...structuredClone(value),
                    });
                    count++;
                }
                return { count };
            },
            update: async ({ where, data }: QueueRow) => {
                const row = find(where);
                assert.ok(row);
                return update(row, data);
            },
            updateMany: async ({ where, data }: QueueRow) => {
                const matching = rows.filter((row) => matches(row, where));
                matching.forEach((row) => update(row, data));
                return { count: matching.length };
            },
            count: async ({ where }: QueueRow) =>
                rows.filter((row) => matches(row, where)).length,
        };
    };
    const tx = {
        enrichmentJob: queueModel(jobs),
        enrichmentJobItem: queueModel(items),
        $queryRaw: async (sql: Prisma.Sql) => {
            assert.match(sql.sql, /FROM "EnrichmentJob"[\s\S]*FOR UPDATE/);
            return jobs
                .filter(({ id }) => id === sql.values[0])
                .map(({ id }) => ({ id }));
        },
        article: {
            findUnique: async () => structuredClone(state),
            create: async ({ data }: { data: Record<string, unknown> }) => {
                state = {
                    ...article(),
                    status: ArticleStatus.NEW,
                    embedding: null,
                    embeddingBasis: null,
                    embeddingModel: null,
                    ...Object.fromEntries(
                        Object.entries(data).map(([key, value]) => [
                            key,
                            value === Prisma.DbNull ? null : value,
                        ]),
                    ),
                } as ReturnType<typeof article>;
                return structuredClone(state);
            },
            updateMany: async ({
                where,
                data,
            }: {
                where: {
                    id: string;
                    updatedAt: Date;
                    status: ArticleStatus;
                    clusterLinks: unknown;
                };
                data: Record<string, unknown>;
            }) => {
                assert.deepEqual(where.clusterLinks, { none: {} });
                beforeWrite?.();
                beforeWrite = undefined;
                if (
                    !state ||
                    state.id !== where.id ||
                    state.updatedAt.getTime() !== where.updatedAt.getTime() ||
                    state.status !== where.status ||
                    state._count.clusterLinks > 0
                )
                    return { count: 0 };
                for (const [key, value] of Object.entries(data))
                    Reflect.set(
                        state,
                        key,
                        value === Prisma.DbNull ? null : value,
                    );
                return { count: 1 };
            },
        },
        articleRaw: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                raw.push(data);
                return data;
            },
        },
        articleContentVersion: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                if (failVersion) throw new Error('Version write failed');
                versions.push(data);
                return data;
            },
        },
    };
    return {
        get: () => structuredClone(state),
        raw,
        versions,
        jobs,
        items,
        beforeWrite: (callback: () => void) => {
            beforeWrite = callback;
        },
        concurrentEdit: () => {
            if (state) {
                state.content = 'A concurrent editorial replacement.';
                state.updatedAt = new Date(state.updatedAt.getTime() + 1);
            }
        },
        failVersion: () => {
            failVersion = true;
        },
        failQueue: (error?: Error) => {
            queueFailure = error;
        },
        prisma: {
            article: tx.article,
            $transaction: async <T>(run: (client: unknown) => Promise<T>) => {
                const before = structuredClone(state);
                const rawCount = raw.length;
                const versionCount = versions.length;
                const previousJobs = structuredClone(jobs);
                const previousItems = structuredClone(items);
                try {
                    return await run(tx);
                } catch (error) {
                    state = before;
                    raw.length = rawCount;
                    versions.length = versionCount;
                    jobs.splice(0, jobs.length, ...previousJobs);
                    items.splice(0, items.length, ...previousItems);
                    throw error;
                }
            },
        } as unknown as PrismaClient,
    };
}

test('METADATA_ONLY and FULL_OPEN preserve the same RSS body through normalization, including short text', () => {
    const item = {
        title: candidate().title,
        link: candidate().url,
        summary: candidate().summary ?? undefined,
        content:
            '<p>The council voted today.</p><p>The new rules take effect on Monday.</p>',
    };
    const metadata = normalizeArticleCandidate(
        mapFeedItemToArticleInput(source, item),
    );
    const open = normalizeArticleCandidate(
        mapFeedItemToArticleInput({ ...source, accessMode: 'FULL_OPEN' }, item),
    );
    assert.deepEqual(metadata, open);
    assert.equal(metadata?.content, body);
    assert.equal(metadata?.cleanedAccessibleText, null);
    assert.equal(
        metadata?.contentAssessment?.textHash,
        getArticleTextHash(body),
    );
    assert.equal(
        detectContentAvailability(metadata!),
        ContentAvailability.PARTIAL_TEXT,
    );
});

test('RSS normalization retains access notices and truncation evidence and does not decode text twice', () => {
    const input = normalizeArticleCandidate(
        mapFeedItemToArticleInput(source, {
            title: candidate().title,
            link: candidate().url,
            content:
                '<p>A &amp; B reported the literal &amp;amp; token. Subscribe to read the full article.</p><p>Read more</p>',
        }),
    );
    assert.match(input?.content ?? '', /A & B/);
    assert.match(input?.content ?? '', /literal &amp; token/);
    assert.match(input?.content ?? '', /Read more$/);
    assert.equal(input?.contentAssessment?.signals.paywall, true);
    assert.equal(input?.contentAssessment?.signals.truncated, true);
    assert.equal(input?.contentAssessment?.fullText, false);
});

test('initial ingest retains body and raw data with hash-bound provenance and no character-length certification', async () => {
    const db = database();
    const result = await saveParsedArticles(db.prisma, [candidate(), null]);
    assert.equal(result.created, 1);
    assert.equal(result.skippedInvalid, 1);
    assert.equal(db.get()?.content, body);
    assert.deepEqual(
        db.get()?.contentProvenance &&
            (db.get()?.contentProvenance as { textHash: string }).textHash,
        getArticleTextHash(body),
    );
    assert.equal(
        db.get()?.contentAvailability,
        ContentAvailability.PARTIAL_TEXT,
    );
    assert.equal(db.raw.length, 1);
});

const automaticContext: AutomaticEnrichmentContext = {
    jobId: 'fetch-with-automatic-enrichment',
    createdByUserId: 'editor',
};

test('automatic ingestion commits the new article, raw source and one version-bound queue item together', async () => {
    const db = database();
    const result = await saveParsedArticles(
        db.prisma,
        [candidate(), null, candidate()],
        automaticContext,
    );
    assert.deepEqual(result, {
        created: 1,
        updated: 0,
        skippedDuplicates: 1,
        skippedInvalid: 1,
    });
    const saved = db.get();
    assert.ok(saved);
    assert.equal(saved.status, ArticleStatus.NEW);
    assert.equal(saved.content, body);
    assert.equal(db.raw.length, 1);
    assert.equal(db.raw[0].articleId, saved.id);
    assert.equal(db.jobs.length, 1);
    assert.equal(db.jobs[0].id, automaticContext.jobId);
    assert.equal(db.jobs[0].createdByUserId, automaticContext.createdByUserId);
    assert.equal(db.jobs[0].total, 1);
    assert.equal(db.items.length, 1);
    assert.equal(db.items[0].articleId, saved.id);
    assert.equal(db.items[0].title, saved.title);
    assert.equal(db.items[0].status, 'PENDING');
    assert.deepEqual(db.items[0].expectedArticleUpdatedAt, saved.updatedAt);
});

test('automatic queue failures roll back article and raw writes, surface queue constraints, and allow the same fetch to retry', async () => {
    for (const failure of [
        new Error('Queue insertion failed'),
        new Prisma.PrismaClientKnownRequestError('Queue constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['requestId'] },
        }),
    ]) {
        const db = database();
        db.failQueue(failure);
        await assert.rejects(
            saveParsedArticles(db.prisma, [candidate()], automaticContext),
            (error) => error === failure,
        );
        assert.equal(db.get(), null);
        assert.equal(db.raw.length, 0);
        assert.equal(db.versions.length, 0);
        assert.equal(db.jobs.length, 0);
        assert.equal(db.items.length, 0);
        db.failQueue();
        const retried = await saveParsedArticles(
            db.prisma,
            [candidate()],
            automaticContext,
        );
        assert.equal(retried.created, 1);
        assert.equal(db.raw.length, 1);
        assert.equal(db.jobs.length, 1);
        assert.equal(db.jobs[0].total, 1);
        assert.equal(db.items.length, 1);
    }
});

test('automatic ingestion excludes existing and manually edited articles and already verified full text', async () => {
    const complete = {
        ...article(),
        contentAvailability: ContentAvailability.FULL_TEXT,
        contentAssessment: makeManualContentAssessment(body),
    };
    const manual = {
        ...article(),
        contentProvenance: {
            origin: 'MANUAL',
            textHash: getArticleTextHash(body),
        },
    };
    const expanded = candidate(
        `${body}\n\nAn additional paragraph explains the decision.`,
    );
    for (const { initial, incoming, updated } of [
        { initial: article(), incoming: expanded, updated: 1 },
        { initial: manual, incoming: expanded, updated: 0 },
        { initial: complete, incoming: candidate(), updated: 0 },
    ]) {
        const db = database(initial);
        const result = await saveParsedArticles(
            db.prisma,
            [incoming],
            automaticContext,
        );
        assert.equal(result.created, 0);
        assert.equal(result.updated, updated);
        assert.equal(db.jobs.length, 0);
        assert.equal(db.items.length, 0);
        if (!updated) assert.deepEqual(db.get(), initial);
    }
    const verifiedNew = database();
    const result = await saveParsedArticles(
        verifiedNew.prisma,
        [
            {
                ...candidate(),
                contentAssessment: makeManualContentAssessment(body),
            },
        ],
        automaticContext,
    );
    assert.equal(result.created, 1);
    assert.equal(verifiedNew.get()?.contentAvailability, 'FULL_TEXT');
    assert.equal(verifiedNew.jobs.length, 0);
    assert.equal(verifiedNew.items.length, 0);
});

test('an improved duplicate within the same fetch follows the saved version without adding work or adopting a later manual edit', async () => {
    const db = database();
    await saveParsedArticles(
        db.prisma,
        [candidate('The council voted today...')],
        automaticContext,
    );
    const originalVersion = db.items[0].expectedArticleUpdatedAt;
    Object.assign(db.items[0], {
        status: 'RUNNING',
        leaseToken: 'first-version-worker',
        leaseExpiresAt: new Date(Date.now() + 120000),
    });
    db.jobs[0].status = 'RUNNING';
    const result = await saveParsedArticles(
        db.prisma,
        [candidate()],
        automaticContext,
    );
    assert.equal(result.updated, 1);
    assert.equal(db.get()?.content, body);
    assert.equal(db.raw.length, 1);
    assert.equal(db.versions.length, 1);
    assert.equal(db.jobs.length, 1);
    assert.equal(db.jobs[0].total, 1);
    assert.equal(db.items.length, 1);
    assert.equal(db.items[0].status, 'PENDING');
    assert.equal(db.items[0].leaseToken, null);
    assert.equal(db.items[0].leaseExpiresAt, null);
    assert.ok(db.items[0].expectedArticleUpdatedAt > originalVersion);
    assert.deepEqual(db.items[0].expectedArticleUpdatedAt, db.get()?.updatedAt);
    const beforeManualEdit = structuredClone(db.items[0]);
    db.concurrentEdit();
    const protectedResult = await saveParsedArticles(
        db.prisma,
        [candidate(`${body}\n\nMore details arrived in another source feed.`)],
        automaticContext,
    );
    assert.equal(protectedResult.skippedDuplicates, 1);
    assert.equal(db.get()?.content, 'A concurrent editorial replacement.');
    assert.deepEqual(db.items[0], beforeManualEdit);
    assert.equal(db.jobs[0].total, 1);
});

test('feed refresh extends known machine fragments and records the old body while invalidating vectors', async () => {
    const initial = article();
    initial.content = 'The council voted today...';
    initial.contentProvenance = {
        origin: 'INGESTION',
        textHash: getArticleTextHash(initial.content),
    };
    const db = database(initial);
    const result = await saveParsedArticles(db.prisma, [candidate()]);
    assert.equal(result.updated, 1);
    assert.equal(db.get()?.content, body);
    assert.equal(db.get()?.summary, initial.summary);
    assert.equal(db.get()?.status, ArticleStatus.REVIEWED);
    assert.equal(db.get()?.embedding, null);
    assert.equal(db.versions.length, 1);
    assert.equal(
        (db.versions[0].before as Record<string, unknown>).content,
        initial.content,
    );
});

test('feed refresh preserves manual, legacy unknown, stale-provenance and linked/rejected articles', async () => {
    const cases = [
        { contentProvenance: null },
        {
            contentProvenance: {
                origin: 'MANUAL',
                textHash: getArticleTextHash(body),
            },
        },
        { contentProvenance: { origin: 'INGESTION', textHash: 'stale' } },
        { _count: { clusterLinks: 1 } },
        { status: ArticleStatus.REJECTED },
        { status: ArticleStatus.CLUSTERED },
        {
            content: null,
            cleanedAccessibleText: 'A manually recovered article paragraph.',
            contentProvenance: null,
        },
    ];
    for (const overrides of cases) {
        const initial = { ...article(), ...overrides };
        const db = database(initial);
        const result = await saveParsedArticles(db.prisma, [
            candidate(`${body}\n\nA new paragraph expands the report.`),
        ]);
        assert.equal(result.skippedDuplicates, 1);
        assert.deepEqual(db.get(), initial);
        assert.equal(db.versions.length, 0);
    }
});

test('concurrent edits win and a failed history write rolls back the ingestion text update', async () => {
    const expanded = candidate(
        `${body}\n\nAn additional paragraph explains the decision.`,
    );
    const db = database(article());
    db.beforeWrite(db.concurrentEdit);
    assert.equal(
        (await saveParsedArticles(db.prisma, [expanded])).skippedDuplicates,
        1,
    );
    assert.equal(db.get()?.content, 'A concurrent editorial replacement.');
    assert.equal(db.versions.length, 0);
    const atomic = database(article());
    const original = atomic.get();
    atomic.failVersion();
    await assert.rejects(
        saveParsedArticles(atomic.prisma, [expanded]),
        /Version write failed/,
    );
    assert.deepEqual(atomic.get(), original);
});

test('source synchronization supplies new defaults and preserves existing activation and access settings', async () => {
    let calls = 0;
    const prisma = {
        source: {
            upsert: async ({
                update,
                create,
            }: {
                update: Record<string, unknown>;
                create: Record<string, unknown>;
            }) => {
                calls++;
                assert.deepEqual(update, {});
                assert.equal(create.isActive, true);
                return { ...create, isActive: false, accessMode: 'FULL_OPEN' };
            },
        },
    } as unknown as PrismaClient;
    const result = await syncPoliticsSources(prisma);
    assert.ok(calls > 0);
    assert.equal(result.length, calls);
    assert.ok(
        result.every(
            (item) =>
                item.isActive === false && item.accessMode === 'FULL_OPEN',
        ),
    );
});
