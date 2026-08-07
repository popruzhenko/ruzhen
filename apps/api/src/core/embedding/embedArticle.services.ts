import type { PrismaClient } from '@prisma/client';
import { ArticleStatus, Prisma } from '@prisma/client';
import { buildEmbeddingText } from './buildEmbeddingText';
import type { EmbeddingProvider } from './embeddingProvider';


type EmbedArticleResult =
  | {
      articleId: string;
      embedded: true;
      dimensions: number;
      textLength: number;
      hasTitle: boolean;
      hasSummary: boolean;
      hasContent: boolean;
      hasCleanedAccessibleText: boolean;
      embeddingBasis: string;
    }
  | {
      articleId: string;
      embedded: false;
      reason: string;
      textLength: number;
      hasTitle: boolean;
      hasSummary: boolean;
      hasContent: boolean;
      hasCleanedAccessibleText: boolean;
      embeddingBasis: string | null;
    };

export async function embedArticleById(
  prisma: PrismaClient,
  provider: EmbeddingProvider,
  articleId: string,
): Promise<EmbedArticleResult> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      summary: true,
      content: true,
      cleanedAccessibleText: true,
      embedding: true,
      status: true,
      source: {
        select: {
          isActive: true,
        },
      },
    },
  });

  if (!article) {
    throw new Error('Article not found');
  }

  const hasTitle = Boolean(article.title?.trim());
  const hasSummary = Boolean(article.summary?.trim());
  const hasContent = Boolean(article.content?.trim());
  const hasCleanedAccessibleText = Boolean(
    article.cleanedAccessibleText?.trim(),
  );

  if (!article.source.isActive) {
    return {
      articleId,
      embedded: false,
      reason: 'Source is inactive',
      textLength: 0,
      hasTitle,
      hasSummary,
      hasContent,
      hasCleanedAccessibleText,
      embeddingBasis: null,
    };
  }

  const buildResult = buildEmbeddingText({
    title: article.title,
    summary: article.summary,
    content: article.content,
    cleanedAccessibleText: article.cleanedAccessibleText,
  });

  if (!buildResult.text || !buildResult.embeddingBasis) {
    return {
      articleId,
      embedded: false,
      reason: 'Not enough text for embedding',
      textLength: 0,
      hasTitle,
      hasSummary,
      hasContent,
      hasCleanedAccessibleText,
      embeddingBasis: null,
    };
  }

  const vector = await provider.createEmbedding(buildResult.text);

  await prisma.article.update({
    where: { id: article.id },
    data: {
      embedding: vector,
      embeddingBasis: buildResult.embeddingBasis,
      embeddingModel: 'text-embedding-3-small',
      status: ArticleStatus.EMBEDDED,
    },
  });

  return {
    articleId,
    embedded: true,
    dimensions: vector.length,
    textLength: buildResult.text.length,
    hasTitle,
    hasSummary,
    hasContent,
    hasCleanedAccessibleText,
    embeddingBasis: buildResult.embeddingBasis,
  };
}

export async function embedApprovedArticlesWithoutEmbedding(
  prisma: PrismaClient,
  provider: EmbeddingProvider,
  limit = 9999,
) {
  const articles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.APPROVED,
      embedding: {
        equals: Prisma.AnyNull,
      },
      source: {
        isActive: true,
      },
      OR: [
        { content: { not: null } },
        { cleanedAccessibleText: { not: null } },
        { summary: { not: null } },
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

  const results: Array<
    | ({
        success: true;
      } & EmbedArticleResult)
    | {
        articleId: string;
        success: false;
        error: string;
      }
  > = [];

  for (const article of articles) {
    try {
      const result = await embedArticleById(prisma, provider, article.id);

      results.push({
        success: true,
        ...result,
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