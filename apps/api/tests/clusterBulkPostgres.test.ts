import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { Prisma } from '@prisma/client';
import { parse } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import {
    clusterBulkRevision,
    lockClusterBulkState,
    type ClusterBulkSnapshot,
} from '../src/core/clusterBulk/revision';

// Opt in explicitly: this test creates only its own randomly named schema on
// a local development/test database. It never accesses application tables.
// Every competing write is rolled back; the committed fixture schema is
// removed in finally, including after a failed assertion.
const enabled = process.env.RUZHEN_CLUSTER_BULK_POSTGRES_TESTS === '1';
const envPath = resolve(__dirname, '../.env');
const connectionString =
    process.env.DATABASE_URL ??
    (existsSync(envPath)
        ? parse(readFileSync(envPath)).DATABASE_URL
        : undefined);
const clusterId = 'cluster-fixture';
const schemaPrefix = 'ruzhen_cluster_bulk_test_';

function guardedConnectionString(value: string): string {
    const url = new URL(value);
    assert.ok(
        ['postgres:', 'postgresql:'].includes(url.protocol),
        'The fixture requires a PostgreSQL connection.',
    );
    assert.ok(
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
        'Cluster lock fixtures may run only against loopback PostgreSQL.',
    );
    assert.ok(
        ['/ruzhen_dev', '/ruzhen_test'].includes(url.pathname),
        'Cluster lock fixtures require the local ruzhen_dev or ruzhen_test database.',
    );
    // pg connection-string options take precedence over Pool options. Remove
    // them so neither search_path nor timeouts can override the fixture guard.
    url.searchParams.delete('options');
    url.searchParams.delete('search_path');
    url.searchParams.delete('schema');
    return url.toString();
}

function transactionFacade(client: PoolClient): Prisma.TransactionClient {
    return {
        $queryRaw: async (query: Prisma.Sql) => {
            const result = await client.query({
                text: query.text,
                values: [...query.values],
            });
            return result.rows;
        },
    } as unknown as Prisma.TransactionClient;
}

async function readSnapshot(client: PoolClient): Promise<ClusterBulkSnapshot> {
    const { rows: clusters } = await client.query<
        Omit<ClusterBulkSnapshot, 'blocks' | 'articleLinks'>
    >('SELECT * FROM "Cluster" WHERE "id" = $1', [clusterId]);
    assert.equal(clusters.length, 1);
    const { rows: blocks } = await client.query<
        ClusterBulkSnapshot['blocks'][number]
    >('SELECT * FROM "ClusterBlock" WHERE "clusterId" = $1', [clusterId]);
    type Link = ClusterBulkSnapshot['articleLinks'][number];
    const { rows: links } = await client.query<
        Omit<Link, 'article'> & {
            articleUpdatedAt: Date;
            sourceId: string;
            sourceName: string;
        }
    >(
        `SELECT link.*, a."updatedAt" AS "articleUpdatedAt",
            a."sourceId", s."name" AS "sourceName"
        FROM "ClusterArticle" link
        JOIN "Article" a ON a."id" = link."articleId"
        JOIN "Source" s ON s."id" = a."sourceId"
        WHERE link."clusterId" = $1`,
        [clusterId],
    );
    return {
        ...clusters[0],
        blocks,
        articleLinks: links.map(
            ({ articleUpdatedAt, sourceId, sourceName, ...link }) => ({
                ...link,
                article: {
                    id: link.articleId,
                    updatedAt: articleUpdatedAt,
                    sourceId,
                    source: { id: sourceId, name: sourceName },
                },
            }),
        ),
    };
}

