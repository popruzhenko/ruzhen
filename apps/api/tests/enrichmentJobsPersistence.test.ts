import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    ContentAvailability,
    Prisma,
    type ArticleContentVersion,
    type EnrichmentJobItem,
    type PrismaClient,
} from '@prisma/client';
import {
    applyEnrichmentProposal,
    candidateDecision,
    dismissEnrichmentProposal,
    persistEnrichmentCandidate,
    restoreArticleContentVersion,
} from '../src/core/enrichmentJobs/persistence';
import { snapshotContent } from '../src/core/enrichmentJobs/contentVersions';
import type {
    EnrichmentArticle,
    EnrichmentCandidate,
} from '../src/core/enrichmentJobs/types';
import {
    assessArticleText,
    getArticleTextHash,
    isCurrentFullTextAssessment,
    makeManualContentAssessment,
} from '../src/core/ingestionNews/enrich/articleContentQuality';

const initialTime = new Date('2026-09-09T10:00:00Z');
const laterTime = new Date('2026-09-09T11:00:00Z');
const title = 'City council approves the library renovation';
const url = 'https://publisher.example.com/news/library';
const fragment =
    'Council members approved the renovation after a public meeting. Detailed construction plans will be published next month.';
const completeText = [
    'Council members approved the library renovation after hearing comments from local residents at a public meeting. The project will improve access to the building and replace damaged windows on the upper floor.',
    'Construction is scheduled to begin in October after the contractor completes a detailed site survey. Library staff said the reading room will remain open while the work takes place outside.',
    'The council published its budget and timetable after the vote. Residents can submit further questions to the project office, and the next progress report will be presented in November.',
].join('\n\n');
const json = (value: unknown): Prisma.JsonValue =>
    JSON.parse(JSON.stringify(value));
const record = (value: unknown): Record<string, unknown> => {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    return value as Record<string, unknown>;
};

type ArticleFixture = EnrichmentArticle & {
    embedding: number[] | null;
    embeddingModel: string | null;
    embeddingBasis: string | null;
};

const article = (overrides: Partial<ArticleFixture> = {}): ArticleFixture => ({
    id: 'article-1',
    sourceId: 'source-1',
    url,
    title,
    summary:
        'The council approved library renovations and published the schedule after a public meeting.',
    content: fragment,
    cleanedAccessibleText: 'An editor-maintained accessible text.',
    imageUrl: 'https://publisher.example.com/original.jpg',
    publishedAt: initialTime,
    status: ArticleStatus.REVIEWED,
    contentAvailability: ContentAvailability.PARTIAL_TEXT,
    cleaningMethod: null,
    contentProvenance: null,
    contentAssessment: null,
    createdAt: initialTime,
    updatedAt: initialTime,
    _count: { clusterLinks: 0 },
    embedding: [0.25, 0.75],
    embeddingModel: 'existing-model',
    embeddingBasis: 'SUMMARY_ONLY',
    ...overrides,
});

const candidate = (
    content = completeText,
    overrides: Partial<EnrichmentCandidate> = {},
): EnrichmentCandidate => ({
    content,
    summary:
        'Publisher summary that must not replace an existing editorial summary.',
    imageUrl: 'https://publisher.example.com/new.jpg',
    sourceUrl: url,
    method: 'JSON_LD',
    assessment: assessArticleText({
        text: content,
        title,
        url,
        publishedAt: initialTime,
        evidence: {
            method: 'JSON_LD',
            sourceUrl: url,
            canonicalUrl: url,
            sourceTitle: title,
            sourceDate: initialTime.toISOString(),
            documentComplete: true,
            articleBody: true,
        },
    }),
    ...overrides,
});

const provenance = (origin: string, content = fragment) => ({
    origin,
    textHash: getArticleTextHash(content),
    editorNote: 'Keep editorial ownership',
});

const makeVersion = (
    before: ArticleFixture,
    after: ArticleFixture,
): ArticleContentVersion => ({
    id: 'version-original',
    articleId: before.id,
    actorUserId: 'original-editor',
    reason: 'ENRICHMENT',
    before: json(snapshotContent(before)),
    after: json(snapshotContent(after)),
    afterArticleUpdatedAt: after.updatedAt,
    jobItemId: null,
    restoredFromVersionId: null,
    createdAt: initialTime,
});

interface Store {
    article: ArticleFixture;
    item: EnrichmentJobItem;
    versions: ArticleContentVersion[];
}

// Serialize transactions and stage their writes. This checks the application's
// claim/CAS/rollback protocol; it does not emulate PostgreSQL locking or SQL.
function database(
    original = article(),
    options: {
        candidate?: EnrichmentCandidate;
        versions?: ArticleContentVersion[];
        failVersion?: boolean;
        forceConflict?: boolean;
        beforeArticleUpdate?: (current: ArticleFixture) => void;
    } = {},
) {
    let state: Store = {
        article: structuredClone(original),
        item: {
            id: 'item-1',
            jobId: 'job-1',
            articleId: original.id,
            title: original.title,
            expectedArticleUpdatedAt: initialTime,
            status: 'PROPOSED',
            proposalStatus: 'PENDING',
            proposal: json(options.candidate ?? candidate()),
            attempts: 1,
            leaseToken: null,
            leaseExpiresAt: null,
            reason: 'Existing text needs editorial review.',
            createdAt: initialTime,
            updatedAt: initialTime,
        },
        versions: structuredClone(options.versions ?? []),
    };
    let queue = Promise.resolve();
    const calls = {
        transactions: 0,
        articleUpdates: 0,
        versionCreates: 0,
        locks: 0,
    };
    const outsideTransaction = async () => {
        assert.fail('Persistence must use the transaction client');
    };
    const prisma = {
        article: {
            findUnique: outsideTransaction,
            updateMany: outsideTransaction,
        },
        enrichmentJobItem: {
            findUnique: outsideTransaction,
            updateMany: outsideTransaction,
            update: outsideTransaction,
        },
        articleContentVersion: {
            findUnique: outsideTransaction,
            create: outsideTransaction,
        },
        $queryRaw: outsideTransaction,
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
            calls.transactions++;
            const prior = queue;
            let release!: () => void;
            queue = new Promise<void>((resolve) => {
                release = resolve;
            });
            await prior;
            const draft = structuredClone(state);
            const update = (row: object, data: unknown) => {
                for (const [field, value] of Object.entries(record(data))) {
                    if (value !== undefined)
                        record(row)[field] =
                            value === Prisma.DbNull
                                ? null
                                : structuredClone(value);
                }
            };
            const tx = {
                $queryRaw: async (sql: Prisma.Sql) => {
                    calls.locks++;
                    assert.match(sql.sql, /FROM "EnrichmentJob".*FOR UPDATE/s);
                    assert.deepEqual(sql.values, ['job-1']);
                    return [{ id: 'job-1' }];
                },
                article: {
                    findUnique: async (args: Prisma.ArticleFindUniqueArgs) => {
                        if (args.where.id !== draft.article.id) return null;
                        return structuredClone(
                            args.select
                                ? Object.fromEntries(
                                      Object.keys(args.select).map((field) => [
                                          field,
                                          record(draft.article)[field],
                                      ]),
                                  )
                                : draft.article,
                        );
                    },
                    updateMany: async (args: Prisma.ArticleUpdateManyArgs) => {
                        calls.articleUpdates++;
                        const where = record(args.where);
                        assert.equal(where.id, draft.article.id);
                        assert.ok(where.updatedAt instanceof Date);
                        assert.equal(where.status, draft.article.status);
                        assert.deepEqual(where.clusterLinks, { none: {} });
                        options.beforeArticleUpdate?.(state.article);
                        if (
                            options.forceConflict ||
                            where.updatedAt.getTime() !==
                                state.article.updatedAt.getTime() ||
                            where.status !== state.article.status ||
                            state.article._count.clusterLinks > 0
                        )
                            return { count: 0 };
                        update(draft.article, args.data);
                        return { count: 1 };
                    },
                },
                enrichmentJobItem: {
                    findUnique: async (
                        args: Prisma.EnrichmentJobItemFindUniqueArgs,
                    ) =>
                        args.where.id === draft.item.id
                            ? structuredClone(
                                  args.select
                                      ? Object.fromEntries(
                                            Object.keys(args.select).map(
                                                (field) => [
                                                    field,
                                                    record(draft.item)[field],
                                                ],
                                            ),
                                        )
                                      : draft.item,
                              )
                            : null,
                    findUniqueOrThrow: async (
                        args: Prisma.EnrichmentJobItemFindUniqueOrThrowArgs,
                    ) => {
                        assert.equal(args.where.id, draft.item.id);
                        return structuredClone(draft.item);
                    },
                    updateMany: async (
                        args: Prisma.EnrichmentJobItemUpdateManyArgs,
                    ) => {
                        const where = record(args.where);
                        assert.equal(where.id, draft.item.id);
                        assert.equal(where.status, 'PROPOSED');
                        assert.equal(where.proposalStatus, 'PENDING');
                        if (
                            draft.item.status !== where.status ||
                            draft.item.proposalStatus !== where.proposalStatus
                        )
                            return { count: 0 };
                        update(draft.item, args.data);
                        return { count: 1 };
                    },
                    update: async (
                        args: Prisma.EnrichmentJobItemUpdateArgs,
                    ) => {
                        assert.equal(args.where.id, draft.item.id);
                        update(draft.item, args.data);
                        return structuredClone(draft.item);
                    },
                },
                articleContentVersion: {
                    findUnique: async (
                        args: Prisma.ArticleContentVersionFindUniqueArgs,
                    ) =>
                        structuredClone(
                            draft.versions.find(
                                ({ id }) => id === args.where.id,
                            ) ?? null,
                        ),
                    create: async (
                        args: Prisma.ArticleContentVersionCreateArgs,
                    ) => {
                        calls.versionCreates++;
                        if (options.failVersion)
                            throw new Error(
                                'Injected version persistence failure',
                            );
                        const created = {
                            actorUserId: null,
                            jobItemId: null,
                            restoredFromVersionId: null,
                            ...structuredClone(args.data),
                            id: `version-${draft.versions.length + 1}`,
                            createdAt: laterTime,
                        } as ArticleContentVersion;
                        draft.versions.push(created);
                        return structuredClone(created);
                    },
                },
            } as unknown as Prisma.TransactionClient;
            try {
                const result = await run(tx);
                state = draft;
                return result;
            } finally {
                release();
            }
        },
    } as unknown as PrismaClient;
    return { prisma, calls, snapshot: () => structuredClone(state) };
}

const apply = (
    db: ReturnType<typeof database>,
    expectedUpdatedAt = initialTime,
) =>
    applyEnrichmentProposal({
        prisma: db.prisma,
        itemId: 'item-1',
        expectedUpdatedAt,
        actorUserId: 'reviewing-editor',
        now: () => laterTime,
    });
const dismiss = (db: ReturnType<typeof database>) =>
    dismissEnrichmentProposal({ prisma: db.prisma, itemId: 'item-1' });

test('archive source and attempt history are saved atomically without replacing publication time', async () => {
    const retrieval: NonNullable<EnrichmentCandidate['retrieval']> = {
        provider: 'ARCHIVE_TODAY',
        originalUrl: url,
        retrievedUrl: 'https://archive.ph/Ab12C',
        retrievedAt: laterTime.toISOString(),
        archiveCapturedAt: '2026-09-10T08:00:00Z',
        attempts: [
            {
                provider: 'PUBLISHER_HTTP',
                outcome: 'ERROR',
                url,
                reasons: ['HTTP_403'],
            },
            {
                provider: 'ARCHIVE_TODAY',
                outcome: 'FULL_TEXT',
                url: 'https://archive.ph/Ab12C',
                reasons: [],
            },
        ],
    };
    const db = database(article(), {
        candidate: candidate(completeText, { retrieval }),
    });
    await apply(db);
    const stored = db.snapshot();
    assert.deepEqual(
        record(stored.article.contentProvenance).retrieval,
        retrieval,
    );
    assert.equal(stored.article.url, url);
    assert.deepEqual(stored.article.publishedAt, initialTime);
    assert.equal(record(stored.versions[0].before).content, fragment);
    assert.deepEqual(
        record(record(stored.versions[0].after).contentProvenance).retrieval,
        retrieval,
    );
});
const persist = (
    db: ReturnType<typeof database>,
    original: ArticleFixture,
    next = candidate(),
    metadataOnly = false,
) =>
    db.prisma.$transaction((tx) =>
        persistEnrichmentCandidate(tx, {
            article: original,
            candidate: next,
            metadataOnly,
            actorUserId: 'editor',
            jobItemId: 'item-1',
            now: laterTime,
        }),
    );

