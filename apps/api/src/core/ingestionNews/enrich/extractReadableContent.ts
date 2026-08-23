import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface ExtractedArticleContent {
    title: string | null;
    content: string | null;
    excerpt: string | null;
    byline: string | null;
    imageUrl: string | null;
    siteName: string | null;
    textContent: string | null;
}

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function extractReadableContent(
    html: string,
    url: string,
): ExtractedArticleContent {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    const article = new Readability(document).parse();

    if (!article) {
        return {
            title: null,
            content: null,
            excerpt: null,
            byline: null,
            imageUrl: null,
            siteName: null,
            textContent: null,
        };
    }

    const imageUrl =
        document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute('content') ??
        document
            .querySelector('meta[name="twitter:image"]')
            ?.getAttribute('content') ??
        null;

    return {
        title: article.title ?? null,
        content: article.content ?? null,
        excerpt: article.excerpt ?? null,
        byline: article.byline ?? null,
        imageUrl,
        siteName: article.siteName ?? null,
        textContent: article.textContent
            ? stripHtml(article.textContent)
            : null,
    };
}
