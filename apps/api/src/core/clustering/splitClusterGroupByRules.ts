import {
  ClusteringArticle,
  ClusterDraft,
  ClusterGroup,
  ClusterRelationDraft,
} from './clustering.types';
import {
  MAX_CLUSTER_ARTICLES,
  CLUSTER_TIME_WINDOW_HOURS,
} from './clustering.constants';

interface SplitClusterGroupByRulesInput {
  group: ClusterGroup;
  articlesMap: Map<string, ClusteringArticle>;
  startClusterIndex: number;
}

interface SplitClusterGroupByRulesResult {
  clusters: ClusterDraft[];
  relations: ClusterRelationDraft[];
}

function getArticleTime(article: ClusteringArticle): number {
  return article.publishedAt ? article.publishedAt.getTime() : 0;
}

function getClusterStartDate(articles: ClusteringArticle[]): Date | null {
  const datedArticles = articles.filter((article) => article.publishedAt);

  if (datedArticles.length === 0) {
    return null;
  }

  return datedArticles.reduce((min, article) => {
    if (!min || !article.publishedAt) {
      return min;
    }

    return article.publishedAt < min ? article.publishedAt : min;
  }, datedArticles[0].publishedAt ?? null);
}

function getClusterEndDate(articles: ClusteringArticle[]): Date | null {
  const datedArticles = articles.filter((article) => article.publishedAt);

  if (datedArticles.length === 0) {
    return null;
  }

  return datedArticles.reduce((max, article) => {
    if (!max || !article.publishedAt) {
      return max;
    }

    return article.publishedAt > max ? article.publishedAt : max;
  }, datedArticles[0].publishedAt ?? null);
}

function isTimeWindowExceeded(
  currentArticles: ClusteringArticle[],
  nextArticle: ClusteringArticle,
): boolean {
  if (!nextArticle.publishedAt || currentArticles.length === 0) {
    return false;
  }

  const currentDatedArticles = currentArticles.filter((article) => article.publishedAt);

  if (currentDatedArticles.length === 0) {
    return false;
  }

  const earliestDate = getClusterStartDate(currentDatedArticles);

  if (!earliestDate) {
    return false;
  }

  const diffMs = nextArticle.publishedAt.getTime() - earliestDate.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours > CLUSTER_TIME_WINDOW_HOURS;
}

export function splitClusterGroupByRules(
  input: SplitClusterGroupByRulesInput,
): SplitClusterGroupByRulesResult {
  const articles = input.group.articleIds
    .map((articleId) => input.articlesMap.get(articleId))
    .filter((article): article is ClusteringArticle => Boolean(article))
    .sort((a, b) => getArticleTime(a) - getArticleTime(b));

  if (articles.length === 0) {
    return {
      clusters: [],
      relations: [],
    };
  }

  const clusters: ClusterDraft[] = [];
  const relations: ClusterRelationDraft[] = [];

  let currentChunk: ClusteringArticle[] = [];

  for (const article of articles) {
    const shouldSplitByCount = currentChunk.length >= MAX_CLUSTER_ARTICLES;
    const shouldSplitByTime = isTimeWindowExceeded(currentChunk, article);

    if ((shouldSplitByCount || shouldSplitByTime) && currentChunk.length > 0) {
      clusters.push({
        articleIds: currentChunk.map((item) => item.id),
        startDate: getClusterStartDate(currentChunk),
        endDate: getClusterEndDate(currentChunk),
      });

      currentChunk = [];
    }

    currentChunk.push(article);
  }

  if (currentChunk.length > 0) {
    clusters.push({
      articleIds: currentChunk.map((item) => item.id),
      startDate: getClusterStartDate(currentChunk),
      endDate: getClusterEndDate(currentChunk),
    });
  }

  for (let i = 1; i < clusters.length; i++) {
    relations.push({
      fromClusterIndex: input.startClusterIndex + i - 1,
      toClusterIndex: input.startClusterIndex + i,
      type: 'CONTINUES',
    });
  }

  return {
    clusters,
    relations,
  };
}