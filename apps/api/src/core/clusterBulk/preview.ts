import { Prisma, type PrismaClient } from '@prisma/client';
import { getClusterPublicationErrors } from '../publication/clusterReadiness';
import {
    clusterBulkItem,
    clusterBulkSelect,
    clusterBulkStatuses,
} from './revision';
import type { ClusterBulkAction, ClusterBulkItem } from './types';

export async function previewClusterBulk({
    prisma,
    action,
}: {
    prisma: PrismaClient;
    action: ClusterBulkAction;
}) {
    return prisma.$transaction((tx) => snapshotClusterBulk(tx, action), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
    });
}

export async function snapshotClusterBulk(
    tx: Prisma.TransactionClient,
    action: ClusterBulkAction,
    clusterIds?: string[],
) {
    const items: ClusterBulkItem[] = [];
    const skipped: Array<
        Omit<ClusterBulkItem, 'revision'> & { reason: string }
    > = [];
    let cursor: string | undefined;
    while (true) {
        const clusters = await tx.cluster.findMany({
            where: {
                status: { in: clusterBulkStatuses },
                ...(clusterIds ? { id: { in: clusterIds } } : {}),
            },
            select: clusterBulkSelect,
            orderBy: { id: 'asc' },
            take: 250,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const cluster of clusters) {
            const reason =
                action === 'CONTEXTUALIZE'
                    ? cluster.articleLinks.length
                        ? ''
                        : 'Cluster does not contain source articles.'
                    : getClusterPublicationErrors(cluster).join(' ');
            if (reason)
                skipped.push({
                    clusterId: cluster.id,
                    humanId: cluster.humanId,
                    title: cluster.title,
                    reason,
                });
            else items.push(clusterBulkItem(cluster));
        }
        if (clusters.length < 250) break;
        cursor = clusters[clusters.length - 1].id;
    }
    return { action, items, skipped };
}
