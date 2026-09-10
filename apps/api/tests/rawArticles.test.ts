import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isCurrentFullTextAssessment,
    makeManualContentAssessment,
} from '../src/core/ingestionNews/enrich/articleContentQuality';
import {
    ArticleStatus,
    CleaningMethod,
    ContentAvailability,
    EmbeddingBasis,
    Prisma,
    type PrismaClient,
} from '@prisma/client';

import {
    buildRawArticleFilterSql,
    buildRawArticlePageSql,
    getNextReviewStatus,
    getRawArticleActionEligibility,
    getRawArticleApprovalErrors,
    listRawArticles,
    parseRawArticleFilters,
    parseRawArticlePagination,
    parseRawArticlesListQuery,
    parseRawArticlesBatch,
    parseRawArticlesPreview,
    previewRawArticles,
    runRawArticlesBatch,
} from '../src/core/rawArticles';
import {
    buildRawArticleListSummarySql,
    rawArticleFullTextVerifiedSql,
} from '../src/core/rawArticles/listSummary';

type Action = 'RECHECK' | 'APPROVE' | 'REJECT';

interface ArticleFixture {
    id: string;
    sourceId: string;
    url: string;
    title: string;
    summary: string | null;
    content: string | null;
    contentAssessment?: unknown;
    contentProvenance?: unknown;
    cleanedAccessibleText: string | null;
    imageUrl: string | null;
    publishedAt: Date | null;
    language: string | null;
    country: string | null;
    status: ArticleStatus;
    contentAvailability: ContentAvailability | null;
    cleaningMethod: CleaningMethod | null;
    embedding: number[] | null;
    embeddingBasis: EmbeddingBasis | null;
    embeddingModel: string | null;
    createdAt: Date;
    updatedAt: Date;
    source: { id: string; name: string; baseUrl: string };
    raw: { id: string; fetchedAt: Date; parserVersion: string } | null;
    _count: {
        clusterLinks: number;
        articleClusterCandidates: number;
        clusterCandidateLinks: number;
    };
}

const makeArticle = (
    id = 'article-1',
    overrides: Partial<ArticleFixture> = {},
): ArticleFixture => ({
    id,
    sourceId: 'source-1',
    url: `https://example.com/${id}`,
    title: 'A manually edited headline',
    summary: 'A manually edited summary with sufficient context for review.',
    content: 'Manually edited full article text. '.repeat(50),
    contentAssessment: makeManualContentAssessment(
        'Manually edited full article text. '.repeat(50),
    ),
    cleanedAccessibleText: 'Manually cleaned accessible text. '.repeat(15),
    imageUrl: null,
    publishedAt: new Date('2026-09-01T09:00:00Z'),
    language: 'en',
    country: 'BE',
    status: ArticleStatus.REVIEWED,
    contentAvailability: ContentAvailability.FULL_TEXT,
    cleaningMethod: CleaningMethod.RULE_BASED,
    embedding: null,
    embeddingBasis: null,
    embeddingModel: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    source: {
        id: 'source-1',
        name: 'Example Source',
        baseUrl: 'https://example.com',
    },
    raw: {
        id: `raw-${id}`,
        fetchedAt: new Date('2026-09-01T10:00:00Z'),
        parserVersion: 'fixture-v1',
    },
    _count: {
        clusterLinks: 0,
        articleClusterCandidates: 0,
        clusterCandidateLinks: 0,
    },
    ...overrides,
});

const record = (value: unknown): Record<string, unknown> => {
    assert.ok(value !== null && typeof value === 'object');
    return value as Record<string, unknown>;
};

const snapshot = (article: ArticleFixture) => ({
    id: article.id,
    updatedAt: article.updatedAt.toISOString(),
});

const outsideTransaction = async () => {
    assert.fail('Raw article persistence must use the transaction client');
};

