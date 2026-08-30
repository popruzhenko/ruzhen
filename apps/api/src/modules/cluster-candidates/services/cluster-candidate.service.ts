import {
    ArticleStatus,
    CandidateStatus,
    ClusterArticleMethod,
    ClusterStatus,
} from '@prisma/client';
import { generateClusterHumanId } from '../../../core/clustering/generateClusterHumanId';
import { generateClusterCandidates } from '../../../core/clustering/generateClusterCandidates';
import { prisma } from '../../../shared/lib/prismaClient';

export async function generateClusterCandidateGroups() {
    return generateClusterCandidates({
        prisma,
    });
}

export async function listPendingClusterCandidates() {
    const candidates = await prisma.clusterCandidate.findMany({
        where: {
            status: CandidateStatus.PENDING,
        },
        orderBy: [
            {
                createdAt: 'desc',
            },
        ],
        select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            algorithm: true,
            similarityThreshold: true,
            timeWindowDays: true,
            minClusterSize: true,
            maxClusterSize: true,
            articlesCount: true,
            averageSimilarity: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            updatedAt: true,
            articles: {
                orderBy: {
                    position: 'asc',
                },
                select: {
                    articleId: true,
                    confidence: true,
                    isPrimary: true,
                    position: true,
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            publishedAt: true,
                            createdAt: true,
                            status: true,
                            embedding: true,
                            source: {
                                select: {
                                    id: true,
                                    name: true,
                                    baseUrl: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    return {
        candidates,
    };
}

export async function deleteClusterCandidate(candidateId: string) {
    if (!candidateId.trim()) {
        throw new Error('Candidate ID is required');
    }

    const candidate = await prisma.clusterCandidate.findUnique({
        where: {
            id: candidateId,
        },
        select: {
            id: true,
        },
    });

    if (!candidate) {
        throw new Error('Cluster candidate not found');
    }

    await prisma.clusterCandidate.delete({
        where: {
            id: candidateId,
        },
    });

    return {
        id: candidateId,
    };
}

export async function acceptClusterCandidate(
    candidateId: string,
    reviewedByUserId: string,
) {
    if (!candidateId.trim()) {
        throw new Error('Candidate ID is required');
    }

    const candidate = await prisma.clusterCandidate.findUnique({
        where: {
            id: candidateId,
        },
        select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            startDate: true,
            articles: {
                orderBy: {
                    position: 'asc',
                },
                select: {
                    articleId: true,
                    confidence: true,
                    isPrimary: true,
                    position: true,
                    article: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            },
        },
    });

    if (!candidate) {
        throw new Error('Cluster candidate not found');
    }

    if (candidate.status !== CandidateStatus.PENDING) {
        throw new Error('Only pending cluster candidates can be accepted');
    }

    if (candidate.articles.length === 0) {
        throw new Error('Cluster candidate has no articles');
    }

    const title =
        candidate.title?.trim() ||
        candidate.articles[0]?.article.title?.trim() ||
        'Untitled cluster';

    const acceptedCluster = await prisma.$transaction(async (tx) => {
        const cluster = await tx.cluster.create({
            data: {
                humanId: generateClusterHumanId(Date.now()),
                title: title.slice(0, 180),
                summary: candidate.summary?.trim() || null,
                mainCountry: null,
                startDate: candidate.startDate,
                status: ClusterStatus.DRAFT,
                createdByUserId: reviewedByUserId,
                articleLinks: {
                    create: candidate.articles.map(
                        (candidateArticle, index) => ({
                            articleId: candidateArticle.articleId,
                            addedByUserId: reviewedByUserId,
                            isPrimary:
                                candidateArticle.isPrimary || index === 0,
                            confidence: candidateArticle.confidence,
                            method: ClusterArticleMethod.AUTO,
                        }),
                    ),
                },
            },
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                status: true,
                startDate: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        articleLinks: true,
                    },
                },
            },
        });

        await tx.article.updateMany({
            where: {
                id: {
                    in: candidate.articles.map((article) => article.articleId),
                },
            },
            data: {
                status: ArticleStatus.CLUSTERED,
            },
        });

        await tx.clusterCandidate.update({
            where: {
                id: candidateId,
            },
            data: {
                status: CandidateStatus.ACCEPTED,
                reviewedByUserId,
                reviewedAt: new Date(),
            },
        });

        return cluster;
    });

    return acceptedCluster;
}
