import 'dotenv/config';
import { BlockType, OpinionStance, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { normalize } from 'path';

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
    position: string;
    sourceName?: string;
    authorName?: string;
    stance: string;
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
    authorName?: string;
    stance?: string | null;
};

export async function updateClusterBlock(
    input: UpdateClusterBlockInput,
    blockId: string
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
            authorName: true,
            stance: true,
            createdByUserId: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return blocks;
}
