import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'dotenv';
import { Pool } from 'pg';
import {
    cancelClusterBulkJob,
    claimClusterBulkItem,
    getClusterBulkJob,
    runClusterBulkWorkerOnce,
    startClusterBulkJob,
} from '../src/core/clusterBulkJobs';

// A full Prisma/migration integration fixture, isolated from application tables.
// The worker uses a stub provider. No network AI requests or real publications.
test(
    'durable cluster jobs persist, serialize, recover and retry through Prisma/PostgreSQL',
    {
        skip: process.env.RUZHEN_CLUSTER_BULK_POSTGRES_TESTS !== '1',
        timeout: 60000,
    },
    async (context) => {
        const url = new URL(
            process.env.DATABASE_URL ??
                parse(readFileSync(resolve(__dirname, '../.env'))).DATABASE_URL,
        );
        assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
        assert.ok(['/ruzhen_dev', '/ruzhen_test'].includes(url.pathname));
        for (const key of ['options', 'schema', 'search_path'])
            url.searchParams.delete(key);
        const schema =
            'ruzhen_jobs_test_' +
            process.pid +
            '_' +
            randomUUID().replace(/-/g, '');
        assert.match(schema, /^ruzhen_jobs_test_\d+_[a-f0-9]{32}$/);
        assert.ok(schema.length <= 63);
        const pool = new Pool({
            connectionString: url.toString(),
            max: 5,
            connectionTimeoutMillis: 5000,
            options:
                '-c search_path=' +
                schema +
                ' -c statement_timeout=15000 -c lock_timeout=10000',
        });
        const prisma = new PrismaClient({
            adapter: new PrismaPg(pool, { schema }),
        });
        let created = false;
        let actorId = '';
        const draft = JSON.stringify({
            title: 'Fixture generated title',
            summary: 'Fixture generated summary',
            blocks: [
                { type: 'FACT', content: 'Fixture confirmed fact.' },
                { type: 'CONTEXT', content: 'Fixture context.' },
            ],
        });
        let providerCalls = 0;
        const provider = {
            generateAnalyzedNews: async () => {
                providerCalls++;
                return draft;
            },
        };
        const start = (
            action: 'CONTEXTUALIZE' | 'PUBLISH',
            retryOfJobId?: string,
        ) =>
            startClusterBulkJob({
                prisma,
                action,
                retryOfJobId,
                requestId: randomUUID(),
                createdByUserId: actorId,
            });
        try {
            await pool.query('CREATE SCHEMA "' + schema + '"');
            created = true;
            const search = await pool.query<{ schema: string }>(
                'SELECT current_schema() AS schema',
            );
            assert.equal(search.rows[0].schema, schema);
            const migrations = resolve(__dirname, '../prisma/migrations');
            for (const folder of readdirSync(migrations, {
                withFileTypes: true,
            })
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort()) {
                const sql = readFileSync(
                    resolve(migrations, folder, 'migration.sql'),
                    'utf8',
                );
                assert.doesNotMatch(
                    sql,
                    /\bpublic\.|"public"\s*\./,
                    'Migrations must stay in the isolated search path',
                );
                await pool.query(sql);
            }
            const actor = await prisma.user.create({
                data: { email: 'queue-fixture@example.test', role: 'ADMIN' },
            });
            actorId = actor.id;
            const source = await prisma.source.create({
                data: {
                    name: 'Fixture source',
                    baseUrl: 'https://fixture.invalid',
                    type: 'RSS',
                },
            });
            for (let index = 0; index < 2; index++) {
                const article = await prisma.article.create({
                    data: {
                        sourceId: source.id,
                        url: 'https://fixture.invalid/' + index,
                        title: 'Fixture source title',
                        content: 'Fixture source article body.',
                    },
                });
                await prisma.cluster.create({
                    data: {
                        humanId: 'fixture-' + index,
                        title: 'Fixture cluster ' + index,
                        summary: 'Fixture summary.',
                        status: 'DRAFT',
                        createdByUserId: actor.id,
                        articleLinks: {
                            create: {
                                articleId: article.id,
                                addedByUserId: actor.id,
                                method: 'MANUAL',
                            },
                        },
                    },
                });
            }

            await context.test(
                'concurrent starts share one frozen job and worker results commit atomically',
                async () => {
                    const [first, second] = await Promise.all([
                        start('CONTEXTUALIZE'),
                        start('CONTEXTUALIZE'),
                    ]);
                    assert.equal(first.job.id, second.job.id);
                    assert.equal(first.job.total, 2);
                    assert.equal(await prisma.clusterBulkJob.count(), 1);
                    await assert.rejects(start('PUBLISH'), /already active/);
                    const initial = await getClusterBulkJob({
                        prisma,
                        jobId: first.job.id,
                        limit: 1,
                    });
                    assert.equal(initial.items.length, 1);
                    assert.equal(initial.job.counts.PENDING, 2);
                    assert.equal(initial.pagination.totalPages, 2);
                    await Promise.all([
                        runClusterBulkWorkerOnce({ prisma, provider }),
                        runClusterBulkWorkerOnce({ prisma, provider }),
                    ]);
                    // One or both items may finish depending on transaction scheduling.
                    while (
                        await runClusterBulkWorkerOnce({ prisma, provider })
                    ) {
                        /* Drain only fixture items. */
                    }
                    const done = await getClusterBulkJob({
                        prisma,
                        jobId: first.job.id,
                    });
                    assert.equal(done.job.status, 'COMPLETED');
                    assert.equal(done.job.counts.SUCCEEDED, 2);
                    assert.equal(providerCalls, 2);
                    assert.equal(await prisma.clusterBlock.count(), 4);
                },
            );

            await context.test(
                'publication persists success without an AI call and cancellation retains completed results',
                async () => {
                    const publication = await start('PUBLISH');
                    await runClusterBulkWorkerOnce({ prisma, provider });
                    const canceled = await cancelClusterBulkJob({
                        prisma,
                        jobId: publication.job.id,
                    });
                    assert.equal(canceled.job.status, 'CANCELED');
                    assert.equal(canceled.job.counts.SUCCEEDED, 1);
                    assert.equal(canceled.job.counts.CANCELED, 1);
                    assert.equal(
                        await prisma.cluster.count({
                            where: { status: 'PUBLISHED' },
                        }),
                        1,
                    );
                    assert.equal(providerCalls, 2);
                    const retry = await start('PUBLISH', publication.job.id);
                    assert.equal(retry.job.total, 1);
                    await runClusterBulkWorkerOnce({ prisma, provider });
                    assert.equal(
                        await prisma.cluster.count({
                            where: { status: 'PUBLISHED' },
                        }),
                        2,
                    );
                    assert.equal(providerCalls, 2);
                },
            );

            await context.test(
                'expired AI claims become explicit failures while pending items resume and can be retried',
                async () => {
                    await prisma.cluster.updateMany({
                        data: { status: 'UPDATED' },
                    });
                    const started = await start('CONTEXTUALIZE');
                    const claim = await claimClusterBulkItem({ prisma });
                    assert.ok(claim);
                    await prisma.clusterBulkJobItem.update({
                        where: { id: claim.item.id },
                        data: {
                            aiStartedAt: new Date(),
                            leaseExpiresAt: new Date(0),
                        },
                    });
                    await runClusterBulkWorkerOnce({ prisma, provider });
                    const recovered = await getClusterBulkJob({
                        prisma,
                        jobId: started.job.id,
                    });
                    assert.equal(recovered.job.counts.FAILED, 1);
                    assert.equal(recovered.job.counts.SUCCEEDED, 1);
                    assert.equal(recovered.job.status, 'COMPLETED');
                    assert.equal(providerCalls, 3);
                    const retry = await start('CONTEXTUALIZE', started.job.id);
                    assert.equal(retry.job.total, 1);
                    await runClusterBulkWorkerOnce({ prisma, provider });
                    assert.equal(providerCalls, 4);
                },
            );
        } finally {
            await prisma.$disconnect();
            try {
                if (created) {
                    assert.match(schema, /^ruzhen_jobs_test_\d+_[a-f0-9]{32}$/);
                    await pool.query('DROP SCHEMA "' + schema + '" CASCADE');
                    const dropped = await pool.query<{ removed: boolean }>(
                        'SELECT to_regnamespace($1) IS NULL AS removed',
                        [schema],
                    );
                    assert.equal(dropped.rows[0].removed, true);
                    context.diagnostic(
                        'Isolated fixture schema removed. Application tables were not accessed.',
                    );
                }
            } finally {
                await pool.end();
            }
        }
    },
);
