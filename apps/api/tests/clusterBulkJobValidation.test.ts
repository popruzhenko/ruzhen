import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseClusterJobAction,
    parseClusterJobId,
    parseClusterJobPagination,
    parseRetryClusterJob,
    parseStartClusterJob,
} from '../src/core/clusterBulkJobs/validation';

const requestId = '10000000-0000-4000-8000-000000000001';
test('job requests accept only a supported action and a valid idempotency key', () => {
    assert.deepEqual(
        parseStartClusterJob({ action: 'CONTEXTUALIZE', requestId }),
        { action: 'CONTEXTUALIZE', requestId },
    );
    assert.deepEqual(parseRetryClusterJob({ requestId }), { requestId });
    for (const invalid of [
        undefined,
        [],
        {},
        { action: 'PUBLISH' },
        { action: 'DELETE', requestId },
        { action: 'PUBLISH', requestId: 'bad' },
        { action: 'PUBLISH', requestId, clusterIds: ['unsafe'] },
    ]) {
        assert.throws(() => parseStartClusterJob(invalid));
    }
    assert.throws(() => parseRetryClusterJob({ requestId, action: 'PUBLISH' }));
    assert.throws(() => parseClusterJobAction(['PUBLISH']));
    assert.throws(() => parseClusterJobId(''));
    assert.throws(() => parseClusterJobId(['job-1']));
});

test('results pagination is bounded and rejects ambiguous query parameters', () => {
    assert.deepEqual(parseClusterJobPagination({}), { page: 1, limit: 50 });
    assert.deepEqual(parseClusterJobPagination({ page: '2', limit: '100' }), {
        page: 2,
        limit: 100,
    });
    for (const invalid of [
        { page: '0' },
        { page: '-1' },
        { page: '1.5' },
        { page: ['1'] },
        { limit: '101' },
        { page: '99999999999999999999' },
        { action: 'PUBLISH' },
    ]) {
        assert.throws(() => parseClusterJobPagination(invalid));
    }
});

test('legacy per-event browser execution returns Gone without invoking a provider', async () => {
    const path = require.resolve('../src/shared/lib/prismaClient');
    require.cache[path] = {
        id: path,
        filename: path,
        loaded: true,
        exports: { prisma: {} },
    } as NodeModule;
    const {
        executeClusterBulkHandler,
    } = require('../src/modules/clusters/controllers/cluster-bulk.controller');
    let status = 0;
    let response: { message: string } | undefined;
    await executeClusterBulkHandler(
        {},
        {
            status: (value: number) => {
                status = value;
                return {
                    json: (value: { message: string }) => {
                        response = value;
                    },
                };
            },
        },
    );
    assert.equal(status, 410);
    assert.match(response!.message, /server job/);
});
