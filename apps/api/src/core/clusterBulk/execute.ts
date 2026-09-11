import { ClusterStatus, Prisma, type PrismaClient } from '@prisma/client';
import type { AnalyzedNewsProvider } from '../contextualization/analyzedNewsProvider';
import { generateAnalyzedNewsForCluster } from '../contextualization/generateAnalyzedNewsForCluster';
import { getClusterPublicationErrors } from '../publication/clusterReadiness';
import type { ClusterBulkExecutionHooks } from './executionHooks';
import {
    assertClusterBulkRevision,
    clusterBulkSelect,
    lockClusterBulkState,
} from './revision';
import {
    ClusterBulkConflict,
    type ClusterBulkAction,
    type ClusterBulkItem,
    type ClusterBulkResult,
} from './types';

function isTransactionConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2034' || error.code === 'P2028') return true;
    if (error.code !== 'P2010') return false;
    const record = (value: unknown): Record<string, unknown> =>
        value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
    const meta = record(error.meta);
    const cause = record(record(meta.driverAdapterError).cause);
    return [meta.code, cause.originalCode, cause.code].some(
        (code) => code === '40P01' || code === '40001',
    );
}

export async function executeClusterBulkItem({
    prisma,
    action,
    item,
    createdByUserId,
    provider,
    hooks,
    signal,
}: {
    prisma: PrismaClient;
    action: ClusterBulkAction;
    item: ClusterBulkItem;
    createdByUserId: string;
    provider: AnalyzedNewsProvider;
    hooks?: ClusterBulkExecutionHooks;
    signal?: AbortSignal;
}): Promise<ClusterBulkResult> {
    try {
        if (action === 'CONTEXTUALIZE') {
            await generateAnalyzedNewsForCluster({
                prisma,
                provider,
                clusterId: item.clusterId,
                createdByUserId,
                replaceExistingBlocks: true,
                expectedRevision: item.revision,
                hooks,
                signal,
            });
        } else {
            await prisma.$transaction(
                async (tx) => {
                    await hooks?.beforeTransaction(tx);
                    await lockClusterBulkState(tx, item.clusterId);
                    const cluster = await tx.cluster.findUnique({
                        where: { id: item.clusterId },
                        select: clusterBulkSelect,
                    });
                    assertClusterBulkRevision(cluster, item.revision);
                    const errors = getClusterPublicationErrors(cluster);
                    if (errors.length)
                        throw new ClusterBulkConflict(errors.join(' '));
                    await tx.cluster.update({
                        where: { id: item.clusterId },
                        data: {
                            status: ClusterStatus.PUBLISHED,
                            publishedAt: new Date(),
                            updatedAt: new Date(
                                Math.max(
                                    Date.now(),
                                    cluster.updatedAt.getTime() + 1,
                                ),
                            ),
                        },
                    });
                    await hooks?.onSuccess(tx);
                },
                { timeout: 15000 },
            );
        }
        return {
            clusterId: item.clusterId,
            outcome: 'succeeded',
            message:
                action === 'CONTEXTUALIZE'
                    ? 'Cluster contextualized. Review the generated material before publishing.'
                    : 'Cluster published.',
        };
    } catch (error) {
        const transactionConflict = isTransactionConflict(error);
        return {
            clusterId: item.clusterId,
            outcome:
                error instanceof ClusterBulkConflict || transactionConflict
                    ? 'skipped'
                    : 'failed',
            message: transactionConflict
                ? 'Cluster was being edited concurrently. Refresh the preview before trying again.'
                : error instanceof Error
                  ? error.message
                  : 'Failed to process cluster.',
        };
    }
}
