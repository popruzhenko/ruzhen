import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ArticleStatus,
    ContentAvailability,
    Prisma,
    type PrismaClient,
} from '@prisma/client';
import { enrichLatestArticles } from '../src/core/ingestionNews/enrich/enrichArticle.services';
import { makeManualContentAssessment } from '../src/core/ingestionNews/enrich/articleContentQuality';
import type { EnrichmentArticle } from '../src/core/enrichmentJobs';

const initialTime = new Date('2026-09-09T09:00:00Z');
const makeArticle = (id: string, verified = false): EnrichmentArticle => {
    const content = verified
        ? 'The editor verified this complete article text.'
        : null;
    return {
        id,
        sourceId: 'source',
        url: `https://example.com/${id}`,
        title: `A headline for article ${id}`,
        summary:
            'The article summary provides context for a later retrieval attempt.',
        content,
        cleanedAccessibleText: null,
        imageUrl: null,
        publishedAt: null,
        status: ArticleStatus.NEW,
        contentAvailability: verified
            ? ContentAvailability.FULL_TEXT
            : ContentAvailability.SUMMARY_ONLY,
        contentAssessment: content
            ? (makeManualContentAssessment(
                  content,
              ) as unknown as Prisma.JsonValue)
            : null,
        contentProvenance: null,
        cleaningMethod: null,
        createdAt: new Date(initialTime.getTime() + (verified ? 0 : 1000)),
        updatedAt: initialTime,
        _count: { clusterLinks: 0 },
    };
};

function readDatabase(initialArticles: EnrichmentArticle[]) {
    const articles = structuredClone(initialArticles);
    const scans: Prisma.ArticleFindManyArgs[] = [];
    let selectionFinished = false;
    const current = (id: string) =>
        structuredClone(articles.find((article) => article.id === id) ?? null);
    const direct = {
        findUnique: async (args: { where: { id: string } }) =>
            current(args.where.id),
    };
    const prisma = {
        article: direct,
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options?: { isolationLevel?: string },
        ): Promise<T> => {
            if (
                options?.isolationLevel !==
                Prisma.TransactionIsolationLevel.RepeatableRead
            ) {
                return run({
                    article: direct,
                } as unknown as Prisma.TransactionClient);
            }
            assert.equal(
                selectionFinished,
                false,
                'Create exactly one starting snapshot',
            );
            const snapshot = structuredClone(articles);
            const tx = {
                article: {
                    findMany: async (args: Prisma.ArticleFindManyArgs) => {
                        scans.push(args);
                        assert.equal(args.take, 250);
                        assert.equal(args.skip, undefined);
                        assert.deepEqual(args.orderBy, [
                            { createdAt: 'asc' },
                            { id: 'asc' },
                        ]);
                        assert.ok(args.select?.contentAssessment);
                        assert.equal(args.select?.embedding, undefined);
                        const clauses = args.where?.OR;
                        const afterDate = clauses?.[0]?.createdAt as
                            { gt: Date } | undefined;
                        const afterId = clauses?.[1]?.id as
                            { gt: string } | undefined;
                        return snapshot
                            .filter(
                                (article) =>
                                    article.status !== ArticleStatus.REJECTED &&
                                    article.status !==
                                        ArticleStatus.CLUSTERED &&
                                    article._count.clusterLinks === 0 &&
                                    (!afterDate ||
                                        article.createdAt > afterDate.gt ||
                                        (article.createdAt.getTime() ===
                                            afterDate.gt.getTime() &&
                                            article.id > afterId!.gt)),
                            )
                            .sort(
                                (a, b) =>
                                    a.createdAt.getTime() -
                                        b.createdAt.getTime() ||
                                    a.id.localeCompare(b.id),
                            )
                            .slice(0, args.take!);
                    },
                },
            } as unknown as Prisma.TransactionClient;
            const result = await run(tx);
            selectionFinished = true;
            return result;
        },
    } as unknown as PrismaClient;
    return {
        prisma,
        articles,
        scans,
        assertSelected: () =>
            assert.equal(
                selectionFinished,
                true,
                'Do not perform retrieval during selection',
            ),
    };
}

test('the Fetch limit counts eligible articles after more than 50 verified records and scans past page boundaries', async () => {
    const db = readDatabase([
        ...Array.from({ length: 650 }, (_, index) =>
            makeArticle(`verified-${String(index).padStart(4, '0')}`, true),
        ),
        ...Array.from({ length: 60 }, (_, index) =>
            makeArticle(`pending-${String(index).padStart(4, '0')}`),
        ),
    ]);
    const retrieved: string[] = [];
    const result = await enrichLatestArticles(db.prisma, 50, {
        retrieve: async ({ url }) => {
            db.assertSelected();
            retrieved.push(url);
            return {
                candidate: null,
                reasons: ['No improved text was found.'],
            };
        },
    });
    assert.equal(result.length, 50);
    assert.equal(retrieved.length, 50);
    assert.equal(db.scans.length, 3);
    assert.equal(result[0].articleId, 'pending-0000');
    assert.equal(result[49].articleId, 'pending-0049');
    assert.ok(retrieved.every((url) => url.includes('/pending-')));
});

test('the default processes the complete eligible starting selection without the old 500-row cap', async () => {
    const db = readDatabase([
        ...Array.from({ length: 20 }, (_, index) =>
            makeArticle(`verified-${index}`, true),
        ),
        ...Array.from({ length: 600 }, (_, index) =>
            makeArticle(`pending-${String(index).padStart(4, '0')}`),
        ),
    ]);
    let calls = 0;
    const result = await enrichLatestArticles(db.prisma, undefined, {
        retrieve: async () => {
            db.assertSelected();
            calls++;
            if (calls === 1)
                db.articles.push(makeArticle('arrived-after-selection'));
            return { candidate: null, reasons: [] };
        },
    });
    assert.equal(result.length, 600);
    assert.equal(calls, 600);
    assert.equal(db.scans.length, 3);
    assert.equal(
        result.some(({ articleId }) => articleId === 'arrived-after-selection'),
        false,
    );
});

test('later article edits are checked against the version frozen before the first retrieval', async () => {
    const db = readDatabase([makeArticle('a'), makeArticle('b')]);
    let calls = 0;
    const result = await enrichLatestArticles(db.prisma, undefined, {
        retrieve: async () => {
            db.assertSelected();
            calls++;
            db.articles[1].content =
                'A manual edit made while another article was retrieved.';
            db.articles[1].updatedAt = new Date(initialTime.getTime() + 1);
            return { candidate: null, reasons: [] };
        },
    });
    assert.equal(calls, 1);
    assert.equal(result.length, 2);
    const skipped = result[1];
    assert.ok(skipped.success && skipped.result);
    assert.equal(skipped.result.outcome, 'SKIPPED');
    assert.match(db.articles[1].content!, /manual edit/);
});
