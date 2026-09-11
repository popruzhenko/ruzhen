import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response, Router } from 'express';
import { signAccesToken } from '../src/shared/lib/jwt';

let handlerCalls = 0;
const handler = (_req: Request, res: Response) => {
    handlerCalls++;
    return res.status(200).json({ reachedHandler: true });
};
// Exercise the real router and authorization middleware without loading the
// database-backed controllers or creating an AI provider.
for (const [path, names] of [
    [
        '../src/modules/clusters/controllers/cluster.controller',
        [
            'createClusterHandler',
            'deleteClusterHandler',
            'listClustersHandler',
            'updateClusterHandler',
            'createClusterFromArticlesHandler',
            'updateClusterStatusHandler',
            'updateClusterArticlesHandler',
            'getClusterByIdHandler',
        ],
    ],
    [
        '../src/modules/clusters/controllers/cluster-bulk.controller',
        ['previewClusterBulkHandler', 'executeClusterBulkHandler'],
    ],
    [
        '../src/modules/clusters/controllers/cluster-bulk-job.controller',
        [
            'startClusterBulkJobHandler',
            'listClusterBulkJobsHandler',
            'getClusterBulkJobHandler',
            'cancelClusterBulkJobHandler',
            'retryClusterBulkJobHandler',
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
const router: Router =
    require('../src/modules/clusters/routes/admin-cluster.routes').default;
function dispatch(url: string, token?: string, method = 'POST') {
    return new Promise<number>((resolve, reject) => {
        let status = 200;
        const req = {
            method,
            url,
            originalUrl: url,
            headers: token ? { authorization: `Bearer ${token}` } : {},
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

test('bulk preview and execution reject missing/invalid tokens before business handlers', async () => {
    handlerCalls = 0;
    for (const url of ['/bulk/preview', '/bulk/execute']) {
        assert.equal(await dispatch(url), 401);
        assert.equal(await dispatch(url, 'invalid'), 401);
    }
    assert.equal(handlerCalls, 0);
});

test('ordinary users cannot preview or execute global cluster actions', async () => {
    handlerCalls = 0;
    const token = signAccesToken({
        userId: 'ordinary-user',
        email: 'user@example.test',
        role: 'USER',
    });
    for (const url of ['/bulk/preview', '/bulk/execute'])
        assert.equal(await dispatch(url, token), 403);
    assert.equal(handlerCalls, 0);
});

test('administrators reach both explicit bulk routes', async () => {
    handlerCalls = 0;
    const token = signAccesToken({
        userId: 'editor',
        email: 'editor@example.test',
        role: 'ADMIN',
    });
    for (const url of ['/bulk/preview', '/bulk/execute'])
        assert.equal(await dispatch(url, token), 200);
    assert.equal(handlerCalls, 2);
});

test('every saved-job route requires an administrator before invoking its handler', async () => {
    const admin = signAccesToken({
        userId: 'editor',
        email: 'editor@example.test',
        role: 'ADMIN',
    });
    const user = signAccesToken({
        userId: 'reader',
        email: 'reader@example.test',
        role: 'USER',
    });
    const routes = [
        ['POST', '/bulk/jobs'],
        ['GET', '/bulk/jobs'],
        ['GET', '/bulk/jobs/job-1'],
        ['POST', '/bulk/jobs/job-1/cancel'],
        ['POST', '/bulk/jobs/job-1/retry'],
    ];
    handlerCalls = 0;
    for (const [method, url] of routes) {
        assert.equal(await dispatch(url, undefined, method), 401);
        assert.equal(await dispatch(url, user, method), 403);
    }
    assert.equal(handlerCalls, 0);
    for (const [method, url] of routes)
        assert.equal(await dispatch(url, admin, method), 200);
    assert.equal(handlerCalls, routes.length);
});