// Return predetermined SQL matches: this double checks scope hydration and
// transaction use, and deliberately does not pretend to execute PostgreSQL.
const makeReadDouble = (
    articles: ArticleFixture[],
    matchingIds = articles.map(({ id }) => id),
) => {
    const calls = {
        sql: [] as Prisma.Sql[],
        findMany: [] as Prisma.ArticleFindManyArgs[],
        transactions: 0,
    };
    const prisma = {
        $queryRaw: outsideTransaction,
        article: {
            findMany: outsideTransaction,
            count: outsideTransaction,
        },
        source: { findMany: outsideTransaction },
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: { isolationLevel?: string },
        ): Promise<T> => {
            calls.transactions += 1;
            assert.equal(options?.isolationLevel, 'RepeatableRead');
            const tx = {
                $queryRaw: async (query: Prisma.Sql) => {
                    calls.sql.push(query);
                    if (/WITH matched AS MATERIALIZED/.test(query.sql)) {
                        const selected = new Set(matchingIds);
                        const matched = articles.filter(({ id }) =>
                            selected.has(id),
                        );
                        const isFull = (article: ArticleFixture) =>
                            isCurrentFullTextAssessment(
                                article.content ?? '',
                                article.contentAssessment,
                            );
                        return [
                            {
                                total: BigInt(matched.length),
                                recheck: BigInt(
                                    matched.filter(
                                        (article) =>
                                            getRawArticleActionEligibility(
                                                article,
                                                'RECHECK',
                                            ).eligible,
                                    ).length,
                                ),
                                reject: BigInt(
                                    matched.filter(
                                        (article) =>
                                            getRawArticleActionEligibility(
                                                article,
                                                'REJECT',
                                            ).eligible,
                                    ).length,
                                ),
                                enrich: BigInt(
                                    matched.filter(
                                        (article) =>
                                            article.status !==
                                                ArticleStatus.REJECTED &&
                                            article.status !==
                                                ArticleStatus.CLUSTERED &&
                                            article._count.clusterLinks === 0 &&
                                            !isFull(article),
                                    ).length,
                                ),
                                approvalUrls: matched
                                    .filter(
                                        (article) =>
                                            article.status ===
                                                ArticleStatus.REVIEWED &&
                                            article._count.clusterLinks === 0 &&
                                            article.title.trim() &&
                                            article.summary?.trim() &&
                                            article.sourceId.trim() &&
                                            isFull(article),
                                    )
                                    .map(({ url }) => url),
                            },
                        ];
                    }
                    const paged = /LIMIT \? OFFSET \?/.test(query.sql);
                    const limit = paged
                        ? Number(query.values[query.values.length - 2])
                        : matchingIds.length;
                    const offset = paged
                        ? Number(query.values[query.values.length - 1])
                        : 0;
                    return matchingIds
                        .slice(offset, offset + limit)
                        .map((id) => ({ id }));
                },
                article: {
                    count: async () => articles.length,
                    findMany: async (args: Prisma.ArticleFindManyArgs) => {
                        calls.findMany.push(args);
                        assert.equal(args.skip, undefined);
                        assert.equal(args.take, undefined);
                        const selectedIds = record(record(args.where).id).in;
                        assert.ok(Array.isArray(selectedIds));
                        assert.ok(selectedIds.length > 0);
                        const allowedIds = new Set(matchingIds);
                        assert.ok(
                            selectedIds.every((id) => allowedIds.has(id)),
                        );
                        assert.ok(args.select);
                        assert.equal(args.select.updatedAt, true);
                        assert.deepEqual(args.orderBy, [
                            { createdAt: 'desc' },
                            { id: 'asc' },
                        ]);
                        const byId = new Map(
                            articles.map((article) => [article.id, article]),
                        );
                        return structuredClone(
                            selectedIds.map((id) => byId.get(id)),
                        );
                    },
                },
                source: {
                    findMany: async (args: Prisma.SourceFindManyArgs) => {
                        assert.deepEqual(args.where, {
                            articles: { some: {} },
                        });
                        assert.deepEqual(args.select, { name: true });
                        assert.deepEqual(args.distinct, ['name']);
                        return [{ name: 'Example Source' }];
                    },
                },
            } as unknown as Prisma.TransactionClient;
            return run(tx);
        },
    } as unknown as PrismaClient;
    return { prisma, calls };
};

const makeBatchDouble = (
    articles: ArticleFixture[],
    options: {
        failId?: string;
        beforeUpdate?: (article: ArticleFixture) => void;
        forceConflict?: boolean;
    } = {},
) => {
    const committed = new Map(
        articles.map((article) => [article.id, structuredClone(article)]),
    );
    const calls = {
        transactions: 0,
        updates: [] as Prisma.ArticleUpdateManyArgs[],
    };
    const prisma = {
        article: {
            findUnique: outsideTransaction,
            updateMany: outsideTransaction,
        },
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
            calls.transactions += 1;
            let staged: ArticleFixture | undefined;
            const tx = {
                article: {
                    findUnique: async (args: Prisma.ArticleFindUniqueArgs) => {
                        const article = committed.get(String(args.where.id));
                        return article ? structuredClone(article) : null;
                    },
                    updateMany: async (args: Prisma.ArticleUpdateManyArgs) => {
                        calls.updates.push(args);
                        const where = record(args.where);
                        assert.equal(typeof where.id, 'string');
                        assert.ok(where.updatedAt instanceof Date);
                        assert.equal(typeof where.status, 'string');
                        assert.deepEqual(where.clusterLinks, { none: {} });
                        const article = committed.get(String(where.id));
                        assert.ok(article);
                        options.beforeUpdate?.(article);
                        if (article.id === options.failId) {
                            throw new Error('Injected row persistence failure');
                        }
                        if (
                            options.forceConflict ||
                            article.updatedAt.getTime() !==
                                where.updatedAt.getTime() ||
                            article.status !== where.status ||
                            article._count.clusterLinks > 0
                        ) {
                            return { count: 0 };
                        }
                        const data = record(args.data);
                        const allowed = new Set([
                            'status',
                            'contentAvailability',
                            'embedding',
                            'embeddingBasis',
                            'embeddingModel',
                            'updatedAt',
                        ]);
                        for (const field of Object.keys(data)) {
                            assert.ok(
                                allowed.has(field),
                                `Bulk actions must preserve article field ${field}`,
                            );
                        }
                        staged = structuredClone(article);
                        for (const [field, value] of Object.entries(data)) {
                            record(staged)[field] =
                                value === Prisma.DbNull ? null : value;
                        }
                        assert.ok(staged.updatedAt instanceof Date);
                        assert.ok(
                            staged.updatedAt.getTime() >
                                article.updatedAt.getTime(),
                            'A successful action must invalidate its preview snapshot',
                        );
                        return { count: 1 };
                    },
                },
            } as unknown as Prisma.TransactionClient;
            const result = await run(tx);
            if (staged) committed.set(staged.id, staged);
            return result;
        },
    } as unknown as PrismaClient;
    return {
        prisma,
        calls,
        get: (id: string) => structuredClone(committed.get(id)),
    };
};