async function assertCompetingWriteIsBlocked({
    owner,
    writer,
    writerPid,
    ownerPid,
    label,
    sql,
}: {
    owner: PoolClient;
    writer: PoolClient;
    writerPid: number;
    ownerPid: number;
    label: string;
    sql: string;
}) {
    await owner.query('BEGIN');
    await writer.query('BEGIN');
    let pending: Promise<
        { ok: true; rowCount: number | null } | { ok: false; error: unknown }
    > | null = null;
    try {
        await lockClusterBulkState(transactionFacade(owner), clusterId);
        const revision = clusterBulkRevision(await readSnapshot(owner));
        let settled = false;
        pending = writer.query(sql).then(
            (result) => {
                settled = true;
                return { ok: true as const, rowCount: result.rowCount };
            },
            (error: unknown) => {
                settled = true;
                return { ok: false as const, error };
            },
        );

        // Observe an actual PostgreSQL dependency rather than assuming that an
        // unresolved promise after an arbitrary short sleep proves blocking.
        let blocked = false;
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline && !settled) {
            const { rows } = await owner.query<{ blocked: boolean }>(
                'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked',
                [ownerPid, writerPid],
            );
            if (rows[0].blocked) {
                blocked = true;
                break;
            }
            await delay(10);
        }
        assert.equal(blocked, true, `${label} must wait for the owner`);
        assert.equal(
            settled,
            false,
            `${label} completed while locks were held`,
        );
        assert.equal(
            clusterBulkRevision(await readSnapshot(owner)),
            revision,
            `${label} changed the fingerprint while locks were held`,
        );

        await owner.query('ROLLBACK');
        const outcome = await pending;
        if (!outcome.ok) throw outcome.error;
        assert.equal(outcome.rowCount, 1, `${label} must finish after release`);
    } finally {
        // Release the blocking transaction before awaiting the writer, also
        // when an assertion fails. No competing mutation is ever committed.
        await owner.query('ROLLBACK');
        if (pending) await pending;
        await writer.query('ROLLBACK');
    }
}

