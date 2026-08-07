import {
    BlockType,
    OpinionStance,
    PrismaClient,
} from '@prisma/client';
import type { AnalyzedNewsProvider } from './analyzedNewsProvider';
import { buildAnalyzedNewsPrompt } from './buildAnalyzedNewsPrompt';
import { parseAnalyzedNewsResponse } from './parseAnalyzedNewsResponse';
import type {
    AnalyzedNewsSourceArticle,
    GenerateAnalyzedNewsForClusterInput,
    GenerateAnalyzedNewsForClusterResult,
} from './analyzedNews.types';

interface GenerateAnalyzedNewsForClusterServiceInput
    extends GenerateAnalyzedNewsForClusterInput {
    prisma: PrismaClient;
    provider: AnalyzedNewsProvider;
}

function normalizeBlockType(type: BlockType): BlockType {
    return type;
}

function normalizeStance(
    type: BlockType,
    stance: OpinionStance | null,
): OpinionStance | null {
    if (type !== BlockType.OPINION) {
        return null;
    }

    return stance ?? OpinionStance.NEUTRAL;
}

export async function generateAnalyzedNewsForCluster(
    input: GenerateAnalyzedNewsForClusterServiceInput,
): Promise<GenerateAnalyzedNewsForClusterResult> {
    const {
        prisma,
        provider,
        clusterId,
        createdByUserId,
        replaceExistingBlocks = true,
    } = input;

    const cluster = await prisma.cluster.findUnique({
        where: {
            id: clusterId,
        },
        select: {
            id: true,
            humanId: true,
            title: true,
            summary: true,
            mainCountry: true,
            startDate: true,
            articleLinks: {
                orderBy: [
                    {
                        isPrimary: 'desc',
                    },
                    {
                        addedAt: 'asc',
                    },
                ],
                select: {
                    article: {
                        select: {
                            id: true,
                            title: true,
                            summary: true,
                            content: true,
                            cleanedAccessibleText: true,
                            url: true,
                            publishedAt: true,
                            country: true,
                            language: true,
                            source: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!cluster) {
        throw new Error('Cluster not found');
    }

    if (cluster.articleLinks.length === 0) {
        throw new Error('Cluster does not contain source articles');
    }

    const articles: AnalyzedNewsSourceArticle[] = cluster.articleLinks.map(
        (link) => ({
            id: link.article.id,
            title: link.article.title,
            summary: link.article.summary,
            content: link.article.content,
            cleanedAccessibleText: link.article.cleanedAccessibleText,
            url: link.article.url,
            publishedAt: link.article.publishedAt,
            sourceName: link.article.source?.name ?? null,
            sourceUrl: link.article.url,
            country: link.article.country,
            language: link.article.language,
        }),
    );

    const prompt = buildAnalyzedNewsPrompt({
        cluster: {
            id: cluster.id,
            humanId: cluster.humanId,
            title: cluster.title,
            summary: cluster.summary,
            mainCountry: cluster.mainCountry,
            startDate: cluster.startDate,
        },
        articles,
    });

    const rawResponse = await provider.generateAnalyzedNews(prompt);
    const draft = parseAnalyzedNewsResponse(rawResponse);

    const result = await prisma.$transaction(async (tx) => {
        if (replaceExistingBlocks) {
            await tx.clusterBlock.deleteMany({
                where: {
                    clusterId,
                },
            });
        }

        const updatedCluster = await tx.cluster.update({
            where: {
                id: clusterId,
            },
            data: {
                title: draft.title,
                summary: draft.summary,
            },
            select: {
                id: true,
                humanId: true,
                title: true,
                summary: true,
                mainCountry: true,
                startDate: true,
                updatedAt: true,
            },
        });

        for (const block of draft.blocks) {
            const type = normalizeBlockType(block.type);
            const stance = normalizeStance(type, block.stance);

            await tx.clusterBlock.create({
                data: {
                    clusterId,
                    type,
                    title: block.title,
                    content: block.content,
                    position: block.position,
                    sourceName: block.sourceName,
                    sourceUrl: block.sourceUrl,
                    authorName: block.authorName,
                    stance,
                    createdByUserId,
                },
            });
        }

        const createdBlocks = await tx.clusterBlock.findMany({
            where: {
                clusterId,
            },
            orderBy: {
                position: 'asc',
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

        return {
            cluster: updatedCluster,
            blocks: createdBlocks,
        };
    });

    return result;
}