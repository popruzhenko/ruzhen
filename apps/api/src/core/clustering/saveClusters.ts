import {
  ArticleStatus,
  ClusterArticleMethod,
  ClusterRelationType,
  ClusterStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { Article } from '@prisma/client';
import type { BuildClustersResult } from './clustering.types';
import { generateClusterHumanId } from './generateClusterHumanId';
import { buildClusterTitle } from './buildClusterTitle';
import { buildClusterSummary } from './buildClusterSummary';

interface SaveClustersInput {
  prisma: PrismaClient | Prisma.TransactionClient;
  buildResult: BuildClustersResult;
  articles: Article[];
  adminUserId: string;
}

interface SavedClusterRef {
  id: string;
  index: number;
}

export async function saveClusters(input: SaveClustersInput): Promise<void> {
  const { prisma, buildResult, articles, adminUserId } = input;

  const articleMap = new Map(articles.map((article) => [article.id, article]));
  const savedClusters: SavedClusterRef[] = [];

  for (let i = 0; i < buildResult.clusters.length; i += 1) {
    const clusterDraft = buildResult.clusters[i];

    const clusterArticles = clusterDraft.articleIds
      .map((articleId) => articleMap.get(articleId))
      .filter((article): article is Article => Boolean(article));

    if (clusterArticles.length === 0) {
      continue;
    }

    const mainCountry =
      clusterArticles.find((article) => article.country)?.country ?? null;

    const createdCluster = await prisma.cluster.create({
      data: {
        humanId: generateClusterHumanId(i),
        title: buildClusterTitle({
          articles: clusterArticles.map((article) => ({
            title: article.title,
            publishedAt: article.publishedAt,
          })),
        }),
        summary: buildClusterSummary({
          articles: clusterArticles.map((article) => ({
            summary: article.summary,
            cleanedAccessibleText: article.cleanedAccessibleText,
            content: article.content,
          })),
        }),
        mainCountry,
        startDate: clusterDraft.startDate,
        status: ClusterStatus.DRAFT,
        createdByUserId: adminUserId,
      },
    });

    savedClusters.push({
      id: createdCluster.id,
      index: i,
    });

    for (let articleIndex = 0; articleIndex < clusterArticles.length; articleIndex += 1) {
      const article = clusterArticles[articleIndex];

      await prisma.clusterArticle.create({
        data: {
          clusterId: createdCluster.id,
          articleId: article.id,
          addedByUserId: adminUserId,
          isPrimary: articleIndex === 0,
          method: ClusterArticleMethod.AUTO,
        },
      });

      await prisma.article.update({
        where: {
          id: article.id,
        },
        data: {
          status: ArticleStatus.CLUSTERED,
        },
      });
    }
  }

  const clusterIdByIndex = new Map(
    savedClusters.map((item) => [item.index, item.id]),
  );

  for (const relation of buildResult.relations) {
    const fromClusterId = clusterIdByIndex.get(relation.fromClusterIndex);
    const toClusterId = clusterIdByIndex.get(relation.toClusterIndex);

    if (!fromClusterId || !toClusterId) {
      continue;
    }

    await prisma.clusterRelation.create({
      data: {
        fromClusterId,
        toClusterId,
        type: ClusterRelationType.CONTINUES,
      },
    });
  }
}