const execute = (
    harness: ReturnType<typeof makeBatchDouble>,
    action: Action,
    articles: ArticleFixture[],
) =>
    runRawArticlesBatch({
        prisma: harness.prisma,
        input: parseRawArticlesBatch({
            action,
            items: articles.map(snapshot),
        }),
    });

test('parses filter dates and explicit action scopes without broadening invalid input', () => {
    const filters = parseRawArticleFilters({
        search: '  manual headline  ',
        status: 'REVIEWED',
        contentAvailability: 'PARTIAL_TEXT',
        sourceName: 'Example Source',
        fetchedFrom: '2026-09-01T00:00:00+02:00',
        fetchedTo: '2026-09-02T00:00:00+02:00',
        onlyProblematic: true,
    });
    assert.equal(filters.search, 'manual headline');
    assert.equal(filters.status, ArticleStatus.REVIEWED);
    assert.equal(filters.contentAvailability, ContentAvailability.PARTIAL_TEXT);
    assert.equal(
        filters.fetchedFrom?.toISOString(),
        '2026-08-31T22:00:00.000Z',
    );
    assert.equal(filters.fetchedTo?.toISOString(), '2026-09-01T22:00:00.000Z');
    assert.equal(filters.onlyProblematic, true);
    assert.equal(parseRawArticleFilters({}).onlyProblematic, false);
    assert.deepEqual(
        parseRawArticlesPreview({
            action: 'RECHECK',
            scope: { type: 'SELECTED', ids: ['article-2', 'article-1'] },
        }),
        {
            action: 'RECHECK',
            scope: { type: 'SELECTED', ids: ['article-2', 'article-1'] },
        },
    );
    assert.deepEqual(
        parseRawArticlesPreview({
            action: 'APPROVE',
            scope: { type: 'FILTERED', filters: { status: 'REVIEWED' } },
        }).scope,
        {
            type: 'FILTERED',
            filters: parseRawArticleFilters({ status: 'REVIEWED' }),
        },
    );
});

test('rejects malformed enums, scalars and invalid or reversed filter dates', () => {
    for (const input of [
        null,
        [],
        { status: 'UNKNOWN' },
        { contentAvailability: 'UNKNOWN' },
        { search: ['headline'] },
        { sourceName: { name: 'source' } },
        { onlyProblematic: 'sometimes' },
        { fetchedFrom: '2026-02-30T00:00:00Z' },
        { fetchedTo: '2026-09-01T00:00:00' },
        { fetchedFrom: '2026-09-01T00:00:00+25:00' },
        {
            fetchedFrom: '2026-09-02T00:00:00Z',
            fetchedTo: '2026-09-01T00:00:00Z',
        },
    ]) {
        assert.throws(
            () => parseRawArticleFilters(input),
            `Reject filter ${JSON.stringify(input)}`,
        );
    }
});

test('list pagination defaults to 50 and rejects malformed or unsafe values without changing bulk filters', () => {
    assert.deepEqual(parseRawArticlePagination(), { page: 1, limit: 50 });
    const parsed = parseRawArticlesListQuery({
        page: '3',
        limit: '25',
        search: '  headline  ',
        onlyProblematic: 'true',
    });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.limit, 25);
    assert.deepEqual(
        parsed.filters,
        parseRawArticleFilters({
            search: 'headline',
            onlyProblematic: true,
        }),
    );
    assert.deepEqual(
        parseRawArticlePagination({ page: Number.MAX_SAFE_INTEGER, limit: 1 }),
        {
            page: Number.MAX_SAFE_INTEGER,
            limit: 1,
        },
    );
    for (const limit of [25, 50, 100])
        assert.equal(parseRawArticlePagination({ limit }).limit, limit);
    for (const value of [
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        Number.MAX_SAFE_INTEGER + 1,
        '',
        '0',
        '01',
        '1.5',
        '1e2',
        '+1',
        ' 1 ',
        '9007199254740992',
        null,
        true,
        [],
        ['2'],
        {},
    ]) {
        assert.throws(() => parseRawArticlesListQuery({ page: value }));
        assert.throws(() => parseRawArticlesListQuery({ limit: value }));
    }
    assert.throws(() => parseRawArticlesListQuery({ limit: 101 }));
    assert.throws(() => parseRawArticlesListQuery({ sort: 'title' }));
    assert.throws(() => parseRawArticleFilters({ page: 1 }));
    assert.throws(() =>
        parseRawArticlesPreview({
            action: 'RECHECK',
            scope: { type: 'FILTERED', filters: { limit: 25 } },
        }),
    );
});

