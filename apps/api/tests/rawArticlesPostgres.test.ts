import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { after, before } from 'node:test';
import { ArticleStatus, Prisma } from '@prisma/client';
import { parse } from 'dotenv';
import { Pool, type QueryResultRow } from 'pg';
import {
    getArticleTextHash,
    isCurrentFullTextAssessment,
    makeManualContentAssessment,
} from '../src/core/ingestionNews/enrich/articleContentQuality';
import { getEnrichmentEligibility } from '../src/core/enrichmentJobs/types';
import {
    buildRawArticleFilterSql,
    buildRawArticlePageSql,
} from '../src/core/rawArticles/filters';
import {
    getRawArticleListSummary,
    rawArticleFullTextVerifiedSql,
} from '../src/core/rawArticles/listSummary';
import {
    getRawArticleActionEligibility,
    type RawArticleEligibilityInput,
} from '../src/core/rawArticles/policy';
import type { RawArticleFilters } from '../src/core/rawArticles/validation';

// This suite requires PostgreSQL but never reads application tables. Every
// production query runs against parameterized CTE fixtures shadowing its tables.
// Connection-level read-only mode prevents accidental writes independently.
const envPath = resolve(__dirname, '../.env');
const connectionString =
    process.env.DATABASE_URL ??
    (existsSync(envPath)
        ? parse(readFileSync(envPath)).DATABASE_URL
        : undefined);
const testOptions = {
    skip: connectionString ? false : 'DATABASE_URL is not configured',
};
const pool = connectionString
    ? (() => {
          const url = new URL(connectionString);
          // A URL-supplied options value must not override the read-only guard.
          url.searchParams.delete('options');
          return new Pool({
              connectionString: url.toString(),
              options:
                  '-c default_transaction_read_only=on -c statement_timeout=10000',
              connectionTimeoutMillis: 5000,
              max: 1,
          });
      })()
    : undefined;

before(async () => {
    if (!pool) return;
    const { rows } = await pool.query<{
        readOnly: string;
        statementTimeout: string;
    }>(`SELECT current_setting('default_transaction_read_only') AS "readOnly",
        current_setting('statement_timeout') AS "statementTimeout"`);
    assert.equal(rows[0].readOnly, 'on');
    assert.equal(rows[0].statementTimeout, '10s');
});
after(async () => {
    await pool?.end();
});

interface FixtureArticle extends RawArticleEligibilityInput {
    id: string;
    contentAvailability: string | null;
    createdAt: string;
}

const unicodeBody =
    ' \tRésumé: a café opened today. 👩‍🚀\r\n\r\nThe second paragraph preserves its spacing.\n\u00a0';
const sources = [
    { id: 'source-main', name: 'Main Publisher' },
    { id: 'source-other', name: 'Literal 100%_\\ Publisher' },
    { id: ' \uFEFF ', name: 'Blank source ID fixture' },
];
const sourceNames = new Map(sources.map(({ id, name }) => [id, name]));

function article(
    id: string,
    overrides: Partial<FixtureArticle> = {},
): FixtureArticle {
    return {
        id,
        sourceId: 'source-main',
        title: `A complete headline for ${id}`,
        summary: 'A complete summary with enough context for the article.',
        content: unicodeBody,
        cleanedAccessibleText: null,
        contentAssessment: makeManualContentAssessment(unicodeBody),
        contentAvailability: 'FULL_TEXT',
        status: ArticleStatus.REVIEWED,
        url: `https://example.org/${id}`,
        createdAt: '2026-09-10T12:00:00.000Z',
        _count: { clusterLinks: 0 },
        ...overrides,
    };
}

async function fixtureQuery<T extends QueryResultRow>(
    articles: FixtureArticle[],
    query: Prisma.Sql,
): Promise<T[]> {
    assert.ok(pool);
    const links = articles.flatMap((value) =>
        Array.from({ length: value._count.clusterLinks }, () => ({
            articleId: value.id,
        })),
    );
    const bound = Prisma.sql`
        WITH "Article" AS (
            SELECT * FROM jsonb_to_recordset(${JSON.stringify(articles)}::jsonb)
            AS fixture("id" text, "sourceId" text, "title" text,
                "summary" text, "content" text, "cleanedAccessibleText" text,
                "contentAssessment" jsonb, "contentAvailability" text,
                "status" text, "url" text, "createdAt" timestamptz)
        ), "Source" AS (
            SELECT * FROM jsonb_to_recordset(${JSON.stringify(sources)}::jsonb)
            AS fixture("id" text, "name" text)
        ), "ClusterArticle" AS (
            SELECT * FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb)
            AS fixture("articleId" text)
        )
        SELECT * FROM (${query}) AS fixture_result
    `;
    const { rows } = await pool.query<T>({
        text: bound.text,
        values: [...bound.values],
    });
    return rows;
}