test(
    'PostgreSQL bulk locks protect parent, new and existing children, articles and sources',
    {
        skip: !enabled
            ? 'Set RUZHEN_CLUSTER_BULK_POSTGRES_TESTS=1 for isolated local PostgreSQL fixtures.'
            : !connectionString
              ? 'DATABASE_URL is not configured.'
              : false,
        timeout: 60000,
    },
    async (context) => {
        assert.ok(connectionString);
        const schema = `${schemaPrefix}${process.pid}_${randomUUID().replace(/-/g, '')}`;
        assert.match(schema, /^ruzhen_cluster_bulk_test_\d+_[a-f0-9]{32}$/);
        assert.ok(
            schema.length <= 63,
            'PostgreSQL schema name must not truncate',
        );
        const quotedSchema = `"${schema}"`;
        const pool = new Pool({
            connectionString: guardedConnectionString(connectionString),
            options: `-c search_path=${schema} -c statement_timeout=8000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=15000`,
            connectionTimeoutMillis: 5000,
            max: 2,
        });
        let owner: PoolClient | undefined;
        let writer: PoolClient | undefined;
        let schemaCreated = false;
        try {
            owner = await pool.connect();
            writer = await pool.connect();
            await owner.query(`CREATE SCHEMA ${quotedSchema}`);
            schemaCreated = true;
            for (const client of [owner, writer]) {
                const { rows } = await client.query<{
                    schema: string;
                    searchPath: string;
                }>(`SELECT current_schema() AS schema,
                    current_setting('search_path') AS "searchPath"`);
                assert.equal(rows[0].schema, schema);
                assert.equal(rows[0].searchPath, schema);
            }

            await owner.query(`
                CREATE TABLE "Source" (
                    "id" text PRIMARY KEY, "name" text NOT NULL
                );
                CREATE TABLE "Article" (
                    "id" text PRIMARY KEY,
                    "sourceId" text NOT NULL REFERENCES "Source"("id"),
                    "title" text NOT NULL,
                    "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
                );
                CREATE TABLE "Cluster" (
                    "id" text PRIMARY KEY, "humanId" text NOT NULL,
                    "title" text NOT NULL, "summary" text,
                    "mainCountry" text, "startDate" timestamptz(3),
                    "status" text NOT NULL, "publishedAt" timestamptz(3),
                    "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
                );
                CREATE TABLE "ClusterBlock" (
                    "id" text PRIMARY KEY,
                    "clusterId" text NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
                    "type" text NOT NULL, "title" text, "content" text NOT NULL,
                    "position" integer NOT NULL, "sourceName" text,
                    "sourceUrl" text, "authorName" text, "stance" text,
                    "createdByUserId" text NOT NULL,
                    "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
                    "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
                    UNIQUE ("clusterId", "position")
                );
                CREATE TABLE "ClusterArticle" (
                    "clusterId" text NOT NULL REFERENCES "Cluster"("id") ON DELETE CASCADE,
                    "articleId" text NOT NULL REFERENCES "Article"("id") ON DELETE CASCADE,
                    "addedByUserId" text NOT NULL,
                    "addedAt" timestamptz(3) NOT NULL DEFAULT now(),
                    "isPrimary" boolean NOT NULL DEFAULT false,
                    "confidence" double precision, "method" text NOT NULL,
                    PRIMARY KEY ("clusterId", "articleId")
                );
                INSERT INTO "Source" VALUES ('source-fixture', 'Fixture Publisher');
                INSERT INTO "Article" ("id", "sourceId", "title") VALUES
                    ('article-linked', 'source-fixture', 'Original article'),
                    ('article-new', 'source-fixture', 'Unlinked article');
                INSERT INTO "Cluster" ("id", "humanId", "title", "summary", "status")
                    VALUES ('cluster-fixture', 'fixture', 'Original cluster', 'Original summary', 'DRAFT');
                INSERT INTO "ClusterBlock" ("id", "clusterId", "type", "content", "position", "createdByUserId")
                    VALUES ('block-fixture', 'cluster-fixture', 'FACT', 'Original fact.', 1, 'fixture-user');
                INSERT INTO "ClusterArticle" ("clusterId", "articleId", "addedByUserId", "method")
                    VALUES ('cluster-fixture', 'article-linked', 'fixture-user', 'MANUAL');
            `);
            const ownerPid = (
                await owner.query<{ pid: number }>(
                    'SELECT pg_backend_pid() AS pid',
                )
            ).rows[0].pid;
            const writerPid = (
                await writer.query<{ pid: number }>(
                    'SELECT pg_backend_pid() AS pid',
                )
            ).rows[0].pid;
            assert.notEqual(ownerPid, writerPid);
            const originalRevision = clusterBulkRevision(
                await readSnapshot(owner),
            );
            const cases = [
                {
                    label: 'parent update',
                    sql: `UPDATE "Cluster" SET "title" = 'Concurrent title' WHERE "id" = 'cluster-fixture'`,
                },
                {
                    label: 'new block foreign key insertion',
                    sql: `INSERT INTO "ClusterBlock" ("id", "clusterId", "type", "content", "position", "createdByUserId")
                        VALUES ('block-new', 'cluster-fixture', 'CONTEXT', 'New context.', 2, 'fixture-user')`,
                },
                {
                    label: 'new article link foreign key insertion',
                    sql: `INSERT INTO "ClusterArticle" ("clusterId", "articleId", "addedByUserId", "method")
                        VALUES ('cluster-fixture', 'article-new', 'fixture-user', 'MANUAL')`,
                },
                {
                    label: 'existing block edit',
                    sql: `UPDATE "ClusterBlock" SET "content" = 'Concurrent fact.' WHERE "id" = 'block-fixture'`,
                },
                {
                    label: 'existing block deletion',
                    sql: `DELETE FROM "ClusterBlock" WHERE "id" = 'block-fixture'`,
                },
                {
                    label: 'existing link edit',
                    sql: `UPDATE "ClusterArticle" SET "isPrimary" = true WHERE "articleId" = 'article-linked'`,
                },
                {
                    label: 'existing link deletion',
                    sql: `DELETE FROM "ClusterArticle" WHERE "articleId" = 'article-linked'`,
                },
                {
                    label: 'linked source article edit',
                    sql: `UPDATE "Article" SET "title" = 'Concurrent article', "updatedAt" = "updatedAt" + interval '1 second' WHERE "id" = 'article-linked'`,
                },
                {
                    label: 'publisher edit',
                    sql: `UPDATE "Source" SET "name" = 'Concurrent Publisher' WHERE "id" = 'source-fixture'`,
                },
            ];
            for (const scenario of cases) {
                await context.test(scenario.label, async () => {
                    assert.ok(owner);
                    assert.ok(writer);
                    await assertCompetingWriteIsBlocked({
                        owner,
                        writer,
                        ownerPid,
                        writerPid,
                        ...scenario,
                    });
                    assert.equal(
                        clusterBulkRevision(await readSnapshot(owner)),
                        originalRevision,
                        'Fixture state must be restored by rollback',
                    );
                });
            }
        } finally {
            // The schema identifier was generated here and validated before
            // CREATE. Never drop a schema that this run did not create.
            try {
                if (owner) await owner.query('ROLLBACK');
                if (writer) await writer.query('ROLLBACK');
                if (schemaCreated && owner) {
                    assert.match(
                        schema,
                        /^ruzhen_cluster_bulk_test_\d+_[a-f0-9]{32}$/,
                    );
                    await owner.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
                    const { rows } = await owner.query<{ removed: boolean }>(
                        'SELECT to_regnamespace($1) IS NULL AS removed',
                        [schema],
                    );
                    assert.equal(
                        rows[0].removed,
                        true,
                        'Fixture schema must be removed',
                    );
                    context.diagnostic(
                        'Isolated fixture schema removed; application tables were never accessed.',
                    );
                }
            } finally {
                owner?.release();
                writer?.release();
                await pool.end();
            }
        }
    },
);
