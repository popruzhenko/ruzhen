import 'dotenv/config';
import { ClusterArticleMethod } from '@prisma/client';
import { prisma } from '../../../shared/lib/prismaClient';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined');
}

type AddArticleToClusterInput = {
    clusterId: string;
    articleId: string;
    addedByUserId: string;
    isPrimary?: boolean;
    confidence?: number;
};

export async function addArticleToCluster(input: AddArticleToClusterInput) {
    const {
        clusterId,
        articleId,
        addedByUserId,
        isPrimary = false,
        confidence,
    } = input;

    const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: { id: true },
    });

    if (!article) {
        throw new Error('Article not found');
    }

    const existingLink = await prisma.clusterArticle.findUnique({
        where: {
            clusterId_articleId: {
                clusterId,
                articleId,
            },
        },
        select: {
            clusterId: true,
            articleId: true,
        },
    });

    if (existingLink) {
        throw new Error('Article is already linked to this cluster');
    }

    const link = await prisma.clusterArticle.create({
        data: {
            clusterId,
            articleId,
            addedByUserId,
            isPrimary,
            confidence,
            method: ClusterArticleMethod.MANUAL,
        },
        select: {
            clusterId: true,
            articleId: true,
            addedByUserId: true,
            addedAt: true,
            isPrimary: true,
            confidence: true,
            method: true,
        },
    });

    return link;
}

export async function removeArticleFromCluster(
    clusterId: string,
    articleId: string,
) {
    const existingLink = await prisma.clusterArticle.findUnique({
        where: {
            clusterId_articleId: {
                clusterId,
                articleId,
            },
        },
        select: {
            clusterId: true,
            articleId: true,
        },
    });

    if (!existingLink) {
        throw new Error('Cluster article link not found');
    }

    await prisma.clusterArticle.delete({
        where: {
            clusterId_articleId: {
                clusterId,
                articleId,
            },
        },
    });
}

export async function listClusterArticles(clusterId: string) {
    const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: { id: true },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    const links = await prisma.clusterArticle.findMany({
        where: { clusterId },
        orderBy: [{ isPrimary: 'desc' }, { addedAt: 'asc' }],
        select: {
            clusterId: true,
            articleId: true,
            addedAt: true,
            isPrimary: true,
            confidence: true,
            method: true,
            article: {
                select: {
                    id: true,
                    url: true,
                    title: true,
                    summary: true,
                    publishedAt: true,
                    language: true,
                    country: true,
                    status: true,
                    source: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            baseUrl: true,
                            language: true,
                            country: true,
                        },
                    },
                },
            },
        },
    });

    return links;
}
