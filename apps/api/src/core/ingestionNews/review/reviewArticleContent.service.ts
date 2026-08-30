import { ArticleStatus, PrismaClient } from '@prisma/client';
import { detectContentAvailability } from '../../normalize/article/detectContentAvailability';

function normalizeText(value?: string | null): string {
    return value?.trim() ?? '';
}

function getNextReviewStatus(input: {
    title: string | null;
    summary: string | null;
    content: string | null;
    cleanedAccessibleText: string | null;
}): ArticleStatus {
    const title = normalizeText(input.title);
    const summary = normalizeText(input.summary);
    const content = normalizeText(input.content);
    const cleanedAccessibleText = normalizeText(input.cleanedAccessibleText);

    const hasValidTitle = title.length >= 10;
    const hasValidSummary = summary.length >= 40;
    const hasUsableText =
        cleanedAccessibleText.length >= 80 ||
        content.length >= 120 ||
        summary.length >= 80;

    if (hasValidTitle && hasValidSummary && hasUsableText) {
        return ArticleStatus.REVIEWED;
    }

    return ArticleStatus.NEEDS_REVIEW;
}

export async function reviewArticleContentById(
    prisma: PrismaClient,
    articleId: string,
) {
    const article = await prisma.article.findUnique({
        where: {
            id: articleId,
        },
        select: {
            id: true,
            title: true,
            summary: true,
            content: true,
            cleanedAccessibleText: true,
            contentAvailability: true,
            status: true,
        },
    });

    if (!article) {
        throw new Error('Article not found');
    }

    const nextContentAvailability = detectContentAvailability({
        title: article.title,
        summary: article.summary,
        content: article.content,
        cleanedAccessibleText: article.cleanedAccessibleText,
    });

    const nextStatus = getNextReviewStatus({
        title: article.title,
        summary: article.summary,
        content: article.content,
        cleanedAccessibleText: article.cleanedAccessibleText,
    });

    const updatedArticle = await prisma.article.update({
        where: {
            id: article.id,
        },
        data: {
            contentAvailability: nextContentAvailability,
            status: nextStatus,
        },
        include: {
            source: true,
            raw: true,
            _count: {
                select: {
                    clusterLinks: true,
                    clusterCandidateLinks: true,
                },
            },
        },
    });

    return {
        article: updatedArticle,
        review: {
            previousStatus: article.status,
            nextStatus,
            previousContentAvailability: article.contentAvailability,
            nextContentAvailability,
        },
    };
}
