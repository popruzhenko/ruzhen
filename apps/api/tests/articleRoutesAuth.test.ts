import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response, Router } from 'express';
import { signAccesToken } from '../src/shared/lib/jwt';

// Use the real routers and authentication middleware, replacing business
// handlers so this suite cannot load the database or trigger ingestion.
let handlerCalls = 0;
const handler = (_req: Request, res: Response) => {
    handlerCalls++;
    return res.status(200).json({ reachedHandler: true });
};
for (const [path, names] of [
    [
        '../src/modules/articles/controller/article.controller',
        [
            'listArticlesHandler',
            'getArticleByIdHandler',
            'updateArticleHandler',
            'deleteAllArticlesHandler',
            'reviewArticleContentHandler',
            'generateArticleEmbeddingsHandler',
            'fetchNewArticlesHandler',
        ],
    ],
    [
        '../src/modules/articles/controller/raw-article.controller',
        [
            'listRawArticlesHandler',
            'previewRawArticlesHandler',
            'runRawArticlesBatchHandler',
        ],
    ],
    [
        '../src/modules/articles/controller/enrichment-article.controller',
        [
            'startEnrichmentJobHandler',
            'listEnrichmentJobsHandler',
            'getEnrichmentJobHandler',
            'stopEnrichmentJobHandler',
            'retryEnrichmentJobHandler',
            'getEnrichmentProposalHandler',
            'applyEnrichmentProposalHandler',
            'dismissEnrichmentProposalHandler',
            'listArticleVersionsHandler',
            'restoreArticleVersionHandler',
        ],
    ],
] as const) {
    const id = require.resolve(path);
    require.cache[id] = {
        id,
        filename: id,
        loaded: true,
        exports: Object.fromEntries(names.map((name) => [name, handler])),
    } as NodeModule;
}

const publicRouter: Router =
    require('../src/modules/articles/routes/public-article.routes').default;
const adminRouter: Router =
    require('../src/modules/articles/routes/admin-article.routes').default;

function dispatch(
    router: Router,
    method: string,
    url: string,
    authorization?: string,
) {
    return new Promise<number>((resolve, reject) => {
        let status = 200;
        const req = {
            method,
            url,
            originalUrl: url,
            headers: authorization ? { authorization } : {},
        } as Request;
        const res = {
            status(code: number) {
                status = code;
                return this;
            },
            json() {
                resolve(status);
                return this;
            },
        } as unknown as Response;
        router(req, res, (error?: unknown) =>
            error ? reject(error) : resolve(404),
        );
    });
}

const protectedRoutes: Array<[Router, string, string]> = [
    [publicRouter, 'PATCH', '/article-1'],
    [publicRouter, 'DELETE', '/'],
    [publicRouter, 'POST', '/article-1/review-content'],
    [adminRouter, 'GET', '/raw'],
    [adminRouter, 'POST', '/bulk/preview'],
    [adminRouter, 'POST', '/bulk'],
    [adminRouter, 'POST', '/fetch-new'],
    [adminRouter, 'POST', '/generate-embeddings'],
    [adminRouter, 'POST', '/enrichment/jobs'],
    [adminRouter, 'GET', '/enrichment/jobs'],
    [adminRouter, 'GET', '/enrichment/jobs/job-1'],
    [adminRouter, 'POST', '/enrichment/jobs/job-1/stop'],
    [adminRouter, 'POST', '/enrichment/jobs/job-1/retry-errors'],
    [adminRouter, 'GET', '/enrichment/items/item-1/proposal'],
    [adminRouter, 'POST', '/enrichment/items/item-1/apply'],
    [adminRouter, 'POST', '/enrichment/items/item-1/dismiss'],
    [adminRouter, 'GET', '/enrichment/articles/article-1/versions'],
    [adminRouter, 'POST', '/enrichment/versions/version-1/restore'],
];

test('every article mutation and raw bulk endpoint denies missing or invalid authentication', async () => {
    handlerCalls = 0;
    for (const [router, method, url] of protectedRoutes) {
        assert.equal(
            await dispatch(router, method, url),
            401,
            `${method} ${url}`,
        );
        assert.equal(
            await dispatch(router, method, url, 'Bearer invalid-token'),
            401,
            `${method} ${url}`,
        );
    }
    assert.equal(handlerCalls, 0);
});

test('a signed ordinary user cannot reach article administration handlers', async () => {
    handlerCalls = 0;
    const token = signAccesToken({
        userId: 'test-user',
        email: 'test@example.org',
        role: 'USER',
    });
    for (const [router, method, url] of protectedRoutes) {
        assert.equal(
            await dispatch(router, method, url, `Bearer ${token}`),
            403,
            `${method} ${url}`,
        );
    }
    assert.equal(handlerCalls, 0);
});

test('administrators can reach each existing and new route without changing client URLs', async () => {
    handlerCalls = 0;
    const token = signAccesToken({
        userId: 'test-admin',
        email: 'admin@example.org',
        role: 'ADMIN',
    });
    for (const [router, method, url] of protectedRoutes) {
        assert.equal(
            await dispatch(router, method, url, `Bearer ${token}`),
            200,
            `${method} ${url}`,
        );
    }
    assert.equal(handlerCalls, protectedRoutes.length);
});

test('existing article read routes remain available', async () => {
    assert.equal(await dispatch(publicRouter, 'GET', '/'), 200);
    assert.equal(await dispatch(publicRouter, 'GET', '/article-1'), 200);
});
