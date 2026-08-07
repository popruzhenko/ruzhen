import { Prisma, ArticleStatus, UserRole } from '@prisma/client';
import { buildClusters } from './buildClusters';
import { saveClusters } from './saveClusters';
import type { ClusteringArticle } from './clustering.types';
import { prisma } from '../../shared/lib/prismaClient';

function parseEmbedding(value: Prisma.JsonValue): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const embedding = value.filter((item): item is number => {
    return typeof item === 'number' && Number.isFinite(item);
  });

  if (embedding.length !== value.length || embedding.length === 0) {
    return null;
  }

  return embedding;
}

export async function main(): Promise<void> {
  console.log('--- CLUSTERING START ---');

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    select: { id: true },
  });

  if (!admin) {
    throw new Error('Admin user not found');
  }

  const articles = await prisma.article.findMany({
    where: {
      status: ArticleStatus.EMBEDDED,
      embedding: {
        not: Prisma.JsonNull,
      },
    },
    orderBy: [{ publishedAt: 'asc' }, { createdAt: 'asc' }],
  });

  console.log('articles for clustering:', articles.length);

  const preparedArticles: ClusteringArticle[] = articles
    .map((article) => {
      const embedding = parseEmbedding(article.embedding);

      if (!embedding) {
        return null;
      }

      return {
        id: article.id,
        publishedAt: article.publishedAt,
        embedding,
      };
    })
    .filter((article): article is ClusteringArticle => article !== null);

  console.log('prepared articles:', preparedArticles.length);

  if (preparedArticles.length === 0) {
    return;
  }

  const buildResult = buildClusters(preparedArticles);

  console.log('clusters to save:', buildResult.clusters.length);

  if (buildResult.clusters.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await saveClusters({
      prisma: tx,
      buildResult,
      articles,
      adminUserId: admin.id,
    });
  });

  console.log('--- CLUSTERING DONE ---');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });