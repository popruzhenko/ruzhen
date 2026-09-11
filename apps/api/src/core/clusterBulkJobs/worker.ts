import { randomUUID } from 'node:crypto';
import {
    Prisma,
    type PrismaClient,
    type ClusterBulkJob,
    type ClusterBulkJobItem,
} from '@prisma/client';
import { executeClusterBulkItem } from '../clusterBulk/execute';
import type { ClusterBulkExecutionHooks } from '../clusterBulk/executionHooks';
import type { AnalyzedNewsProvider } from '../contextualization/analyzedNewsProvider';
import { finishClusterBulkJob, lockClusterBulkJob } from './jobs';
import {
    CLUSTER_BULK_ACTIVE_KEY,
    CLUSTER_BULK_LEASE_MS,
    ClusterBulkLeaseLost,
} from './types';

export type ClusterBulkClaim = {
    job: ClusterBulkJob;
    item: ClusterBulkJobItem;
    leaseToken: string;
};

export async function claimClusterBulkItem({
    prisma,
    now = () => new Date(),
    leaseMs = CLUSTER_BULK_LEASE_MS,
}: {
    prisma: PrismaClient;
    now?: () => Date;
    leaseMs?: number;
}): Promise<ClusterBulkClaim | null> {
    return prisma.$transaction(
        async (tx) => {
            const candidates = await tx.$queryRaw<
                Array<{ id: string }>
            >(Prisma.sql`
            SELECT "id" FROM "ClusterBulkJob" WHERE "activeKey" = ${CLUSTER_BULK_ACTIVE_KEY}
            FOR UPDATE SKIP LOCKED`);
            if (!candidates.length) return null;
            const currentTime = now();
            let job = await tx.clusterBulkJob.findUnique({
                where: { id: candidates[0].id },
            });
            if (!job?.activeKey) return null;
            const running = await tx.clusterBulkJobItem.findMany({
                where: { jobId: job.id, status: 'RUNNING' },
            });
            for (const item of running) {
                if (item.leaseExpiresAt && item.leaseExpiresAt > currentTime)
                    return null;
                const startedAi =
                    job.action === 'CONTEXTUALIZE' && item.aiStartedAt !== null;
                await tx.clusterBulkJobItem.update({
                    where: { id: item.id },
                    data: {
                        status: startedAi
                            ? 'FAILED'
                            : job.status === 'STOPPING'
                              ? 'CANCELED'
                              : 'PENDING',
                        reason: startedAi
                            ? 'Processing was interrupted after the AI request started. No automatic retry was made. Review the cluster before explicitly retrying.'
                            : job.status === 'STOPPING'
                              ? 'Stopped before processing.'
                              : null,
                        leaseToken: null,
                        leaseExpiresAt: null,
                    },
                });
            }
            if (job.status === 'STOPPING') {
                await tx.clusterBulkJobItem.updateMany({
                    where: { jobId: job.id, status: 'PENDING' },
                    data: {
                        status: 'CANCELED',
                        reason: 'Stopped before processing.',
                    },
                });
                await finishClusterBulkJob(tx, job);
                return null;
            }
            const item = await tx.clusterBulkJobItem.findFirst({
                where: { jobId: job.id, status: 'PENDING' },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            if (!item) {
                await finishClusterBulkJob(tx, job);
                return null;
            }
            const leaseToken = randomUUID();
            const claimed = await tx.clusterBulkJobItem.update({
                where: { id: item.id },
                data: {
                    status: 'RUNNING',
                    leaseToken,
                    leaseExpiresAt: new Date(currentTime.getTime() + leaseMs),
                    attempts: { increment: 1 },
                    reason: null,
                },
            });
            job = await tx.clusterBulkJob.update({
                where: { id: job.id },
                data: { status: 'RUNNING' },
            });
            return { job, item: claimed, leaseToken };
        },
        { timeout: 15000 },
    );
}

export async function renewClusterBulkLease({
    prisma,
    claim,
    now = () => new Date(),
    leaseMs = CLUSTER_BULK_LEASE_MS,
}: {
    prisma: PrismaClient;
    claim: ClusterBulkClaim;
    now?: () => Date;
    leaseMs?: number;
}): Promise<boolean> {
    const currentTime = now();
    const renewed = await prisma.clusterBulkJobItem.updateMany({
        where: {
            id: claim.item.id,
            jobId: claim.job.id,
            status: 'RUNNING',
            leaseToken: claim.leaseToken,
            leaseExpiresAt: { gt: currentTime },
        },
        data: { leaseExpiresAt: new Date(currentTime.getTime() + leaseMs) },
    });
    return renewed.count === 1;
}

async function fence(
    tx: Prisma.TransactionClient,
    claim: ClusterBulkClaim,
    now: Date,
    leaseMs: number,
) {
    const job = await lockClusterBulkJob(tx, claim.job.id);
    if (!job.activeKey) throw new ClusterBulkLeaseLost();
    const owned = await tx.clusterBulkJobItem.updateMany({
        where: {
            id: claim.item.id,
            jobId: job.id,
            status: 'RUNNING',
            leaseToken: claim.leaseToken,
            leaseExpiresAt: { gt: now },
        },
        data: { leaseExpiresAt: new Date(now.getTime() + leaseMs) },
    });
    if (owned.count !== 1) throw new ClusterBulkLeaseLost();
    return job;
}

export async function runClusterBulkWorkerOnce({
    prisma,
    provider,
    now,
    leaseMs = CLUSTER_BULK_LEASE_MS,
    heartbeatMs = 30000,
}: {
    prisma: PrismaClient;
    provider: AnalyzedNewsProvider;
    now?: () => Date;
    leaseMs?: number;
    heartbeatMs?: number;
}) {
    const clock = now ?? (() => new Date());
    const claim = await claimClusterBulkItem({ prisma, now: clock, leaseMs });
    if (!claim) return false;
    const controller = new AbortController();
    let renewing = false;
    const timer = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void renewClusterBulkLease({ prisma, claim, now: clock, leaseMs })
            .then((owned) => {
                if (!owned) controller.abort(new ClusterBulkLeaseLost());
            })
            .catch(() => controller.abort(new ClusterBulkLeaseLost()))
            .finally(() => {
                renewing = false;
            });
    }, heartbeatMs);
    timer.unref();
    const hooks: ClusterBulkExecutionHooks = {
        beforeTransaction: async (tx) => {
            await fence(tx, claim, clock(), leaseMs);
        },
        beforeGenerate: async () => {
            await prisma.$transaction(async (tx) => {
                await fence(tx, claim, clock(), leaseMs);
            });
        },
        onClaim: async (tx, executionRevision) => {
            // Revision consumption and the no-automatic-AI-retry marker commit
            // together, before the provider can receive the first request.
            await tx.clusterBulkJobItem.update({
                where: { id: claim.item.id },
                data: {
                    executionRevision,
                    aiStartedAt: clock(),
                },
            });
        },
        onSuccess: async (tx) => {
            const job = await fence(tx, claim, clock(), leaseMs);
            await tx.clusterBulkJobItem.update({
                where: { id: claim.item.id },
                data: {
                    status: 'SUCCEEDED',
                    reason:
                        claim.job.action === 'CONTEXTUALIZE'
                            ? 'Cluster contextualized. Review the generated material before publishing.'
                            : 'Cluster published.',
                    leaseToken: null,
                    leaseExpiresAt: null,
                },
            });
            await finishClusterBulkJob(tx, job);
        },
    };
    try {
        const result = await executeClusterBulkItem({
            prisma,
            provider,
            action: claim.job.action,
            createdByUserId: claim.job.createdByUserId,
            item: {
                clusterId: claim.item.clusterId,
                humanId: claim.item.humanId,
                title: claim.item.title,
                revision: claim.item.revision,
            },
            hooks,
            signal: controller.signal,
        });
        if (result.outcome !== 'succeeded') {
            try {
                await prisma.$transaction(async (tx) => {
                    const job = await fence(tx, claim, clock(), leaseMs);
                    await tx.clusterBulkJobItem.update({
                        where: { id: claim.item.id },
                        data: {
                            status:
                                result.outcome === 'skipped'
                                    ? 'SKIPPED'
                                    : 'FAILED',
                            reason: result.message,
                            leaseToken: null,
                            leaseExpiresAt: null,
                        },
                    });
                    await finishClusterBulkJob(tx, job);
                });
            } catch (error) {
                if (!(error instanceof ClusterBulkLeaseLost)) throw error;
            }
        }
        return true;
    } finally {
        clearInterval(timer);
    }
}

export function startClusterBulkWorker(input: {
    prisma: PrismaClient;
    provider: AnalyzedNewsProvider;
}) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
        let delay = 2000;
        try {
            if (await runClusterBulkWorkerOnce(input)) delay = 100;
        } catch (error) {
            console.error(
                'Cluster bulk worker failed:',
                error instanceof Error ? error.message : error,
            );
            delay = 30000;
        }
        if (!stopped) {
            timer = setTimeout(() => {
                void tick();
            }, delay);
            timer.unref();
        }
    };
    void tick();
    return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
    };
}
