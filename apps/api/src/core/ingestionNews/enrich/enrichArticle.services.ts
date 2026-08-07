import type { PrismaClient } from '@prisma/client';
import { fetchText } from '../shared/fetchText';
import { extractReadableContent } from './extractReadableContent';
import { normalizeEnrichedFields } from '../../normalize/article/normalizeEnrichedFields';
import { detectContentAvailability } from '../../normalize/article/detectContentAvailability';
import { cleanAccessibleText } from '../../normalize/article/clean/cleanAccessibleText';
import { OpenAiAccessibleTextCleaner } from '../../normalize/article/clean/openAiAccessibleTextCleaner';

const openAiApiKey = process.env.OPENAI_API_KEY;

const accessibleTextCleaner = openAiApiKey
    ? new OpenAiAccessibleTextCleaner({
          apiKey: openAiApiKey,
          model: process.env.OPENAI_CLEAN_MODEL ?? 'gpt-4o-mini',
      })
    : undefined;

function pickBetterText(
    current: string | null | undefined,
    next: string | null | undefined,
) {
    const currentText = current?.trim() ?? '';
    const nextText = next?.trim() ?? '';

    if (!nextText) {
        return {
            text: currentText || null,
            picked: 'current' as const,
        };
    }

    if (!currentText) {
        return {
            text: nextText,
            picked: 'next' as const,
        };
    }

    if (nextText.length > currentText.length) {
        return {
            text: nextText,
            picked: 'next' as const,
        };
    }

    return {
        text: currentText,
        picked: 'current' as const,
    };
}

export async function enrichArticleById(
    prisma: PrismaClient,
    articleId: string,
) {
    const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
            id: true,
            url: true,
            title: true,
            summary: true,
            content: true,
            cleanedAccessibleText: true,
            imageUrl: true,
            cleaningMethod: true,
            contentAvailability: true,
            source: {
                select: {
                    id: true,
                    name: true,
                    accessMode: true,
                    isActive: true,
                },
            },
        },
    });

    if (!article) {
        throw new Error('Article not found');
    }

    if (!article.source.isActive) {
        return {
            articleId,
            skipped: true,
            reason: 'Source is inactive',
        };
    }

    const html = await fetchText(article.url);
    const extracted = extractReadableContent(html, article.url);

    const normalized = normalizeEnrichedFields({
        title: article.title,
        summary: article.summary ?? extracted.excerpt,
        content: extracted.textContent,
        imageUrl: article.imageUrl ?? extracted.imageUrl,
        url: article.url,
    });

    const isMetadataOnly = article.source.accessMode === 'METADATA_ONLY';

    const nextSummary = article.summary ?? normalized.summary ?? null;
    const nextImageUrl = article.imageUrl ?? normalized.imageUrl ?? null;

    let nextContent = article.content ?? null;
    let nextCleanedAccessibleText = article.cleanedAccessibleText ?? null;
    let nextCleaningMethod = article.cleaningMethod ?? null;

    if (isMetadataOnly) {
        const cleanResult = await cleanAccessibleText(
            {
                title: article.title,
                summary: nextSummary,
                rawAccessibleText:
                    normalized.content ??
                    normalized.summary ??
                    extracted.excerpt ??
                    null,
                sourceName: article.source.name,
                url: article.url,
            },
            accessibleTextCleaner,
        );

        const pickedCleanedText = pickBetterText(
            article.cleanedAccessibleText,
            cleanResult.cleanedText,
        );

        nextCleanedAccessibleText = pickedCleanedText.text;

        nextCleaningMethod =
            pickedCleanedText.picked === 'next'
                ? (cleanResult.cleaningMethod ?? article.cleaningMethod ?? null)
                : (article.cleaningMethod ??
                  cleanResult.cleaningMethod ??
                  null);

        nextContent = article.content ?? null;
    } else {
        nextContent = article.content ?? normalized.content ?? null;
        nextCleanedAccessibleText = article.cleanedAccessibleText ?? null;
        nextCleaningMethod = article.cleaningMethod ?? null;
    }
    const contentAvailability = detectContentAvailability({
        title: article.title,
        summary: nextSummary,
        content: nextContent,
        cleanedAccessibleText: nextCleanedAccessibleText,
    });

    const updatedArticle = await prisma.article.update({
        where: { id: article.id },
        data: {
            summary: nextSummary,
            content: nextContent,
            cleanedAccessibleText: nextCleanedAccessibleText,
            cleaningMethod: nextCleaningMethod,
            imageUrl: nextImageUrl,
            contentAvailability,
        },
        select: {
            id: true,
            url: true,
            title: true,
            summary: true,
            content: true,
            cleanedAccessibleText: true,
            cleaningMethod: true,
            imageUrl: true,
            contentAvailability: true,
            updatedAt: true,
            source: {
                select: {
                    name: true,
                    accessMode: true,
                },
            },
        },
    });

    return {
        article: updatedArticle,
        extracted: {
            title: extracted.title,
            excerpt: extracted.excerpt,
            textContentLength: extracted.textContent?.length ?? 0,
            imageUrl: extracted.imageUrl,
        },
        mode: isMetadataOnly ? 'METADATA_ONLY' : 'FULL_OPEN',
    };
}

export async function enrichLatestArticles(prisma: PrismaClient, limit = 500) {
    const articles = await prisma.article.findMany({
        where: {
            source: {
                isActive: true,
            },
            OR: [
                { content: null },
                { summary: null },
                { imageUrl: null },
                { cleanedAccessibleText: null },
            ],
        },
        orderBy: {
            createdAt: 'desc',
        },
        take: limit,
        select: {
            id: true,
        },
    });

    const results = [];

    for (const article of articles) {
        try {
            const result = await enrichArticleById(prisma, article.id);

            results.push({
                articleId: article.id,
                success: true,
                result,
            });
        } catch (error) {
            results.push({
                articleId: article.id,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return results;
}
