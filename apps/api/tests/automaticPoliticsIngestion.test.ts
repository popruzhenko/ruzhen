import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { runPoliticsIngestionJob } from '../src/core/ingestionNews/runPoliticsIngestionJob';
import type { AutomaticEnrichmentContext } from '../src/core/enrichmentJobs/automaticEnrichment';

const sources = [
    {
        id: 'rss',
        name: 'RSS publisher',
        baseUrl: 'https://rss.example/feed',
        type: 'RSS',
        accessMode: 'METADATA_ONLY',
        language: 'en',
        country: null,
    },
    {
        id: 'html',
        name: 'Section publisher',
        baseUrl: 'https://section.example/news',
        type: 'HTML',
        accessMode: 'FULL_OPEN',
        language: 'en',
        country: null,
    },
];
const parsed = {
    fetchedItems: 1,
    created: 1,
    updated: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
};

function database(role: string | null = 'ADMIN') {
    let queued: { id: string; total: number; status: string } | null = null;
    return {
        queue(
            context: AutomaticEnrichmentContext,
            total: number,
            status = 'QUEUED',
        ) {
            queued = { id: context.jobId, total, status };
        },
        prisma: {
            user: {
                findUnique: async ({ where }: { where: { id: string } }) => {
                    assert.equal(where.id, 'admin');
                    return role ? { role } : null;
                },
            },
            source: {
                findMany: async ({ where }: { where: unknown }) => {
                    assert.deepEqual(where, { isActive: true });
                    return sources;
                },
            },
            enrichmentJob: {
                findUnique: async ({ where }: { where: { id: string } }) =>
                    queued?.id === where.id ? queued : null,
            },
        } as unknown as PrismaClient,
    };
}

test('Fetch shares one automatic job across sources and returns without executing article retrieval', async () => {
    const db = database();
    const contexts: AutomaticEnrichmentContext[] = [];
    let synced = false;
    const result = await runPoliticsIngestionJob(
        db.prisma,
        { createdByUserId: 'admin' },
        {
            syncSources: async () => {
                synced = true;
                return [];
            },
            parseSource: async (prisma, source, context) => {
                assert.ok(synced);
                assert.equal(prisma, db.prisma);
                assert.ok(context);
                assert.equal(context.createdByUserId, 'admin');
                assert.equal(source.politicsOnly, true);
                assert.equal(
                    source.fetchMode,
                    source.id === 'rss' ? 'RSS' : 'SECTION_HTML',
                );
                contexts.push(context);
                db.queue(context, contexts.length);
                return {
                    ...parsed,
                    sourceId: source.id,
                    sourceName: source.name,
                };
            },
        },
    );
    assert.equal(contexts.length, 2);
    assert.equal(contexts[0], contexts[1]);
    assert.equal(result.parseResults.length, 2);
    assert.ok(result.parseResults.every((row) => row.success));
    assert.deepEqual(result.enrichment, {
        jobId: contexts[0].jobId,
        total: 2,
        status: 'QUEUED',
    });
    assert.equal('enrichResults' in result, false);
});

test('a failed source does not hide the durable queue already created by another source', async () => {
    const db = database();
    const result = await runPoliticsIngestionJob(
        db.prisma,
        { createdByUserId: 'admin' },
        {
            syncSources: async () => [],
            parseSource: async (_prisma, source, context) => {
                if (source.id === 'html')
                    throw new Error('Publisher feed unavailable');
                db.queue(context!, 1, 'RUNNING');
                return {
                    ...parsed,
                    sourceId: source.id,
                    sourceName: source.name,
                };
            },
        },
    );
    assert.equal(result.parseResults[0].success, true);
    assert.equal(result.parseResults[1].success, false);
    assert.equal(result.parseResults[1].error, 'Publisher feed unavailable');
    assert.equal(result.enrichment.total, 1);
    assert.equal(result.enrichment.status, 'RUNNING');
});

test('a Fetch with no newly queued articles reports no empty job', async () => {
    const db = database();
    const result = await runPoliticsIngestionJob(
        db.prisma,
        { createdByUserId: 'admin' },
        {
            syncSources: async () => [],
            parseSource: async (_prisma, source) => ({
                ...parsed,
                created: 0,
                skippedDuplicates: 1,
                sourceId: source.id,
                sourceName: source.name,
            }),
        },
    );
    assert.deepEqual(result.enrichment, {
        jobId: null,
        total: 0,
        status: null,
    });
});

test('missing or non-administrator actors are rejected before any source synchronization', async () => {
    for (const role of [null, 'USER']) {
        const db = database(role);
        await assert.rejects(
            runPoliticsIngestionJob(
                db.prisma,
                { createdByUserId: 'admin' },
                {
                    syncSources: async () => {
                        assert.fail(
                            'Cannot mutate sources for an invalid actor',
                        );
                    },
                },
            ),
            /existing administrator/,
        );
    }
    await assert.rejects(
        runPoliticsIngestionJob(database().prisma, { createdByUserId: ' ' }),
        /administrator is required/,
    );
});

test('Fetch reports completed or canceled queues instead of announcing work is still running', async () => {
    for (const status of ['COMPLETED', 'CANCELED']) {
        const db = database();
        const result = await runPoliticsIngestionJob(
            db.prisma,
            { createdByUserId: 'admin' },
            {
                syncSources: async () => [],
                parseSource: async (_prisma, source, context) => {
                    db.queue(context!, 2, status);
                    return {
                        ...parsed,
                        sourceId: source.id,
                        sourceName: source.name,
                    };
                },
            },
        );
        assert.equal(result.enrichment.status, status);
    }
});
