import type { PrismaClient } from '@prisma/client';
import type { ArticleCreateCandidate } from './types';
import { detectContentAvailability } from '../../normalize/article/detectContentAvailability';

interface SaveParsedArticlesResult {
  created: number;
  updated: number;
  skippedDuplicates: number;
  skippedInvalid: number;
}

export async function saveParsedArticles(
  prisma: PrismaClient,
  candidates: Array<ArticleCreateCandidate | null>,
): Promise<SaveParsedArticlesResult> {
  let created = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (const candidate of candidates) {
    if (!candidate) {
      skippedInvalid += 1;
      continue;
    }

    const existing = await prisma.article.findUnique({
      where: { url: candidate.url },
      select: {
        id: true,
        summary: true,
        content: true,
        cleanedAccessibleText: true,
        imageUrl: true,
        publishedAt: true,
      },
    });

    if (!existing) {
      const contentAvailability = detectContentAvailability({
        title: candidate.title,
        summary: candidate.summary,
        content: candidate.content,
        cleanedAccessibleText: candidate.cleanedAccessibleText ?? null,
      });

      const article = await prisma.article.create({
        data: {
          sourceId: candidate.sourceId,
          url: candidate.url,
          title: candidate.title,
          summary: candidate.summary,
          content: candidate.content,
          cleanedAccessibleText: candidate.cleanedAccessibleText ?? null,
          imageUrl: candidate.imageUrl,
          publishedAt: candidate.publishedAt,
          language: candidate.language,
          country: candidate.country,
          contentAvailability,
        },
      });

      if (candidate.rawPayload) {
        await prisma.articleRaw.create({
          data: {
            articleId: article.id,
            rawContent: JSON.stringify(candidate.rawPayload),
            parserVersion: 'politics-v3',
          },
        });
      }

      created += 1;
      continue;
    }

    const nextSummary = existing.summary ?? candidate.summary;
    const nextContent = existing.content ?? candidate.content;
    const nextCleanedAccessibleText =
      existing.cleanedAccessibleText ?? candidate.cleanedAccessibleText ?? null;
    const nextImageUrl = existing.imageUrl ?? candidate.imageUrl;
    const nextPublishedAt = existing.publishedAt ?? candidate.publishedAt;

    const shouldUpdate =
      (!existing.summary && !!candidate.summary) ||
      (!existing.content && !!candidate.content) ||
      (!existing.cleanedAccessibleText &&
        !!candidate.cleanedAccessibleText) ||
      (!existing.imageUrl && !!candidate.imageUrl) ||
      (!existing.publishedAt && !!candidate.publishedAt);

    if (!shouldUpdate) {
      skippedDuplicates += 1;
      continue;
    }

    const contentAvailability = detectContentAvailability({
      title: candidate.title,
      summary: nextSummary,
      content: nextContent,
      cleanedAccessibleText: nextCleanedAccessibleText,
    });

    await prisma.article.update({
      where: { url: candidate.url },
      data: {
        title: candidate.title,
        summary: nextSummary,
        content: nextContent,
        cleanedAccessibleText: nextCleanedAccessibleText,
        imageUrl: nextImageUrl,
        publishedAt: nextPublishedAt,
        language: candidate.language,
        country: candidate.country,
        contentAvailability,
      },
    });

    updated += 1;
  }

  return {
    created,
    updated,
    skippedDuplicates,
    skippedInvalid,
  };
}