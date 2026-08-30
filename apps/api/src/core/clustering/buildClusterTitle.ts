import type { Article } from '@prisma/client';

interface BuildClusterTitleInput {
    articles: Pick<Article, 'title' | 'publishedAt' | 'createdAt'>[];
}

function getArticleTime(
    article: Pick<Article, 'publishedAt' | 'createdAt'>,
): number {
    return (article.publishedAt ?? article.createdAt).getTime();
}

export function buildClusterTitle(input: BuildClusterTitleInput): string {
    const sortedArticles = [...input.articles].sort((a, b) => {
        return getArticleTime(a) - getArticleTime(b);
    });

    const firstTitle = sortedArticles[0]?.title?.trim();

    if (firstTitle && firstTitle.length > 0) {
        return firstTitle.slice(0, 180);
    }

    return 'Untitled cluster';
}