function matchesFilter(value: FixtureArticle, filters: RawArticleFilters) {
    if (
        filters.search &&
        ![
            value.title,
            value.summary,
            value.url,
            value.id,
            sourceNames.get(value.sourceId ?? ''),
        ].some((field) =>
            field?.toLowerCase().includes(filters.search!.toLowerCase()),
        )
    )
        return false;
    if (filters.status && value.status !== filters.status) return false;
    if (
        filters.contentAvailability &&
        value.contentAvailability !== filters.contentAvailability
    )
        return false;
    if (
        filters.sourceName &&
        sourceNames.get(value.sourceId ?? '') !== filters.sourceName
    )
        return false;
    const fetchedAt = new Date(value.createdAt).getTime();
    if (filters.fetchedFrom && fetchedAt < filters.fetchedFrom.getTime())
        return false;
    if (filters.fetchedTo && fetchedAt >= filters.fetchedTo.getTime())
        return false;
    return (
        !filters.onlyProblematic ||
        value.status === ArticleStatus.NEEDS_REVIEW ||
        value.contentAvailability !== 'FULL_TEXT' ||
        !value.title?.trim() ||
        !value.summary?.trim() ||
        !value.url?.trim()
    );
}

test(
    'PostgreSQL full-text verification matches JavaScript for exact hashes and malformed assessment JSON',
    testOptions,
    async () => {
        const verified = makeManualContentAssessment(unicodeBody);
        const assessments: unknown[] = [
            verified,
            { ...verified, method: 'READABILITY' },
            { ...verified, method: 'JSON_LD' },
            null,
            true,
            1,
            'assessment',
            [],
            [verified],
            {},
            { ...verified, version: '1' },
            { ...verified, version: 2 },
            { ...verified, fullText: 'true' },
            { ...verified, fullText: 1 },
            { ...verified, method: 'EXISTING' },
            { ...verified, method: 'manual' },
            { ...verified, reasons: '[]' },
            { ...verified, reasons: {} },
            { ...verified, reasons: null },
            { ...verified, reasons: ['INCOMPLETE'] },
            { ...verified, textHash: 123 },
            { ...verified, textHash: getArticleTextHash(unicodeBody.trim()) },
            { ...verified, signals: null },
            { ...verified, signals: [] },
            { ...verified, signals: 'signals' },
            ...(
                [
                    'documentComplete',
                    'identityMatched',
                    'paywall',
                    'truncated',
                ] as const
            ).flatMap((signal) => [
                {
                    ...verified,
                    signals: {
                        ...verified.signals,
                        [signal]: String(verified.signals[signal]),
                    },
                },
                {
                    ...verified,
                    signals: {
                        ...verified.signals,
                        [signal]: !verified.signals[signal],
                    },
                },
            ]),
        ];
        const articles = assessments.map((contentAssessment, index) =>
            article(`assessment-${index}`, { contentAssessment }),
        );
        articles.push(
            article('edited-text', { content: `${unicodeBody}!` }),
            article('null-content', { content: null }),
            // Compare the existing predicate exactly, including its empty-text
            // behavior; normal manual confirmation cannot create this assessment.
            article('empty-hash', {
                content: null,
                contentAssessment: {
                    ...verified,
                    textHash: getArticleTextHash(''),
                },
            }),
        );
        const rows = await fixtureQuery<{ id: string; verified: boolean }>(
            articles,
            Prisma.sql`SELECT a."id", ${rawArticleFullTextVerifiedSql()} AS verified
            FROM "Article" a ORDER BY a."id"`,
        );
        const byId = new Map(articles.map((value) => [value.id, value]));
        assert.equal(rows.length, articles.length);
        for (const row of rows) {
            const value = byId.get(row.id)!;
            assert.equal(typeof row.verified, 'boolean', row.id);
            assert.equal(
                row.verified,
                isCurrentFullTextAssessment(
                    value.content ?? '',
                    value.contentAssessment,
                ),
                row.id,
            );
        }
    },
);

