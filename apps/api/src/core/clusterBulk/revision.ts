import { createHash } from 'node:crypto';
import { ClusterStatus, Prisma } from '@prisma/client';
import { ClusterBulkConflict, type ClusterBulkItem } from './types';

export const clusterBulkStatuses = [ClusterStatus.DRAFT, ClusterStatus.UPDATED];
export const clusterBulkSelect = {
    id: true,
    humanId: true,
    title: true,
    summary: true,
    mainCountry: true,
    startDate: true,
    status: true,
    publishedAt: true,
    updatedAt: true,
    blocks: {
        orderBy: { id: 'asc' },
        select: {
            id: true,
            type: true,
            title: true,
            content: true,
            position: true,
            sourceName: true,
            sourceUrl: true,
            authorName: true,
            stance: true,
            createdByUserId: true,
            createdAt: true,
            updatedAt: true,
        },
    },
    articleLinks: {
        orderBy: { articleId: 'asc' },
        select: {
            articleId: true,
            addedAt: true,
            isPrimary: true,
            confidence: true,
            method: true,
            addedByUserId: true,
            article: {
                select: {
                    id: true,
                    updatedAt: true,
                    sourceId: true,
                    source: { select: { id: true, name: true } },
                },
            },
        },
    },
} satisfies Prisma.ClusterSelect;

export type ClusterBulkSnapshot = Prisma.ClusterGetPayload<{
    select: typeof clusterBulkSelect;
}>;

export function clusterBulkRevision(cluster: ClusterBulkSnapshot): string {
    // Explicit fields make the fingerprint identical for metadata previews and
    // the generation query, which additionally loads full source article text.
    return createHash('sha256')
        .update(
            JSON.stringify({
                version: 1,
                id: cluster.id,
                humanId: cluster.humanId,
                title: cluster.title,
                summary: cluster.summary,
                mainCountry: cluster.mainCountry,
                startDate: cluster.startDate,
                status: cluster.status,
                publishedAt: cluster.publishedAt,
                updatedAt: cluster.updatedAt,
                blocks: [...cluster.blocks]
                    .sort((a, b) => a.id.localeCompare(b.id))
                    .map((block) => ({
                        id: block.id,
                        type: block.type,
                        title: block.title,
                        content: block.content,
                        position: block.position,
                        sourceName: block.sourceName,
                        sourceUrl: block.sourceUrl,
                        authorName: block.authorName,
                        stance: block.stance,
                        createdByUserId: block.createdByUserId,
                        createdAt: block.createdAt,
                        updatedAt: block.updatedAt,
                    })),
                articles: [...cluster.articleLinks]
                    .sort((a, b) => a.articleId.localeCompare(b.articleId))
                    .map((link) => ({
                        articleId: link.articleId,
                        addedAt: link.addedAt,
                        isPrimary: link.isPrimary,
                        confidence: link.confidence,
                        method: link.method,
                        addedByUserId: link.addedByUserId,
                        updatedAt: link.article.updatedAt,
                        sourceId: link.article.sourceId,
                        source: {
                            id: link.article.source.id,
                            name: link.article.source.name,
                        },
                    })),
            }),
        )
        .digest('hex');
}

export function assertClusterBulkRevision(
    cluster: ClusterBulkSnapshot | null,
    revision: string,
): asserts cluster is ClusterBulkSnapshot {
    if (!cluster) throw new ClusterBulkConflict('Cluster no longer exists.');
    if (
        !clusterBulkStatuses.includes(
            cluster.status as (typeof clusterBulkStatuses)[number],
        )
    )
        throw new ClusterBulkConflict(
            'Cluster is no longer a draft or updated material.',
        );
    if (clusterBulkRevision(cluster) !== revision)
        throw new ClusterBulkConflict(
            'Cluster or its content changed after preview. Review it before trying again.',
        );
}

export function clusterBulkItem(cluster: ClusterBulkSnapshot): ClusterBulkItem {
    return {
        clusterId: cluster.id,
        humanId: cluster.humanId,
        title: cluster.title,
        revision: clusterBulkRevision(cluster),
    };
}

export async function lockClusterBulkState(
    tx: Prisma.TransactionClient,
    clusterId: string,
) {
    // FOR UPDATE also blocks new child rows through their immediate foreign
    // keys. Existing child edits do not touch Cluster.updatedAt, so lock those
    // rows too, then reload and fingerprint them before any overwrite.
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "Cluster" WHERE "id" = ${clusterId} FOR UPDATE
    `);
    if (!rows.length)
        throw new ClusterBulkConflict('Cluster no longer exists.');
    await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "ClusterBlock" WHERE "clusterId" = ${clusterId}
        ORDER BY "id" ASC FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
        SELECT "articleId" FROM "ClusterArticle" WHERE "clusterId" = ${clusterId}
        ORDER BY "articleId" ASC FOR UPDATE
    `);
    await tx.$queryRaw(Prisma.sql`
        SELECT a."id" FROM "Article" a JOIN "ClusterArticle" link ON link."articleId" = a."id"
        WHERE link."clusterId" = ${clusterId} ORDER BY a."id" ASC FOR SHARE OF a
    `);
    await tx.$queryRaw(Prisma.sql`
        SELECT s."id" FROM "Source" s WHERE s."id" IN (
            SELECT a."sourceId" FROM "Article" a JOIN "ClusterArticle" link ON link."articleId" = a."id"
            WHERE link."clusterId" = ${clusterId}
        ) ORDER BY s."id" ASC FOR SHARE OF s
    `);
}
