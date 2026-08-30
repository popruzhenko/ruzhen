import type { Article } from '@prisma/client';

interface BuildClusterSummaryInput {
    articles: Pick<Article, 'summary' | 'cleanedAccessibleText' | 'content'>[];
}

function normalizeText(value?: string | null): string {
    return value?.trim() ?? '';
}

export function buildClusterSummary(
    input: BuildClusterSummaryInput,
): string | null {
    for (const article of input.articles) {
        const summary = normalizeText(article.summary);

        if (summary.length >= 40) {
            return summary.slice(0, 500);
        }
    }

    for (const article of input.articles) {
        const cleanedAccessibleText = normalizeText(
            article.cleanedAccessibleText,
        );

        if (cleanedAccessibleText.length >= 80) {
            return cleanedAccessibleText.slice(0, 500);
        }
    }

    for (const article of input.articles) {
        const content = normalizeText(article.content);

        if (content.length >= 80) {
            return content.slice(0, 500);
        }
    }

    return null;
}