const assertNoVectorSnapshot = (version: ArticleContentVersion) => {
    for (const value of [version.before, version.after]) {
        for (const field of ['embedding', 'embeddingModel', 'embeddingBasis'])
            assert.equal(field in record(value), false);
    }
};

test('proposes replacements for manual or unknown text and trusts machine provenance only while its hash matches', () => {
    const next = candidate();
    assert.equal(next.assessment.fullText, true);
    for (const contentProvenance of [
        null,
        provenance('MANUAL'),
        provenance('INGESTION', 'outdated machine text'),
    ]) {
        const original = article({ contentProvenance });
        const before = structuredClone(original);
        assert.equal(candidateDecision(original, next).type, 'PROPOSE');
        assert.deepEqual(original, before);
    }
    for (const origin of ['INGESTION', 'ENRICHMENT']) {
        assert.equal(
            candidateDecision(
                article({ contentProvenance: provenance(origin) }),
                next,
            ).type,
            'APPLY',
        );
    }
    assert.equal(
        candidateDecision(
            article({
                content: null,
                cleanedAccessibleText:
                    'Unique manually maintained accessible article text.',
            }),
            next,
        ).type,
        'PROPOSE',
    );
});

test('leaves lower-quality partial, foreign and identical candidates unchanged and rejects hash-mismatched candidate text', () => {
    const original = article({
        content: completeText,
        contentAssessment: json(assessArticleText({ text: completeText })),
    });
    const partial = candidate(fragment);
    assert.equal(partial.assessment.fullText, false);
    assert.equal(candidateDecision(original, partial).type, 'UNCHANGED');
    const foreign = candidate(completeText, {
        assessment: assessArticleText({
            text: completeText,
            title,
            url,
            evidence: {
                method: 'JSON_LD',
                sourceUrl: 'https://another.example.com/story',
                sourceTitle: 'Unrelated sports report',
                articleBody: true,
                documentComplete: true,
            },
        }),
    });
    assert.equal(candidateDecision(article(), foreign).type, 'UNCHANGED');
    assert.equal(candidateDecision(article(), partial).type, 'UNCHANGED');
    assert.throws(
        () =>
            candidateDecision(article(), {
                ...candidate(),
                content: 'Changed after assessment',
            }),
        /candidate is invalid/,
    );
});

test('verifying identical text preserves bytes, workflow status, vectors and manual or unknown ownership', async () => {
    for (const contentProvenance of [
        null,
        provenance('MANUAL', completeText),
    ]) {
        const original = article({
            content: completeText,
            status: ArticleStatus.EMBEDDED,
            contentProvenance,
        });
        const next = candidate(completeText);
        const decision = candidateDecision(original, next);
        assert.equal(decision.type, 'APPLY');
        assert.ok('metadataOnly' in decision && decision.metadataOnly);
        const db = database(original);
        await persist(db, original, next, true);
        const saved = db.snapshot();
        for (const field of [
            'title',
            'content',
            'summary',
            'cleanedAccessibleText',
            'imageUrl',
            'status',
            'embedding',
            'embeddingModel',
            'embeddingBasis',
        ] as const) {
            assert.deepEqual(saved.article[field], original[field], field);
        }
        assert.equal(
            record(saved.article.contentProvenance).origin,
            contentProvenance ? 'MANUAL' : 'UNKNOWN',
        );
        if (contentProvenance)
            assert.equal(
                record(saved.article.contentProvenance).editorNote,
                contentProvenance.editorNote,
            );
        assert.equal(
            isCurrentFullTextAssessment(
                completeText,
                saved.article.contentAssessment,
            ),
            true,
        );
        assert.equal(saved.versions[0].reason, 'ENRICHMENT_VERIFICATION');
        assertNoVectorSnapshot(saved.versions[0]);
    }
});

