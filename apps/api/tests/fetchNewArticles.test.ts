import assert from 'node:assert/strict';
import test from 'node:test';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../src/shared/middleware/require-auth';

// Exercise the real controller without loading database clients, credentials,
// ingestion adapters, or embedding providers.
const prisma = Object.freeze({ testClient: true });
const calls: Array<{ client: unknown; options: unknown }> = [];
let ingest: () => Promise<unknown> = async () => ({ parseResults: [] });
for (const [path, moduleExports] of [
    ['../src/shared/lib/prismaClient', { prisma }],
    ['../src/shared/lib/requireEnv', { requireEnv: () => 'unused-test-key' }],
    ['../src/modules/articles/services/atricle.service', {}],
    ['../src/core/ingestionNews/review/reviewArticleContent.service', {}],
    ['../src/core/embedding/openAiEmbeddingProvider', {}],
    ['../src/core/embedding/embedArticle.services', {}],
    [
        '../src/core/ingestionNews/runPoliticsIngestionJob',
        {
            runPoliticsIngestionJob(client: unknown, options: unknown) {
                calls.push({ client, options });
                return ingest();
            },
        },
    ],
] as const) {
    const id = require.resolve(path);
    require.cache[id] = {
        id,
        filename: id,
        loaded: true,
        exports: moduleExports,
    } as NodeModule;
}

const { fetchNewArticlesHandler } =
    require('../src/modules/articles/controller/article.controller') as typeof import('../src/modules/articles/controller/article.controller');

function request(userId?: string): AuthenticatedRequest {
    return {
        ...(userId
            ? { user: { userId, email: 'admin@example.org', role: 'ADMIN' } }
            : {}),
    } as AuthenticatedRequest;
}

function response() {
    const result = { status: 200, body: undefined as unknown };
    const res = {
        status(code: number) {
            result.status = code;
            return this;
        },
        json(body: unknown) {
            result.body = body;
            return this;
        },
    } as unknown as Response;
    return { result, res };
}

function deferred() {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test('Fetch forwards the authenticated actor and keeps its lock through rejected concurrent requests', async () => {
    calls.length = 0;
    const waiting = deferred();
    ingest = () => waiting.promise;
    const first = response();
    const pending = fetchNewArticlesHandler(request('admin-owner'), first.res);
    try {
        assert.deepEqual(calls, [
            { client: prisma, options: { createdByUserId: 'admin-owner' } },
        ]);

        const second = response();
        await fetchNewArticlesHandler(request('admin-other'), second.res);
        assert.equal(second.result.status, 409);

        const third = response();
        const thirdPending = fetchNewArticlesHandler(
            request('admin-third'),
            third.res,
        );
        assert.equal(third.result.status, 409);
        await thirdPending;

        const unauthorized = response();
        await fetchNewArticlesHandler(request(), unauthorized.res);
        assert.equal(unauthorized.result.status, 401);

        const afterUnauthorized = response();
        const afterUnauthorizedPending = fetchNewArticlesHandler(
            request('admin-fourth'),
            afterUnauthorized.res,
        );
        assert.equal(afterUnauthorized.result.status, 409);
        await afterUnauthorizedPending;
        assert.equal(calls.length, 1);
    } finally {
        waiting.resolve({ enrichment: { jobId: 'automatic-job' } });
        await pending;
    }
    assert.equal(first.result.status, 200);
    assert.deepEqual(first.result.body, {
        message: 'New articles fetched successfully',
        result: { enrichment: { jobId: 'automatic-job' } },
    });

    ingest = async () => ({ parseResults: [] });
    const next = response();
    await fetchNewArticlesHandler(request('next-owner'), next.res);
    assert.equal(next.result.status, 200);
    assert.deepEqual(calls[1], {
        client: prisma,
        options: { createdByUserId: 'next-owner' },
    });
});

test('Fetch releases the owned lock after ingestion fails so a later request can run', async (context) => {
    calls.length = 0;
    const log = context.mock.method(console, 'error', () => undefined);
    ingest = async () => {
        throw new Error('Source synchronization failed');
    };
    const failed = response();
    await fetchNewArticlesHandler(request('failed-owner'), failed.res);
    assert.equal(failed.result.status, 400);
    assert.deepEqual(failed.result.body, {
        message: 'Source synchronization failed',
    });
    assert.equal(log.mock.callCount(), 1);

    ingest = async () => ({ parseResults: [] });
    const recovered = response();
    await fetchNewArticlesHandler(request('retry-owner'), recovered.res);
    assert.equal(recovered.result.status, 200);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].options, { createdByUserId: 'retry-owner' });
});

test('an unauthenticated Fetch does not start ingestion', async () => {
    calls.length = 0;
    const unauthorized = response();
    await fetchNewArticlesHandler(request(), unauthorized.res);
    assert.equal(unauthorized.result.status, 401);
    assert.deepEqual(unauthorized.result.body, { message: 'Unauthorized' });
    assert.equal(calls.length, 0);
});