test(
    'PostgreSQL global eligibility agrees with application policy across statuses, links, URLs, metadata, and filters',
    testOptions,
    async () => {
        const articles: FixtureArticle[] = [
            ...Object.values(ArticleStatus).map((status) =>
                article(`status-${status}`, { status }),
            ),
            article('linked-reviewed', { _count: { clusterLinks: 2 } }),
            article('linked-new', {
                status: ArticleStatus.NEW,
                contentAssessment: null,
                _count: { clusterLinks: 1 },
            }),
            article('legacy-full-label', { contentAssessment: null }),
            article('verified-partial-label', {
                contentAvailability: 'PARTIAL_TEXT',
            }),
            article('null-availability', { contentAvailability: null }),
            article('blank-title', { title: '\u00a0\uFEFF\t\n' }),
            article('blank-summary', { summary: '\u2002\u202f\r ' }),
            article('blank-source-id', { sourceId: ' \uFEFF ' }),
            article('blank-url', { url: '\t\n\u00a0 ' }),
            article('missing-summary', { summary: null }),
            article('literal', {
                sourceId: 'source-other',
                title: 'Literal 100%_\\ phrase',
                createdAt: '2026-09-09T12:00:00.000Z',
            }),
            ...[
                'not a URL',
                'ftp://example.org/article',
                'https://256.1.1.1/article',
                'http://[::1',
                'http:example.org/article',
                'https:\\example.org\\article',
                'https://münich.example/article',
                'http://0x7f000001/article',
                ' \tHTTPS://EXAMPLE.ORG/article\n',
            ].map((url, index) => article(`url-${index}`, { url })),
        ];
        const filters: RawArticleFilters[] = [
            { onlyProblematic: false },
            { onlyProblematic: true },
            { onlyProblematic: false, status: ArticleStatus.REVIEWED },
            { onlyProblematic: false, contentAvailability: 'FULL_TEXT' },
            { onlyProblematic: false, sourceName: 'Literal 100%_\\ Publisher' },
            { onlyProblematic: false, search: '100%_\\' },
            {
                onlyProblematic: false,
                fetchedFrom: new Date('2026-09-09T00:00:00.000Z'),
                fetchedTo: new Date('2026-09-10T00:00:00.000Z'),
            },
            { onlyProblematic: false, search: 'No fixture matches this query' },
        ];
        const facade = {
            $queryRaw: (query: Prisma.Sql) => fixtureQuery(articles, query),
        } as unknown as Prisma.TransactionClient;
        for (const filter of filters) {
            const matched = articles.filter((value) =>
                matchesFilter(value, filter),
            );
            const expected = {
                total: matched.length,
                eligibility: {
                    RECHECK: matched.filter(
                        (value) =>
                            getRawArticleActionEligibility(value, 'RECHECK')
                                .eligible,
                    ).length,
                    APPROVE: matched.filter(
                        (value) =>
                            getRawArticleActionEligibility(value, 'APPROVE')
                                .eligible,
                    ).length,
                    REJECT: matched.filter(
                        (value) =>
                            getRawArticleActionEligibility(value, 'REJECT')
                                .eligible,
                    ).length,
                },
                enrichmentEligibleCount: matched.filter(
                    (value) => getEnrichmentEligibility(value).eligible,
                ).length,
            };
            assert.deepEqual(
                await getRawArticleListSummary(facade, filter),
                expected,
                JSON.stringify(filter),
            );
        }
    },
);

test(
    'PostgreSQL page queries bound rows with stable ties and preserve literal search and date boundaries',
    testOptions,
    async () => {
        const articles = [
            article('c'),
            article('a'),
            article('b'),
            article('older', { createdAt: '2026-09-09T12:00:00.000Z' }),
            article('newest', { createdAt: '2026-09-11T12:00:00.000Z' }),
            article('literal', {
                title: 'A literal 100%_\\ match',
                createdAt: '2026-09-08T12:00:00.000Z',
            }),
            article('wildcard-decoy', {
                title: 'A literal 100XX match',
                createdAt: '2026-09-08T12:00:00.000Z',
            }),
        ];
        const ids = async (query: Prisma.Sql) =>
            (await fixtureQuery<{ id: string }>(articles, query)).map(
                ({ id }) => id,
            );
        const filters = { onlyProblematic: false };
        assert.deepEqual(await ids(buildRawArticlePageSql(filters, 2, 0)), [
            'newest',
            'a',
        ]);
        assert.deepEqual(await ids(buildRawArticlePageSql(filters, 2, 2)), [
            'b',
            'c',
        ]);
        assert.deepEqual(await ids(buildRawArticlePageSql(filters, 2, 4)), [
            'older',
            'literal',
        ]);
        assert.deepEqual(await ids(buildRawArticlePageSql(filters, 2, 6)), [
            'wildcard-decoy',
        ]);
        assert.deepEqual(await ids(buildRawArticlePageSql(filters, 2, 8)), []);
        assert.deepEqual(
            await ids(
                buildRawArticlePageSql({ ...filters, search: '100%_\\' }, 2, 0),
            ),
            ['literal'],
        );
        assert.deepEqual(
            await ids(
                buildRawArticlePageSql(
                    {
                        ...filters,
                        fetchedFrom: new Date('2026-09-09T12:00:00.000Z'),
                        fetchedTo: new Date('2026-09-11T12:00:00.000Z'),
                    },
                    10,
                    0,
                ),
            ),
            ['a', 'b', 'c', 'older'],
        );
        // Explicit bulk preview selection keeps its full scope independent of pages.
        assert.deepEqual(
            await ids(
                buildRawArticleFilterSql(filters, [
                    'newest',
                    'older',
                    'literal',
                ]),
            ),
            ['newest', 'older', 'literal'],
        );
    },
);
