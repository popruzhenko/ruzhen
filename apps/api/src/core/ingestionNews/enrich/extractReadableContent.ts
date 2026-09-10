import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import {
    articleTitlesMatch,
    hasArticleTruncationMarker,
    normalizeArticleIdentityUrl,
    type ArticleExtractionMethod,
} from './articleContentQuality';
import {
    articleParagraphsBelongToBody,
    cleanArticleMarkup,
    cleanStructuredArticleText,
    findArticleContentRoot,
    isHiddenArticleElement,
    normalizeRetrievedText,
} from './cleanArticleContent';

export { normalizeRetrievedText } from './cleanArticleContent';

export interface ExtractedArticleContent {
    title: string | null;
    content: string | null;
    excerpt: string | null;
    byline: string | null;
    imageUrl: string | null;
    siteName: string | null;
    textContent: string | null;
}

export interface ExtractedArticleCandidate {
    method: ArticleExtractionMethod;
    text: string;
    title: string | null;
    summary: string | null;
    imageUrl: string | null;
    canonicalUrl: string | null;
    articleUrl: string | null;
    sourceDate: string | null;
    articleBody: boolean;
    linkDensity: number;
    truncated: boolean;
    paywall?: boolean;
    htmlContent?: string | null;
    byline?: string | null;
    siteName?: string | null;
}

export interface ExtractedArticleDocument {
    candidates: ExtractedArticleCandidate[];
    documentComplete: boolean;
    paywall: boolean;
    truncated: boolean;
    reasons: string[];
}

function httpUrl(value: unknown, baseUrl: string): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        const url = new URL(value, baseUrl);
        return url.protocol === 'https:' || url.protocol === 'http:'
            ? url.toString()
            : null;
    } catch {
        return null;
    }
}

function stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function structuredUrl(value: unknown, baseUrl: string): string | null {
    if (typeof value === 'string') return httpUrl(value, baseUrl);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const object = value as Record<string, unknown>;
        return httpUrl(object.url ?? object['@id'], baseUrl);
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const url = structuredUrl(item, baseUrl);
            if (url) return url;
        }
    }
    return null;
}

function articleNodes(
    document: Document,
    reasons: string[],
): Record<string, unknown>[] {
    const articles: Record<string, unknown>[] = [];
    for (const script of Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
    )) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(script.textContent ?? '');
        } catch {
            reasons.push('INVALID_JSON_LD');
            continue;
        }
        const pending: unknown[] = [parsed];
        let visited = 0;
        while (pending.length) {
            if (++visited > 10000) {
                reasons.push('JSON_LD_TOO_COMPLEX');
                break;
            }
            const current = pending.pop();
            if (Array.isArray(current)) {
                pending.push(...current);
            } else if (current && typeof current === 'object') {
                const object = current as Record<string, unknown>;
                const types = Array.isArray(object['@type'])
                    ? object['@type']
                    : [object['@type']];
                if (
                    types.some(
                        (type) =>
                            typeof type === 'string' &&
                            /(?:^|\/)(?:Article|NewsArticle|ReportageNewsArticle|AnalysisNewsArticle|BackgroundNewsArticle|OpinionNewsArticle|BlogPosting)$/i.test(
                                type,
                            ),
                    )
                ) {
                    articles.push(object);
                }
                pending.push(
                    ...Object.values(object).filter(
                        (value) => value && typeof value === 'object',
                    ),
                );
            }
        }
    }
    return articles;
}