test('requires a bounded unique snapshot and a valid preview action and scope', () => {
    const item = snapshot(makeArticle());
    for (const input of [
        { action: 'ENRICH', items: [item] },
        { action: 'RECHECK', items: [] },
        { action: 'REJECT', items: [item, item] },
        { action: 'APPROVE', items: [{ id: ' ', updatedAt: item.updatedAt }] },
        { action: 'RECHECK', items: [{ id: item.id }] },
        {
            action: 'RECHECK',
            items: [{ ...item, updatedAt: '2026-02-30T00:00:00Z' }],
        },
        {
            action: 'RECHECK',
            items: Array.from({ length: 101 }, (_, index) => ({
                ...item,
                id: `article-${index}`,
            })),
        },
    ]) {
        assert.throws(() => parseRawArticlesBatch(input));
    }
    const full = parseRawArticlesBatch({
        action: 'RECHECK',
        items: Array.from({ length: 100 }, (_, index) => ({
            ...item,
            id: `article-${index}`,
        })),
    });
    assert.equal(full.items.length, 100);
    assert.ok(full.items[0].updatedAt instanceof Date);
    for (const input of [
        { action: 'UNKNOWN', scope: { type: 'FILTERED', filters: {} } },
        { action: 'RECHECK' },
        { action: 'RECHECK', scope: { type: 'ALL' } },
        { action: 'RECHECK', scope: { type: 'SELECTED', ids: [] } },
        { action: 'RECHECK', scope: { type: 'SELECTED', ids: [' '] } },
    ]) {
        assert.throws(() => parseRawArticlesPreview(input));
    }
});

test('approval uses present text quality rather than a stale FULL_TEXT flag', () => {
    const partial = makeArticle('partial', {
        content: 'A short excerpt',
        contentAvailability: ContentAvailability.FULL_TEXT,
    });
    assert.ok(getRawArticleApprovalErrors(partial).length > 0);
    assert.equal(
        getRawArticleActionEligibility(partial, 'APPROVE').eligible,
        false,
    );
    const full = makeArticle('full', {
        contentAvailability: ContentAvailability.SUMMARY_ONLY,
    });
    assert.deepEqual(getRawArticleApprovalErrors(full), []);
    assert.equal(
        getRawArticleActionEligibility(full, 'APPROVE').eligible,
        true,
    );
    for (const overrides of [
        { title: ' \n\t' },
        { summary: ' \n\t' },
        { sourceId: ' ' },
        { url: 'javascript:alert(1)' },
        { url: 'not a URL' },
    ]) {
        assert.ok(
            getRawArticleApprovalErrors(makeArticle('invalid', overrides))
                .length > 0,
        );
    }
});

test('all bulk policies protect linked articles and preserve late workflow decisions', () => {
    const allowed: Record<Action, ArticleStatus[]> = {
        RECHECK: [
            ArticleStatus.NEW,
            ArticleStatus.NEEDS_REVIEW,
            ArticleStatus.REVIEWED,
        ],
        APPROVE: [ArticleStatus.REVIEWED],
        REJECT: [
            ArticleStatus.NEW,
            ArticleStatus.NEEDS_REVIEW,
            ArticleStatus.REVIEWED,
            ArticleStatus.APPROVED,
            ArticleStatus.EMBEDDED,
        ],
    };
    for (const action of Object.keys(allowed) as Action[]) {
        for (const status of Object.values(ArticleStatus)) {
            assert.equal(
                getRawArticleActionEligibility(
                    makeArticle('status', { status }),
                    action,
                ).eligible,
                allowed[action].includes(status),
                `${action} on ${status}`,
            );
        }
        const linked = makeArticle('linked', {
            _count: {
                clusterLinks: 1,
                articleClusterCandidates: 0,
                clusterCandidateLinks: 0,
            },
        });
        assert.equal(
            getRawArticleActionEligibility(linked, action).eligible,
            false,
        );
    }
    assert.equal(getNextReviewStatus(makeArticle()), ArticleStatus.REVIEWED);
    assert.equal(
        getNextReviewStatus(makeArticle('blank', { summary: ' \n\t' })),
        ArticleStatus.NEEDS_REVIEW,
    );
});

