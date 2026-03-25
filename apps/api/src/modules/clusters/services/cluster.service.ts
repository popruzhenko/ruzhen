import 'dotenv/config';
import { PrismaClient, ClusterStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type CreateClusterInput = {
    title: string;
    summary?: string;
    mainCountry: string;
    startDate: string;
    createdByUserId: string;
};

function generateHumanId() {
    const year = new Date().getFullYear();
    const random = Math.floor(100000 + Math.random() * 900000);

    return `RZ-${year}-${random}`;
}

export async function createCluster(input: CreateClusterInput) {
    const { title, summary, mainCountry, startDate, createdByUserId } = input;

    if (!title || title.trim().length === 5) {
        throw new Error(
            'Title is required and must be at least 5 characters long'
        );
    }

    const cluster = await prisma.cluster.create({
        data: {
            humanId: generateHumanId(),
            title: title.trim(),
            summary: summary?.trim() || null,
            mainCountry: mainCountry?.trim() || null,
            startDate: startDate ? new Date(startDate) : null,
            status: ClusterStatus.DRAFT,
            createdByUserId,
        },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            status: true,
            createdByUserId: true,
            publishedAt: true,
            updatedAt: true,
        },
    });

    return cluster;
}

type ListClustersInput = {
    page: number;
    limit: number;
};

export async function getClusterById(id: string) {
    const cluster = await prisma.cluster.findUnique({
        where: { id },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            status: true,
            publishedAt: true,
            createdByUserId: true,
            updatedAt: true,
            createdBy: {
                select: {
                    id: true,
                    email: true,
                    role: true,
                },
            },
            clusterTags: {
                select: {
                    tag: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
            blocks: {
                orderBy: {
                    position: 'asc',
                },
                select: {
                    id: true,
                    type: true,
                    title: true,
                    content: true,
                    position: true,
                    sourceName: true,
                    authorName: true,
                    stance: true,
                    createdAt: true,
                    updatedAt: true,
                },
            },
            articleLinks: {
                select: {
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            url: true,
                            publishedAt: true,
                            source: {
                                select: {
                                    id: true,
                                    name: true,
                                    baseUrl: true,
                                },
                            },
                        },
                    },
                    confidence: true,
                    method: true,
                    isPrimary: true,
                    addedAt: true,
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    return {
        ...cluster,
        tags: cluster.clusterTags.map((item) => item.tag),
        articles: cluster.articleLinks.map((item) => ({
            ...item.article,
            confidence: item.confidence,
            method: item.method,
            isPrimary: item.isPrimary,
            addedAt: item.addedAt,
        })),
    };
}

export async function listClusters(input: ListClustersInput) {
    const { page, limit } = input;

    const skip = (page - 1) * limit;

    const [clusters, total] = await Promise.all([
        prisma.cluster.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            skip,
            take: limit,
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                status: true,
                createdAt: true,
                updatedAt: true,
            },
        }),

        prisma.cluster.count(),
    ]);

    return {
        clusters,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    };
}

export async function updateCluster(
    id: string,
    data: {
        title?: string;
        summary?: string;
        mainCountry?: string;
        status?: ClusterStatus;
    }
) {
    const cluster = await prisma.cluster.update({
        where: { id },
        data,
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return cluster;
}

export async function deleteCluster(id: string) {
    const cluster = await prisma.cluster.delete({
        where: { id },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return cluster;
}
