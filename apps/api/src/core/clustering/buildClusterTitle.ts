import type { Article } from '@prisma/client';

interface BuildClusterTitleInput {
  articles: Pick<Article, 'title' | 'publishedAt'>[];
}

export function buildClusterTitle(input: BuildClusterTitleInput): string {
  const sortedArticles = [...input.articles].sort((a, b) => {
    const aTime = a.publishedAt ? a.publishedAt.getTime() : 0;
    const bTime = b.publishedAt ? b.publishedAt.getTime() : 0;

    return aTime - bTime;
  });

  const firstTitle = sortedArticles[0]?.title?.trim();

  if (firstTitle && firstTitle.length > 0) {
    return firstTitle.slice(0, 180);
  }

  return 'Untitled cluster';
}