test('SQL keeps search, source and selected IDs parameterized and escapes literal wildcards', () => {
    const search = "50%_\\' OR 1=1 --";
    const sourceName = "Source'; DROP TABLE Article; --";
    const id = "id' OR TRUE --";
    const query = buildRawArticleFilterSql(
        parseRawArticleFilters({ search, sourceName }),
        [id],
    );
    assert.ok(!query.sql.includes(search));
    assert.ok(!query.sql.includes(sourceName));
    assert.ok(!query.sql.includes(id));
    assert.ok(query.values.includes(sourceName));
    assert.ok(query.values.includes(JSON.stringify([id])));
    assert.ok(query.values.includes("%50\\%\\_\\\\' OR 1=1 --%"));
    assert.match(query.sql, /JOIN\s+"Source"/i);

    const largeSelection = Array.from(
        { length: 70000 },
        (_, index) => `id-${index}`,
    );
    const largeQuery = buildRawArticleFilterSql(
        parseRawArticleFilters({}),
        largeSelection,
    );
    assert.equal(
        largeQuery.values.length,
        1,
        'Selected IDs must not exhaust PostgreSQL bind parameters',
    );
    assert.deepEqual(JSON.parse(String(largeQuery.values[0])), largeSelection);
    assert.match(largeQuery.sql, /jsonb_array_elements_text/);
});