test('automatic application replaces known machine fragments or empty content, resets review and invalidates vectors', async () => {
    for (const original of [
        article({
            content: null,
            cleanedAccessibleText: null,
            status: ArticleStatus.APPROVED,
        }),
        article({
            contentProvenance: provenance('INGESTION'),
            status: ArticleStatus.EMBEDDED,
        }),
    ]) {
        const next = candidate();
        assert.equal(candidateDecision(original, next).type, 'APPLY');
        const db = database(original);
        await persist(db, original, next);
        const saved = db.snapshot();
        assert.equal(saved.article.content, completeText);
        assert.equal(saved.article.summary, original.summary);
        assert.equal(saved.article.status, ArticleStatus.REVIEWED);
        assert.equal(
            saved.article.contentAvailability,
            ContentAvailability.FULL_TEXT,
        );
        assert.equal(saved.article.embedding, null);
        assert.equal(saved.article.embeddingModel, null);
        assert.equal(saved.article.embeddingBasis, null);
        assert.equal(
            record(saved.article.contentProvenance).origin,
            'ENRICHMENT',
        );
        assert.equal(saved.versions.length, 1);
        assert.equal(saved.versions[0].actorUserId, 'editor');
        assert.equal(saved.versions[0].jobItemId, 'item-1');
        assert.deepEqual(
            saved.versions[0].before,
            json(snapshotContent(original)),
        );
        assertNoVectorSnapshot(saved.versions[0]);
    }
});

test('explicit proposal application atomically claims it, changes the article, records history and completes the item once', async () => {
    const original = article({ contentProvenance: provenance('MANUAL') });
    const db = database(original);
    await apply(db);
    const saved = db.snapshot();
    assert.equal(saved.item.proposalStatus, 'APPLIED');
    assert.equal(saved.item.status, 'FULL_TEXT');
    assert.equal(saved.article.content, completeText);
    assert.equal(saved.versions.length, 1);
    assert.equal(saved.versions[0].actorUserId, 'reviewing-editor');
    assert.equal(saved.versions[0].jobItemId, 'item-1');
    await assert.rejects(
        apply(db, saved.article.updatedAt),
        /already reviewed/,
    );
    await assert.rejects(dismiss(db), /already reviewed/);
    assert.deepEqual(db.snapshot(), saved);
});

test('dismissal keeps article text and history untouched and prevents later application or dismissal', async () => {
    const original = article({ contentProvenance: provenance('MANUAL') });
    const db = database(original);
    await dismiss(db);
    const saved = db.snapshot();
    assert.equal(saved.item.proposalStatus, 'DISMISSED');
    assert.deepEqual(saved.article, original);
    assert.deepEqual(saved.versions, []);
    await assert.rejects(dismiss(db), /already reviewed/);
    await assert.rejects(apply(db), /already reviewed/);
    assert.deepEqual(db.snapshot(), saved);
});

test('overlapping apply and dismiss calls produce one decision and one article version', async () => {
    const db = database();
    const outcomes = await Promise.allSettled([apply(db), dismiss(db)]);
    assert.equal(
        outcomes.filter(({ status }) => status === 'fulfilled').length,
        1,
    );
    assert.equal(
        outcomes.filter(({ status }) => status === 'rejected').length,
        1,
    );
    assert.equal(db.snapshot().item.proposalStatus, 'APPLIED');
    assert.equal(db.snapshot().versions.length, 1);
    assert.equal(db.calls.locks, 2);
});