export function extractArticleDocument(
    html: string,
    url: string,
): ExtractedArticleDocument {
    // No scripts or external resources are enabled in JSDOM.
    const dom = new JSDOM(html, { url });
    try {
        const document = dom.window.document;
        const reasons: string[] = [];
        const candidates: ExtractedArticleCandidate[] = [];
        const metadata = (selector: string) =>
            document.querySelector(selector)?.getAttribute('content')?.trim() ||
            null;
        const canonicalUrl = httpUrl(
            document
                .querySelector('link[rel~="canonical"]')
                ?.getAttribute('href'),
            url,
        );
        const sourceTitle =
            metadata('meta[property="og:title"]') ??
            document.querySelector('h1')?.textContent?.trim() ??
            document.title;
        const summary =
            metadata('meta[property="og:description"]') ??
            metadata('meta[name="description"]');
        const sourceDate =
            metadata('meta[property="article:published_time"]') ??
            metadata('meta[itemprop="datePublished"]') ??
            document
                .querySelector('time[itemprop="datePublished"]')
                ?.getAttribute('datetime') ??
            null;
        const imageUrl = httpUrl(
            metadata('meta[property="og:image"]') ??
                metadata('meta[name="twitter:image"]'),
            url,
        );
        const nodes = articleNodes(document, reasons);
        const primaryNodes = nodes.filter((node) => {
            const embeddedUrl = structuredUrl(
                node.url ?? node.mainEntityOfPage,
                url,
            );
            const headline = stringValue(node.headline);
            return (
                (!embeddedUrl ||
                    normalizeArticleIdentityUrl(embeddedUrl) ===
                        normalizeArticleIdentityUrl(canonicalUrl ?? url) ||
                    normalizeArticleIdentityUrl(embeddedUrl) ===
                        normalizeArticleIdentityUrl(url)) &&
                (!headline ||
                    !sourceTitle ||
                    articleTitlesMatch(sourceTitle, headline))
            );
        });
        const primarySourceDate =
            sourceDate ?? stringValue(primaryNodes[0]?.datePublished);
        const authorNames = (value: unknown): string[] => {
            if (typeof value === 'string') return [value];
            if (Array.isArray(value)) return value.flatMap(authorNames);
            if (value && typeof value === 'object') {
                const name = stringValue(
                    (value as Record<string, unknown>).name,
                );
                return name ? [name] : [];
            }
            return [];
        };
        const cleanupOptions = {
            title: sourceTitle,
            authors: [
                ...primaryNodes.flatMap((node) => authorNames(node.author)),
                ...authorNames(metadata('meta[name="author"]')),
            ],
        };
        const visibleAccessNotice = Array.from(
            document.querySelectorAll(
                '[class*="paywall"], [id*="paywall"], [class*="subscription-wall"], [class*="registration-wall"]',
            ),
        ).some(
            (element) =>
                !isHiddenArticleElement(element) &&
                (element.textContent?.trim().length ?? 0) > 0,
        );
        const paywall =
            visibleAccessNotice ||
            primaryNodes.some(
                (node) =>
                    node.isAccessibleForFree === false ||
                    node.isAccessibleForFree === 'false',
            );
        // A fully received response can still be a cut-off HTML document. Do not
        // let the DOM parser's automatic repair certify those pages as complete.
        const documentComplete =
            /<html(?:\s|>)/i.test(html) &&
            /<\/html\s*>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html) &&
            (!/<body(?:\s|>)/i.test(html) || /<\/body\s*>/i.test(html)) &&
            (html.match(/<script(?:\s|>)/gi)?.length ?? 0) ===
                (html.match(/<\/script\s*>/gi)?.length ?? 0);
        if (!documentComplete) reasons.push('INCOMPLETE_HTML_DOCUMENT');

        for (const node of nodes) {
            if (
                typeof node.articleBody !== 'string' ||
                !node.articleBody.trim()
            )
                continue;
            const cleaned = cleanStructuredArticleText(node.articleBody, {
                ...cleanupOptions,
                authors: authorNames(node.author),
                title: stringValue(node.headline) ?? sourceTitle,
            });
            const text = cleaned.text;
            if (!text) continue;
            candidates.push({
                method: 'JSON_LD',
                text,
                title: stringValue(node.headline) ?? sourceTitle,
                summary: stringValue(node.description) ?? summary,
                imageUrl: structuredUrl(node.image, url) ?? imageUrl,
                canonicalUrl,
                articleUrl: structuredUrl(
                    node.url ?? node.mainEntityOfPage,
                    url,
                ),
                sourceDate: stringValue(node.datePublished) ?? sourceDate,
                articleBody: true,
                linkDensity: 0,
                truncated:
                    cleaned.truncated || hasArticleTruncationMarker(text),
                paywall: cleaned.paywall,
            });
        }

        const readableDocument = document.cloneNode(true) as Document;
        const semanticBody = findArticleContentRoot(
            readableDocument,
            sourceTitle,
        );
        const bodyTitle = semanticBody
            ?.querySelector('h1, [itemprop~="headline"]')
            ?.textContent?.trim();
        const bodyTitleConflict = Boolean(
            bodyTitle &&
            sourceTitle &&
            !articleTitlesMatch(sourceTitle, bodyTitle),
        );
        if (bodyTitleConflict) reasons.push('TITLE_MISMATCH');
        const cleanupEvidence = cleanArticleMarkup(
            semanticBody ?? readableDocument.body,
            cleanupOptions,
        );
        const semanticText = semanticBody
            ? normalizeRetrievedText(semanticBody.innerHTML)
            : '';
        // Keep metadata in the head, but keep recommendations and standfirsts
        // outside the actual publisher body out of Readability's input.
        if (semanticBody && semanticBody !== readableDocument.body)
            readableDocument.body.replaceChildren(semanticBody);
        const article = new Readability(readableDocument, {
            charThreshold: 0,
        }).parse();
        if (article?.content && !bodyTitleConflict) {
            const contentDom = JSDOM.fragment(article.content);
            const contentRoot = document.createElement('div');
            contentRoot.append(contentDom);
            cleanArticleMarkup(contentRoot, {
                ...cleanupOptions,
                authors: [
                    ...cleanupOptions.authors,
                    ...authorNames(article.byline),
                ],
            });
            const text = normalizeRetrievedText(contentRoot.innerHTML);
            const linkTextLength = Array.from(
                contentRoot.querySelectorAll('a'),
            ).reduce(
                (count, link) => count + (link.textContent?.trim().length ?? 0),
                0,
            );
            const hasSemanticBody = articleParagraphsBelongToBody(
                text,
                semanticText,
            );
            candidates.push({
                method: 'READABILITY',
                text,
                title: bodyTitle || sourceTitle || article.title || null,
                summary: summary ?? article.excerpt ?? null,
                imageUrl,
                canonicalUrl,
                articleUrl: structuredUrl(
                    primaryNodes[0]?.url ?? primaryNodes[0]?.mainEntityOfPage,
                    url,
                ),
                sourceDate: primarySourceDate,
                articleBody:
                    hasSemanticBody ||
                    (!!primarySourceDate &&
                        text.split(/\n+/).filter(Boolean).length >= 2),
                linkDensity: text.length ? linkTextLength / text.length : 0,
                truncated:
                    cleanupEvidence.truncated ||
                    hasArticleTruncationMarker(text),
                paywall: cleanupEvidence.paywall,
                htmlContent: contentRoot.innerHTML,
                byline: article.byline ?? null,
                siteName: article.siteName ?? null,
            });
        }
        if (candidates.length === 0) reasons.push('NO_ARTICLE_BODY_FOUND');
        return {
            candidates,
            documentComplete,
            paywall,
            truncated: !documentComplete,
            reasons,
        };
    } finally {
        dom.window.close();
    }
}

// Keep the original synchronous interface for ingestion callers while they
// migrate to retrieveArticleContent and its assessment-bound result.
export function extractReadableContent(
    html: string,
    url: string,
): ExtractedArticleContent {
    const article = extractArticleDocument(html, url).candidates.find(
        (candidate) => candidate.method === 'READABILITY',
    );
    return {
        title: article?.title ?? null,
        content: article?.htmlContent ?? null,
        excerpt: article?.summary ?? null,
        byline: article?.byline ?? null,
        imageUrl: article?.imageUrl ?? null,
        siteName: article?.siteName ?? null,
        textContent: article?.text ?? null,
    };
}