test('SQL applies inclusive and exclusive fetched bounds and whitespace-aware problematic checks', () => {
    const filters = parseRawArticleFilters({
        fetchedFrom: '2026-09-01T00:00:00Z',
        fetchedTo: '2026-09-02T00:00:00Z',
        onlyProblematic: true,
    });
    const query = buildRawArticleFilterSql(filters);
    assert.match(query.sql, /"createdAt"\s*>=\s*\?/i);
    assert.match(query.sql, /"createdAt"\s*<\s*\?/i);
    assert.ok(
        query.values.some(
            (value) =>
                value instanceof Date &&
                value.getTime() === filters.fetchedFrom?.getTime(),
        ),
    );
    assert.ok(
        query.values.some(
            (value) =>
                value instanceof Date &&
                value.getTime() === filters.fetchedTo?.getTime(),
        ),
    );
    assert.match(
        query.sql,
        /"contentAvailability"\s+IS\s+DISTINCT\s+FROM\s+'FULL_TEXT'/i,
    );
    assert.match(query.sql, /btrim\(COALESCE\(/i);
    assert.ok(
        query.values.some(
            (value) =>
                typeof value === 'string' &&
                value.includes('\n') &&
                value.includes('\t') &&
                value.includes('\u00a0'),
        ),
        'Problematic checks must trim tabs, newlines and non-breaking spaces',
    );
    assert.match(query.sql, /"summary"/);
    assert.match(query.sql, /"url"/);
});

test('page queries limit ordered IDs while aggregate queries retain the identical unbounded filter scope', () => {
    const filters = parseRawArticleFilters({
        search: "Needle%_';--",
        sourceName: 'A selected publisher',
        status: 'REVIEWED',
        contentAvailability: 'PARTIAL_TEXT',
        fetchedFrom: '2026-09-01T00:00:00Z',
        fetchedTo: '2026-09-02T00:00:00Z',
        onlyProblematic: true,
    });
    const all = buildRawArticleFilterSql(filters);
    const page = buildRawArticlePageSql(filters, 25, 75);
    const summary = buildRawArticleListSummarySql(filters);
    assert.match(page.sql, /SELECT a\."id"/);
    assert.match(
        page.sql,
        /ORDER BY a\."createdAt" DESC, a\."id" ASC\s+LIMIT \? OFFSET \?/,
    );
    assert.deepEqual(page.values, [...all.values, 25, 75]);
    assert.doesNotMatch(page.sql, /a\."content"|a\."embedding"/);
    assert.doesNotMatch(all.sql, /LIMIT|OFFSET/);
    assert.doesNotMatch(summary.sql, /ORDER BY|LIMIT|OFFSET/);
    assert.deepEqual(summary.values.slice(-all.values.length), all.values);
    assert.ok(summary.sql.includes('count(*) FILTER'));
    assert.match(
        summary.sql,
        /NOT EXISTS[\s\S]*"ClusterArticle"[\s\S]*"articleId"/,
    );
    assert.match(summary.sql, /array_agg\("url"\)/);
    assert.doesNotMatch(summary.sql, /array_agg\([^)]*"content"/);
});

test('SQL completeness uses typed evidence, exact empty reasons and an untrimmed UTF-8 hash', () => {
    const sql = rawArticleFullTextVerifiedSql().sql;
    assert.match(sql, /COALESCE\(CASE WHEN/);
    assert.match(sql, /-> 'version' = '1'::jsonb/);
    assert.match(sql, /-> 'fullText' = 'true'::jsonb/);
    assert.match(sql, /-> 'reasons' = '\[\]'::jsonb/);
    for (const flag of ['documentComplete', 'identityMatched'])
        assert.ok(sql.includes(`-> '${flag}' = 'true'::jsonb`));
    for (const flag of ['paywall', 'truncated'])
        assert.ok(sql.includes(`-> '${flag}' = 'false'::jsonb`));
    assert.match(sql, /THEN a\."contentAssessment" -> 'textHash' = to_jsonb/);
    assert.match(
        sql,
        /sha256\(convert_to\(COALESCE\(a\."content", ''\), 'UTF8'\)\)/,
    );
    assert.match(sql, /ELSE false END, false/);
    assert.doesNotMatch(sql, /->>|btrim|contentAvailability/);
});

test('list hydrates only SQL matches and reports full-dataset source and action counts', async () => {
    const articles = [
        makeArticle('match'),
        makeArticle('protected', { status: ArticleStatus.CLUSTERED }),
        makeArticle('unmatched'),
    ];
    const harness = makeReadDouble(articles, ['match', 'protected']);
    const result = await listRawArticles({
        prisma: harness.prisma,
        filters: parseRawArticleFilters({ search: 'needle' }),
    });
    assert.deepEqual(
        result.articles.map(({ id }) => id),
        ['match', 'protected'],
    );
    assert.equal(result.total, 2);
    assert.equal(result.totalAll, 3);
    assert.deepEqual(result.sourceNames, ['Example Source']);
    assert.deepEqual(result.eligibility, { RECHECK: 1, APPROVE: 1, REJECT: 1 });
    assert.equal(result.articles[0].bulkEligibility.APPROVE, true);
    assert.equal(result.articles[1].bulkEligibility.REJECT, false);
    assert.deepEqual(result.pagination, {
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    assert.equal(harness.calls.transactions, 1);
});

test('listing hydrates only the requested page while totals and eligibility cover every filtered article', async () => {
    const articles = Array.from({ length: 110 }, (_, index) =>
        makeArticle(`article-${String(index).padStart(3, '0')}`, {
            ...(index >= 75 ? { contentAssessment: null } : {}),
            status:
                index < 90
                    ? ArticleStatus.REVIEWED
                    : index < 100
                      ? ArticleStatus.REJECTED
                      : index < 105
                        ? ArticleStatus.CLUSTERED
                        : ArticleStatus.NEW,
        }),
    );
    const harness = makeReadDouble(
        [...articles, makeArticle('outside-filter')],
        articles.map(({ id }) => id),
    );
    const result = await listRawArticles({
        prisma: harness.prisma,
        filters: parseRawArticleFilters({ sourceName: 'Example Source' }),
        page: 4,
        limit: 25,
    });
    assert.equal(result.total, 110);
    assert.equal(result.totalAll, 111);
    assert.deepEqual(result.eligibility, {
        RECHECK: 95,
        APPROVE: 75,
        REJECT: 95,
    });
    assert.equal(result.enrichmentEligibleCount, 20);
    assert.deepEqual(
        result.articles.map(({ id }) => id),
        articles.slice(75, 100).map(({ id }) => id),
    );
    assert.ok(
        result.articles.every(
            ({ bulkEligibility }) => !bulkEligibility.APPROVE,
        ),
    );
    assert.deepEqual(result.pagination, {
        page: 4,
        limit: 25,
        total: 110,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
    });
    assert.equal(harness.calls.findMany.length, 1);
    assert.equal(
        (record(record(harness.calls.findMany[0].where).id).in as string[])
            .length,
        25,
    );
    assert.equal(harness.calls.sql.length, 2);
    assert.deepEqual(harness.calls.sql[1].values.slice(-2), [25, 75]);
});

test('out-of-range pages clamp before hydration and an empty filter has one empty page', async () => {
    const articles = Array.from({ length: 53 }, (_, index) =>
        makeArticle(`a-${index}`),
    );
    const harness = makeReadDouble(articles);
    const result = await listRawArticles({
        prisma: harness.prisma,
        filters: parseRawArticleFilters({}),
        page: Number.MAX_SAFE_INTEGER,
        limit: 25,
    });
    assert.deepEqual(
        result.articles.map(({ id }) => id),
        articles.slice(50).map(({ id }) => id),
    );
    assert.deepEqual(result.pagination, {
        page: 3,
        limit: 25,
        total: 53,
        totalPages: 3,
        hasNextPage: false,
        hasPreviousPage: true,
    });
    assert.deepEqual(harness.calls.sql[1].values.slice(-2), [25, 50]);
    const empty = makeReadDouble(articles, []);
    const noMatches = await listRawArticles({
        prisma: empty.prisma,
        filters: parseRawArticleFilters({ search: 'absent' }),
        page: 8,
        limit: 100,
    });
    assert.deepEqual(noMatches.articles, []);
    assert.deepEqual(noMatches.pagination, {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
    });
    assert.equal(noMatches.totalAll, 53);
    assert.deepEqual(noMatches.eligibility, {
        RECHECK: 0,
        APPROVE: 0,
        REJECT: 0,
    });
    assert.equal(noMatches.enrichmentEligibleCount, 0);
    assert.equal(empty.calls.findMany.length, 0);
    assert.equal(empty.calls.sql.length, 1);
    await assert.rejects(
        listRawArticles({
            prisma: empty.prisma,
            filters: parseRawArticleFilters({}),
            page: 0,
        }),
        /positive/,
    );
    assert.equal(empty.calls.transactions, 1);
});

test('off-page approval counts use the same URL parser and full-text evidence as individual actions', async () => {
    const articles = [
        ...[
            'https://example.com/story',
            'http:example.com',
            'HTTP://127.1/path',
            'https://пример.рф/новости',
            'http:\\example.com\\story',
            'https://user:pass@example.com/path',
            'https://[::1]/',
            'javascript:alert(1)',
            'ftp://example.com/story',
            '/relative',
            'not a URL',
            'https://',
            'https://example.com:99999/story',
        ].map((url, index) => makeArticle(`url-${index}`, { url })),
        makeArticle('stale-hash', {
            content: 'Text replaced without new evidence.',
        }),
        makeArticle('legacy-full', { contentAssessment: null }),
        makeArticle('blank-summary', { summary: '\u00a0\n\ufeff' }),
        makeArticle('malformed-full', {
            contentAssessment: {
                ...makeManualContentAssessment(makeArticle().content!),
                fullText: 'true',
            },
        }),
        makeArticle('linked', {
            _count: {
                clusterLinks: 1,
                articleClusterCandidates: 0,
                clusterCandidateLinks: 0,
            },
        }),
    ];
    const harness = makeReadDouble(articles);
    const result = await listRawArticles({
        prisma: harness.prisma,
        filters: parseRawArticleFilters({}),
        page: 1,
        limit: 1,
    });
    assert.equal(result.articles.length, 1);
    for (const action of ['RECHECK', 'APPROVE', 'REJECT'] as const)
        assert.equal(
            result.eligibility[action],
            articles.filter(
                (article) =>
                    getRawArticleActionEligibility(article, action).eligible,
            ).length,
        );
    assert.equal(result.enrichmentEligibleCount, 3);
    assert.equal(harness.calls.findMany.length, 1);
});

test('filtered preview snapshots the whole scope beyond the old 9999-row limit', async () => {
    const articles = Array.from({ length: 10001 }, (_, index) =>
        makeArticle(`article-${index}`),
    );
    const harness = makeReadDouble(articles);
    const result = await previewRawArticles({
        prisma: harness.prisma,
        input: parseRawArticlesPreview({
            action: 'APPROVE',
            scope: { type: 'FILTERED', filters: {} },
        }),
    });
    assert.equal(result.total, 10001);
    assert.equal(result.eligible, 10001);
    assert.equal(result.items.length, 10001);
    assert.deepEqual(result.items[result.items.length - 1], {
        id: 'article-10000',
        title: articles[10000].title,
        updatedAt: articles[10000].updatedAt.toISOString(),
        eligible: true,
    });
    const listed = await listRawArticles({
        prisma: harness.prisma,
        filters: parseRawArticleFilters({}),
    });
    assert.equal(listed.total, 10001);
    assert.equal(listed.articles.length, 50);
    assert.equal(listed.eligibility.APPROVE, 10001);
    assert.equal(listed.pagination.totalPages, 201);
});

test('selected preview confines SQL and hydration to the selected snapshot', async () => {
    const articles = [makeArticle('selected'), makeArticle('unselected')];
    const harness = makeReadDouble(articles, ['selected']);
    const result = await previewRawArticles({
        prisma: harness.prisma,
        input: parseRawArticlesPreview({
            action: 'RECHECK',
            scope: { type: 'SELECTED', ids: ['missing', 'selected'] },
        }),
    });
    assert.equal(result.total, 2);
    assert.equal(result.eligible, 1);
    assert.deepEqual(result.items, [
        {
            id: 'missing',
            title: 'missing',
            updatedAt: null,
            eligible: false,
            reason: 'Article no longer exists.',
        },
        {
            id: 'selected',
            title: articles[0].title,
            updatedAt: articles[0].updatedAt.toISOString(),
            eligible: true,
        },
    ]);
    assert.ok(
        harness.calls.sql[0].values.includes(
            JSON.stringify(['missing', 'selected']),
        ),
    );
});

test('approval refreshes availability and invalidates embeddings without changing manual text', async () => {
    const article = makeArticle('manual', {
        contentAvailability: ContentAvailability.SUMMARY_ONLY,
        embedding: [0.2, 0.8],
        embeddingBasis: EmbeddingBasis.SUMMARY_ONLY,
        embeddingModel: 'old-model',
    });
    const partial = makeArticle('partial', {
        content: 'An incomplete article excerpt',
        contentAvailability: ContentAvailability.FULL_TEXT,
    });
    const harness = makeBatchDouble([article, partial]);
    const result = await execute(harness, 'APPROVE', [article, partial]);
    assert.equal(result.results[0].outcome, 'UPDATED');
    assert.equal(result.results[1].outcome, 'SKIPPED');
    assert.deepEqual(harness.get(partial.id), partial);
    const saved = harness.get(article.id);
    assert.ok(saved);
    assert.equal(saved.status, ArticleStatus.APPROVED);
    assert.equal(saved.contentAvailability, ContentAvailability.FULL_TEXT);
    assert.equal(saved.embedding, null);
    assert.equal(saved.embeddingBasis, null);
    assert.equal(saved.embeddingModel, null);
    for (const field of [
        'title',
        'summary',
        'content',
        'cleanedAccessibleText',
        'cleaningMethod',
    ] as const) {
        assert.equal(saved[field], article[field]);
    }
    assert.equal(harness.calls.updates[0].data.embedding, Prisma.DbNull);
});

test('an unchanged recheck writes nothing, while clearing an existing embedding is a change', async () => {
    const unchanged = makeArticle('unchanged');
    const harness = makeBatchDouble([unchanged]);
    const result = await execute(harness, 'RECHECK', [unchanged]);
    assert.equal(result.results[0].outcome, 'UNCHANGED');
    assert.equal(harness.calls.updates.length, 0);
    assert.deepEqual(harness.get(unchanged.id), unchanged);

    const embedded = makeArticle('embedded', {
        embedding: [0.1, 0.9],
        embeddingBasis: EmbeddingBasis.FULL_TEXT,
        embeddingModel: 'old-model',
    });
    const changed = makeBatchDouble([embedded]);
    const cleared = await execute(changed, 'RECHECK', [embedded]);
    assert.equal(cleared.results[0].outcome, 'UPDATED');
    assert.equal(changed.get(embedded.id)?.embedding, null);
});

test('mixed batches isolate row errors and skip missing, stale, linked and protected articles', async () => {
    const articles = [
        makeArticle('updated'),
        makeArticle('error'),
        makeArticle('stale'),
        makeArticle('linked', {
            _count: {
                clusterLinks: 1,
                articleClusterCandidates: 0,
                clusterCandidateLinks: 0,
            },
        }),
        makeArticle('clustered', { status: ArticleStatus.CLUSTERED }),
        makeArticle('already-rejected', { status: ArticleStatus.REJECTED }),
        makeArticle('last'),
    ];
    const requested = [...structuredClone(articles), makeArticle('missing')];
    requested[2].updatedAt = new Date('2026-09-01T11:00:00Z');
    const harness = makeBatchDouble(articles, { failId: 'error' });
    const result = await execute(harness, 'REJECT', requested);
    assert.deepEqual(
        result.results.map(({ id, outcome }) => ({ id, outcome })),
        [
            { id: 'updated', outcome: 'UPDATED' },
            { id: 'error', outcome: 'ERROR' },
            { id: 'stale', outcome: 'SKIPPED' },
            { id: 'linked', outcome: 'SKIPPED' },
            { id: 'clustered', outcome: 'SKIPPED' },
            { id: 'already-rejected', outcome: 'SKIPPED' },
            { id: 'last', outcome: 'UPDATED' },
            { id: 'missing', outcome: 'SKIPPED' },
        ],
    );
    assert.equal(harness.get('last')?.status, ArticleStatus.REJECTED);
    for (const article of articles.slice(1, 6)) {
        assert.deepEqual(harness.get(article.id), article);
    }
    assert.equal(harness.calls.transactions, requested.length);
});

test('a manual save, workflow transition or new link between read and update defeats the snapshot', async () => {
    for (const beforeUpdate of [
        (article: ArticleFixture) => {
            article.content = 'A concurrent manual replacement';
            article.updatedAt = new Date(article.updatedAt.getTime() + 1);
        },
        (article: ArticleFixture) => {
            article.status = ArticleStatus.CLUSTERED;
        },
        (article: ArticleFixture) => {
            article._count.clusterLinks = 1;
        },
    ]) {
        const article = makeArticle();
        const harness = makeBatchDouble([article], { beforeUpdate });
        const result = await execute(harness, 'APPROVE', [article]);
        assert.equal(result.results[0].outcome, 'SKIPPED');
        const expected = structuredClone(article);
        beforeUpdate(expected);
        assert.deepEqual(harness.get(article.id), expected);
    }
});

test('a lost conditional update and a repeated successful snapshot cause no extra mutation', async () => {
    const article = makeArticle();
    const conflict = makeBatchDouble([article], { forceConflict: true });
    const conflicted = await execute(conflict, 'APPROVE', [article]);
    assert.equal(conflicted.results[0].outcome, 'SKIPPED');
    assert.deepEqual(conflict.get(article.id), article);

    const harness = makeBatchDouble([article]);
    await execute(harness, 'APPROVE', [article]);
    const afterFirst = harness.get(article.id);
    const repeated = await execute(harness, 'APPROVE', [article]);
    assert.equal(repeated.results[0].outcome, 'SKIPPED');
    assert.equal(harness.calls.updates.length, 1);
    assert.deepEqual(harness.get(article.id), afterFirst);
});
