import 'dotenv/config';
import { BlockType, OpinionStance, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type CreateClusterBlockInput = {
    clusterId: string;
    type: BlockType;
    title?: string;
    content: string;
    position: number;
    sourceName?: string;
    sourceUrl: string;
    authorName?: string;
    stance: string | null;
    createdByUserId: string;
};

export async function createClusterBlock(input: CreateClusterBlockInput) {
    const {
        clusterId,
        type,
        title,
        content,
        position,
        sourceName,
        sourceUrl,
        authorName,
        stance,
        createdByUserId,
    } = input;

    if (!clusterId) {
        throw new Error('Cluster ID is required');
    }

    if (!type) {
        throw new Error('Block type is required');
    }

    if (!content || content.trim().length < 3) {
        throw new Error('Content is required');
    }

    if (typeof position !== 'number' || position < 1) {
        throw new Error('Position must be a positive integer');
    }

    const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    const normalizedType = type.toUpperCase() as BlockType;

    const allowedTypes = ['FACT', 'CONTEXT', 'OPINION'];

    if (!allowedTypes.includes(normalizedType)) {
        throw new Error('Invalid block type');
    }

    let normalizedStance: OpinionStance | null = null;

    if (stance) {
        const upperStance = stance.toUpperCase();

        const allowedStances = ['PRO', 'CONTRA', 'NEUTRAL'];

        if (!allowedStances.includes(upperStance)) {
            throw new Error('Invalid opinion stance');
        }

        normalizedStance = upperStance as OpinionStance;
    }

    const block = await prisma.clusterBlock.create({
        data: {
            clusterId,
            type: normalizedType,
            title: title?.trim() || null,
            content: content.trim(),
            position,
            sourceName: sourceName?.trim() || null,
            sourceUrl: sourceUrl?.trim() || null,
            authorName: authorName?.trim() || null,
            stance: normalizedStance,
            createdByUserId: createdByUserId,
        },
        select: {
            id: true,
            clusterId: true,
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
    });

    return block;
}

type UpdateClusterBlockInput = {
    title?: string;
    content?: string;
    position?: number;
    sourceName?: string;
    sourceUrl?: string;
    authorName?: string;
    stance?: string | null;
};

export async function updateClusterBlock(
    input: UpdateClusterBlockInput,
    blockId: string,
) {
    const existingBlock = await prisma.clusterBlock.findUnique({
        where: { id: blockId },
        select: { id: true, type: true },
    });

    if (!existingBlock) {
        throw new Error('Cluster block not found');
    }

    let normalizedStance: OpinionStance | null | undefined = undefined;

    if (input.stance !== undefined) {
        if (input.stance === null || input.stance.trim() === '') {
            normalizedStance = null;
        } else {
            const upperStance = input.stance.toUpperCase();
            const allowedStances = ['PRO', 'CONTRA', 'NEUTRAL'];

            if (!allowedStances.includes(upperStance)) {
                throw new Error('Invalid opinion stance');
            }

            normalizedStance = upperStance as OpinionStance;
        }
    }

    if (input.content !== undefined && input.content.trim().length < 3) {
        throw new Error('Content must be at least 3 characters long');
    }

    if (
        input.position !== undefined &&
        (typeof input.position !== 'number' || input.position < 1)
    ) {
        throw new Error('Position must be a positive number');
    }

    const block = await prisma.clusterBlock.update({
        where: { id: blockId },
        data: {
            title:
                input.title !== undefined
                    ? input.title?.trim() || null
                    : undefined,
            content:
                input.content !== undefined ? input.content.trim() : undefined,
            position: input.position,
            sourceName:
                input.sourceName !== undefined
                    ? input.sourceName?.trim() || null
                    : undefined,
            sourceUrl: input.sourceUrl?.trim() || null,
            authorName:
                input.authorName !== undefined
                    ? input.authorName?.trim() || null
                    : undefined,
            stance: normalizedStance,
        },
        select: {
            id: true,
            clusterId: true,
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
    });

    return block;
}

export async function deleteClusterBlock(blockId: string) {
    const existingBlock = await prisma.clusterBlock.findUnique({
        where: { id: blockId },
        select: { id: true },
    });

    if (!existingBlock) {
        throw new Error('Cluster block not found');
    }

    await prisma.clusterBlock.delete({
        where: { id: blockId },
    });
}

export async function getClusterBlockById(blockId: string) {
    const block = await prisma.clusterBlock.findUnique({
        where: { id: blockId },
        select: {
            id: true,
            clusterId: true,
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
    });

    if (!block) {
        throw new Error('Cluster block not found');
    }

    return block;
}

export async function listClusterBlocks(clusterId: string) {
    const blocks = await prisma.clusterBlock.findMany({
        where: { clusterId },
        orderBy: { position: 'asc' },
        select: {
            id: true,
            clusterId: true,
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
    });

    return blocks;
}

interface SaveContextDraftBlockInput {
    type: BlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName?: string | null;
    sourceUrl?: string | null;
    authorName?: string | null;
    stance?: OpinionStance | null;
}

interface SaveContextDraftInput {
    prisma: PrismaClient;
    clusterId: string;
    createdByUserId: string;
    title: string;
    summary: string;
    blocks: SaveContextDraftBlockInput[];
}

const isBlockType = (value: unknown): value is BlockType => {
    return Object.values(BlockType).includes(value as BlockType);
};

const isOpinionStance = (value: unknown): value is OpinionStance => {
    return Object.values(OpinionStance).includes(value as OpinionStance);
};

export async function saveContextDraft({
    prisma,
    clusterId,
    createdByUserId,
    title,
    summary,
    blocks,
}: SaveContextDraftInput) {
    if (!clusterId.trim()) {
        throw new Error('Cluster ID is required');
    }

    if (!title.trim()) {
        throw new Error('Draft title is required');
    }

    if (!Array.isArray(blocks)) {
        throw new Error('Blocks must be an array');
    }

    const normalizedBlocks = blocks.map((block, index) => {
        if (!isBlockType(block.type)) {
            throw new Error(`Invalid block type: ${String(block.type)}`);
        }

        const normalizedStance =
            block.type === BlockType.OPINION
                ? isOpinionStance(block.stance)
                    ? block.stance
                    : OpinionStance.NEUTRAL
                : null;

        return {
            type: block.type,
            title: block.title?.trim() || null,
            content: block.content ?? '',
            position: index + 1,
            sourceName: block.sourceName?.trim() || null,
            sourceUrl: block.sourceUrl?.trim() || null,
            authorName: block.authorName?.trim() || null,
            stance: normalizedStance,
        };
    });

    return prisma.$transaction(async (tx) => {
        const cluster = await tx.cluster.findUnique({
            where: {
                id: clusterId,
            },
            select: {
                id: true,
            },
        });

        if (!cluster) {
            throw new Error('Cluster not found');
        }

        const updatedCluster = await tx.cluster.update({
            where: {
                id: clusterId,
            },
            data: {
                title: title.trim(),
                summary: summary.trim() || null,
            },
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                startDate: true,
                status: true,
                updatedAt: true,
            },
        });

        await tx.clusterBlock.deleteMany({
            where: {
                clusterId,
            },
        });

        const createdBlocks = await Promise.all(
            normalizedBlocks.map((block) =>
                tx.clusterBlock.create({
                    data: {
                        clusterId,
                        type: block.type,
                        title: block.title,
                        content: block.content,
                        position: block.position,
                        sourceName: block.sourceName,
                        sourceUrl: block.sourceUrl,
                        authorName: block.authorName,
                        stance: block.stance,
                        createdByUserId,
                    },
                }),
            ),
        );

        return {
            cluster: updatedCluster,
            blocks: createdBlocks,
        };
    });
}
