import { CandidateStatus } from '@prisma/client';
import { acceptClusterCandidate as acceptCandidate } from '../../../core/clustering/acceptClusterCandidate';
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
    return acceptCandidate({
        prisma,
        candidateId,
        reviewedByUserId,
    });
}
