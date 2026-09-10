import {
    ArticleStatus,
    CandidateStatus,
    ClusterArticleMethod,
    ClusterStatus,
    type PrismaClient,
} from '@prisma/client';
import { generateClusterHumanId } from './generateClusterHumanId';

interface AcceptClusterCandidateInput {
    prisma: PrismaClient;
    candidateId: string;
    reviewedByUserId: string;
}

export async function acceptClusterCandidate({
    prisma,
    candidateId,
    reviewedByUserId,
}: AcceptClusterCandidateInput) {
    if (!candidateId.trim()) {
        throw new Error('Candidate ID is required');
    }

    return prisma.$transaction(async (tx) => {
        // Claim the pending candidate before creating anything. A competing
        // acceptance must wait and recheck the status after this transaction.
        const claimed = await tx.clusterCandidate.updateMany({
            where: {
                id: candidateId,
                status: CandidateStatus.PENDING,
            },
            data: {
                status: CandidateStatus.ACCEPTED,
                reviewedByUserId,
                reviewedAt: new Date(),
            },
        });

        if (claimed.count !== 1) {
            const existingCandidate = await tx.clusterCandidate.findUnique({
                where: { id: candidateId },
                select: { id: true },
            });

            if (!existingCandidate) {
                throw new Error('Cluster candidate not found');
            }

            throw new Error('Only pending cluster candidates can be accepted');
        }

        const candidate = await tx.clusterCandidate.findUnique({
            where: {
                id: candidateId,
            },
            select: {
                id: true,
                title: true,
                summary: true,
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

        if (candidate.articles.length === 0) {
            throw new Error('Cluster candidate has no articles');
        }

        const articleIds = [
            ...new Set(candidate.articles.map((article) => article.articleId)),
        ];
        // A prepared article may also have a suggestion for an existing cluster.
        // Claim all articles before creating links so only one path can use them.
        const claimedArticles = await tx.article.updateMany({
            where: {
                id: { in: articleIds },
                status: {
                    in: [ArticleStatus.APPROVED, ArticleStatus.EMBEDDED],
                },
                clusterLinks: { none: {} },
            },
            data: { status: ArticleStatus.CLUSTERED },
        });
        if (claimedArticles.count !== articleIds.length) {
            throw new Error(
                'Some candidate articles are no longer available for clustering. Generate candidates again.',
            );
        }

        const title =
            candidate.title?.trim() ||
            candidate.articles[0]?.article.title?.trim() ||
            'Untitled cluster';

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

        return cluster;
    });
}
