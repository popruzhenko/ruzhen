import { Prisma, type PrismaClient, type ClusterBulkJob } from '@prisma/client';
import { snapshotClusterBulk } from '../clusterBulk/preview';
import type { ClusterBulkAction } from '../clusterBulk/types';
import {
    CLUSTER_BULK_ACTIVE_KEY,
    ClusterBulkJobError,
    type ClusterBulkJobSummary,
} from './types';

export async function lockClusterBulkJob(
    tx: Prisma.TransactionClient,
    jobId: string,
) {
    await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "ClusterBulkJob" WHERE "id" = ${jobId} FOR UPDATE`,
    );
    const job = await tx.clusterBulkJob.findUnique({ where: { id: jobId } });
    if (!job) throw new ClusterBulkJobError('Cluster bulk job not found.', 404);
    return job;
}

export async function finishClusterBulkJob(
    tx: Prisma.TransactionClient,
    job: ClusterBulkJob,
) {
    const remaining = await tx.clusterBulkJobItem.count({
        where: { jobId: job.id, status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (!remaining && job.activeKey) {
        return tx.clusterBulkJob.update({
            where: { id: job.id },
            data: {
                status:
                    job.status === 'STOPPING' || job.status === 'CANCELED'
                        ? 'CANCELED'
                        : 'COMPLETED',
                activeKey: null,
            },
        });
    }
    return job;
}

export async function clusterBulkJobSummary(
    tx: Prisma.TransactionClient,
    job: ClusterBulkJob,
): Promise<ClusterBulkJobSummary> {
    const groups = await tx.clusterBulkJobItem.groupBy({
        by: ['status'],
        where: { jobId: job.id },
        _count: { _all: true },
    });
    const counts: ClusterBulkJobSummary['counts'] = {
        PENDING: 0,
        RUNNING: 0,
        SUCCEEDED: 0,
        SKIPPED: 0,
        FAILED: 0,
        CANCELED: 0,
    };
    for (const group of groups) counts[group.status] = group._count._all;
    const current = counts.RUNNING
        ? await tx.clusterBulkJobItem.findFirst({
              where: { jobId: job.id, status: 'RUNNING' },
              select: { title: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : null;
    return {
        id: job.id,
        action: job.action,
        status: job.status,
        total: job.total,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        counts,
        currentTitle: current?.title ?? null,
    };
}

export async function startClusterBulkJob({
    prisma,
    action,
    requestId,
    createdByUserId,
    retryOfJobId,
}: {
    prisma: PrismaClient;
    action: ClusterBulkAction;
    requestId: string;
    createdByUserId: string;
    retryOfJobId?: string;
}) {
    return prisma.$transaction(
        async (tx) => {
            // All start requests serialize across processes, including requests that
            // alias the same active job. Item execution only needs the job row lock.
            await tx.$executeRaw(
                Prisma.sql`SELECT pg_advisory_xact_lock(724319, 1)`,
            );
            const previous = await tx.clusterBulkJobRequest.findUnique({
                where: { requestId },
            });
            if (previous) {
                if (
                    previous.action !== action ||
                    previous.createdByUserId !== createdByUserId ||
                    (previous.retryOfJobId ?? null) !== (retryOfJobId ?? null)
                )
                    throw new ClusterBulkJobError(
                        'This request ID was already used for a different cluster bulk request.',
                        409,
                    );
                const job = await lockClusterBulkJob(tx, previous.jobId);
                return {
                    job: await clusterBulkJobSummary(tx, job),
                    reused: true,
                };
            }

            const active = await tx.clusterBulkJob.findUnique({
                where: { activeKey: CLUSTER_BULK_ACTIVE_KEY },
            });
            if (active) {
                const locked = await lockClusterBulkJob(tx, active.id);
                if (locked.activeKey) {
                    if (locked.action !== action)
                        throw new ClusterBulkJobError(
                            `A ${locked.action.toLowerCase()} job is already active. Wait for it to finish or stop it first.`,
                            409,
                        );
                    await tx.clusterBulkJobRequest.create({
                        data: {
                            requestId,
                            jobId: locked.id,
                            action,
                            createdByUserId,
                            retryOfJobId: retryOfJobId ?? null,
                        },
                    });
                    return {
                        job: await clusterBulkJobSummary(tx, locked),
                        reused: true,
                    };
                }
            }

            let retryItems:
                | Array<{ clusterId: string; humanId: string; title: string }>
                | undefined;
            if (retryOfJobId) {
                const source = await tx.clusterBulkJob.findUnique({
                    where: { id: retryOfJobId },
                });
                if (!source)
                    throw new ClusterBulkJobError(
                        'Cluster bulk job not found.',
                        404,
                    );
                if (source.action !== action)
                    throw new ClusterBulkJobError(
                        'Retry action does not match the original job.',
                        409,
                    );
                if (source.activeKey)
                    throw new ClusterBulkJobError(
                        'Wait for the original job to finish before retrying.',
                        409,
                    );
                retryItems = await tx.clusterBulkJobItem.findMany({
                    where: {
                        jobId: source.id,
                        status: { in: ['FAILED', 'CANCELED'] },
                    },
                    select: { clusterId: true, humanId: true, title: true },
                    orderBy: { clusterId: 'asc' },
                });
                if (!retryItems.length)
                    throw new ClusterBulkJobError(
                        'This job has no failed or canceled items to retry.',
                    );
            }
            const snapshot = await snapshotClusterBulk(
                tx,
                action,
                retryItems?.map((item) => item.clusterId),
            );
            const known = new Set(
                [...snapshot.items, ...snapshot.skipped].map(
                    (item) => item.clusterId,
                ),
            );
            for (const item of retryItems ?? []) {
                if (!known.has(item.clusterId))
                    snapshot.skipped.push({
                        ...item,
                        reason: 'Cluster was deleted or is no longer DRAFT or UPDATED.',
                    });
            }
            const job = await tx.clusterBulkJob.create({
                data: {
                    action,
                    createdByUserId,
                    retryOfJobId: retryOfJobId ?? null,
                    activeKey: snapshot.items.length
                        ? CLUSTER_BULK_ACTIVE_KEY
                        : null,
                    status: snapshot.items.length ? 'QUEUED' : 'COMPLETED',
                    total: snapshot.items.length + snapshot.skipped.length,
                },
            });
            const items: Prisma.ClusterBulkJobItemCreateManyInput[] = [
                ...snapshot.items.map((item) => ({
                    ...item,
                    jobId: job.id,
                    status: 'PENDING' as const,
                })),
                ...snapshot.skipped.map((item) => ({
                    ...item,
                    revision: '',
                    jobId: job.id,
                    status: 'SKIPPED' as const,
                })),
            ];
            // Bound parameter counts even for a large backlog.
            for (let offset = 0; offset < items.length; offset += 250)
                await tx.clusterBulkJobItem.createMany({
                    data: items.slice(offset, offset + 250),
                });
            await tx.clusterBulkJobRequest.create({
                data: {
                    requestId,
                    jobId: job.id,
                    action,
                    createdByUserId,
                    retryOfJobId: retryOfJobId ?? null,
                },
            });
            return { job: await clusterBulkJobSummary(tx, job), reused: false };
        },
        { timeout: 30000 },
    );
}

export async function listClusterBulkJobs({
    prisma,
    action,
}: {
    prisma: PrismaClient;
    action?: ClusterBulkAction;
}) {
    return prisma.$transaction(
        async (tx) => {
            const jobs = await tx.clusterBulkJob.findMany({
                where: action ? { action } : {},
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: 20,
            });
            const active = await tx.clusterBulkJob.findUnique({
                where: { activeKey: CLUSTER_BULK_ACTIVE_KEY },
            });
            return {
                jobs: await Promise.all(
                    jobs.map((job) => clusterBulkJobSummary(tx, job)),
                ),
                activeJob: active
                    ? await clusterBulkJobSummary(tx, active)
                    : null,
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function getClusterBulkJob({
    prisma,
    jobId,
    page = 1,
    limit = 50,
}: {
    prisma: PrismaClient;
    jobId: string;
    page?: number;
    limit?: number;
}) {
    return prisma.$transaction(
        async (tx) => {
            const job = await tx.clusterBulkJob.findUnique({
                where: { id: jobId },
            });
            if (!job)
                throw new ClusterBulkJobError(
                    'Cluster bulk job not found.',
                    404,
                );
            const totalPages = Math.max(1, Math.ceil(job.total / limit));
            const currentPage = Math.min(page, totalPages);
            const items = await tx.clusterBulkJobItem.findMany({
                where: { jobId },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                skip: (currentPage - 1) * limit,
                take: limit,
                select: {
                    id: true,
                    clusterId: true,
                    humanId: true,
                    title: true,
                    status: true,
                    reason: true,
                },
            });
            return {
                job: await clusterBulkJobSummary(tx, job),
                items,
                pagination: {
                    page: currentPage,
                    limit,
                    total: job.total,
                    totalPages,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function cancelClusterBulkJob({
    prisma,
    jobId,
}: {
    prisma: PrismaClient;
    jobId: string;
}) {
    return prisma.$transaction(async (tx) => {
        let job = await lockClusterBulkJob(tx, jobId);
        if (job.activeKey) {
            await tx.clusterBulkJobItem.updateMany({
                where: { jobId, status: 'PENDING' },
                data: {
                    status: 'CANCELED',
                    reason: 'Stopped before processing.',
                    leaseToken: null,
                    leaseExpiresAt: null,
                },
            });
            job = await tx.clusterBulkJob.update({
                where: { id: jobId },
                data: { status: 'STOPPING' },
            });
            job = await finishClusterBulkJob(tx, job);
        }
        return { job: await clusterBulkJobSummary(tx, job) };
    });
}
