import "dotenv/config";
import { BlockType, OpinionStance, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if(!connectionString) {
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
    const { clusterId, type, title, content, position, sourceName, authorName, stance, createdByUserId } = input;

    if(!clusterId) {
        throw new Error('Cluster ID is required');
    }

    if(!type) {
        throw new Error('Block type is required');
    }

    if(!content || content.trim().length < 3) {
        throw new Error('Content is required');
    }

    if(typeof position !== 'number' || position < 1) {
        throw new Error('Position must be a positive integer');
    }

    const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
    });

    if(!cluster) {
        throw new Error('Cluster not found');
    }

    const normalizedType = type.toUpperCase() as BlockType;
    
    const allowedTypes = ["FACT", "CONTEXT", "OPINION"];

    if(!allowedTypes.includes(normalizedType)) {
        throw new Error('Invalid block type');
    }

    let normalizedStance: OpinionStance | null = null;

    if(stance) {
        const upperStance = stance.toUpperCase();

        const allowedStances = ["PRO", "CONTRA", "NEUTRAL"];

        if(!allowedStances.includes(upperStance)) {
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

    