test('version failures, lost CAS and concurrent manual saves roll back proposal claims and article writes', async () => {
    for (const options of [
        { failVersion: true },
        { forceConflict: true },
        {
            beforeArticleUpdate: (current: ArticleFixture) => {
                current.title = 'A concurrent manual headline';
                current.updatedAt = new Date(initialTime.getTime() + 1);
            },
        },
    ]) {
        const original = article();
        const db = database(original, options);
        await assert.rejects(apply(db), /version persistence|changed/i);
        const expected = structuredClone(original);
        if ('beforeArticleUpdate' in options)
            options.beforeArticleUpdate!(expected);
        const saved = db.snapshot();
        assert.deepEqual(saved.article, expected);
        assert.equal(saved.item.proposalStatus, 'PENDING');
        assert.equal(saved.item.status, 'PROPOSED');
        assert.deepEqual(saved.versions, []);
    }
    const stale = database();
    const before = stale.snapshot();
    await assert.rejects(
        apply(stale, new Date(initialTime.getTime() - 1)),
        /changed/,
    );
    assert.deepEqual(stale.snapshot(), before);
    assert.equal(stale.calls.articleUpdates, 0);
});

test('restore uses the historical before-text, creates a new manual version and clears embeddings using the current expected version', async () => {
    const historical = article({
        title: 'Original editorial headline',
        content: completeText,
        contentAssessment: json(makeManualContentAssessment(completeText)),
        contentProvenance: provenance('MANUAL', completeText),
    });
    const current = article({
        title: 'Current enriched headline',
        content: `${completeText}\n\nA subsequent correction was published.`,
        status: ArticleStatus.EMBEDDED,
        updatedAt: laterTime,
    });
    const originalVersion = makeVersion(historical, current);
    const db = database(current, { versions: [originalVersion] });
    const input = {
        prisma: db.prisma,
        versionId: originalVersion.id,
        expectedUpdatedAt: laterTime,
        actorUserId: 'restoring-editor',
        now: () => laterTime,
    };
    await restoreArticleContentVersion(input);
    const saved = db.snapshot();
    assert.equal(saved.article.title, historical.title);
    assert.equal(saved.article.content, historical.content);
    assert.equal(saved.article.status, ArticleStatus.REVIEWED);
    assert.equal(
        saved.article.contentAvailability,
        ContentAvailability.FULL_TEXT,
    );
    assert.equal(saved.article.embedding, null);
    assert.equal(saved.article.embeddingModel, null);
    assert.equal(saved.article.embeddingBasis, null);
    assert.equal(record(saved.article.contentProvenance).origin, 'MANUAL');
    assert.equal(
        record(saved.article.contentProvenance).restoredFromVersionId,
        originalVersion.id,
    );
    assert.equal(saved.versions.length, 2);
    assert.deepEqual(saved.versions[0], originalVersion);
    assert.equal(saved.versions[1].reason, 'RESTORE');
    assert.equal(saved.versions[1].restoredFromVersionId, originalVersion.id);
    assert.equal(saved.versions[1].actorUserId, 'restoring-editor');
    assert.equal(record(saved.versions[1].before).content, current.content);
    assert.equal(record(saved.versions[1].after).content, historical.content);
    assertNoVectorSnapshot(saved.versions[1]);
    await assert.rejects(restoreArticleContentVersion(input), /changed/);
    assert.deepEqual(db.snapshot(), saved);
});

test('restore protects rejected and clustered articles and rolls back on history or CAS failure', async () => {
    const historical = article({
        content: completeText,
        contentProvenance: provenance('MANUAL', completeText),
    });
    for (const [overrides, options] of [
        [{ status: ArticleStatus.REJECTED }, {}],
        [{ status: ArticleStatus.CLUSTERED }, {}],
        [{ _count: { clusterLinks: 1 } }, {}],
        [{}, { failVersion: true }],
        [{}, { forceConflict: true }],
    ] as const) {
        const current = article(overrides);
        const originalVersion = makeVersion(historical, current);
        const db = database(current, {
            ...options,
            versions: [originalVersion],
        });
        const before = db.snapshot();
        await assert.rejects(
            restoreArticleContentVersion({
                prisma: db.prisma,
                versionId: originalVersion.id,
                expectedUpdatedAt: initialTime,
                actorUserId: 'editor',
                now: () => laterTime,
            }),
            /cannot be restored|version persistence|changed/i,
        );
        assert.deepEqual(db.snapshot(), before);
    }
});
