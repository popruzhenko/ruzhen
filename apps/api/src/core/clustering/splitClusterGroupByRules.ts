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

function getArticleDate(article: ClusteringArticle): Date {
    return article.publishedAt ?? article.createdAt;
}

function getArticleTime(article: ClusteringArticle): number {
    return getArticleDate(article).getTime();
}

function getClusterStartDate(articles: ClusteringArticle[]): Date | null {
    if (articles.length === 0) {
        return null;
    }

    return articles.reduce((minDate, article) => {
        const articleDate = getArticleDate(article);

        return articleDate < minDate ? articleDate : minDate;
    }, getArticleDate(articles[0]));
}

function getClusterEndDate(articles: ClusteringArticle[]): Date | null {
    if (articles.length === 0) {
        return null;
    }

    return articles.reduce((maxDate, article) => {
        const articleDate = getArticleDate(article);

        return articleDate > maxDate ? articleDate : maxDate;
    }, getArticleDate(articles[0]));
}

function isTimeWindowExceeded(
    currentArticles: ClusteringArticle[],
    nextArticle: ClusteringArticle,
): boolean {
    if (currentArticles.length === 0) {
        return false;
    }

    const earliestDate = getClusterStartDate(currentArticles);

    if (!earliestDate) {
        return false;
    }

    const diffMs =
        getArticleDate(nextArticle).getTime() - earliestDate.getTime();
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

        if (
            (shouldSplitByCount || shouldSplitByTime) &&
            currentChunk.length > 0
        ) {
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
