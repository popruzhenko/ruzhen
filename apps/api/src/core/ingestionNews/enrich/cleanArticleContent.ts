import { JSDOM } from 'jsdom';
import {
    articleTitlesMatch,
    hasArticlePaywallMarker,
    hasArticleTruncationMarker,
} from './articleContentQuality';

const blocks = new Set([
    'P',
    'DIV',
    'ARTICLE',
    'MAIN',
    'SECTION',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'BLOCKQUOTE',
    'LI',
    'UL',
    'OL',
    'PRE',
    'TABLE',
    'TR',
    'FIGCAPTION',
    'FIGURE',
]);

function textFromNode(node: Node): string {
    if (node.nodeType === 3) return node.nodeValue ?? '';
    if (node.nodeType !== 1 && node.nodeType !== 11) return '';
    const element = node as Element;
    if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(element.tagName)) return '';
    if (element.tagName === 'BR') return '\n';
    const content = Array.from(node.childNodes).map(textFromNode).join('');
    return blocks.has(element.tagName) ? `\n\n${content}\n\n` : content;
}

/** Decode markup without losing paragraph boundaries or truncation evidence. */
export function normalizeRetrievedText(value: string): string {
    return textFromNode(JSDOM.fragment(value))
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
const words = (value: string) => value.match(/[\p{L}\p{N}]+/gu) ?? [];
const label = (element: Element) =>
    ['class', 'id', 'data-component', 'data-testid']
        .map((name) => element.getAttribute(name) ?? '')
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .toLowerCase();

export function isHiddenArticleElement(element: Element): boolean {
    for (
        let current: Element | null = element;
        current;
        current = current.parentElement
    ) {
        if (
            current.hasAttribute('hidden') ||
            current.getAttribute('aria-hidden') === 'true' ||
            /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/i.test(
                current.getAttribute('style') ?? '',
            )
        )
            return true;
    }
    return false;
}

const chromeLabel =
    /(?:^|[\s_-])(?:ads?|advert(?:isement|ising)?|ad-slot|ad-container|ad-wrapper|related-(?:content|stories|articles|links)|recommended-stories|recommendations|more-on|newsletter|social-share|share-(?:tools|buttons|links|bar|container|menu)|sharing|cookie-(?:banner|consent)|comments?|outbrain|taboola|recirculation|read-more-links)(?:$|[\s_-])|(?:^|\s)(?:share|social|related|recommended|cookie)(?:$|\s)/i;
const metadataLabel =
    /(?:^|[\s_-])(?:byline|author(?:s|-bio|-info|-name|-details)?|contributor(?:s)?|timestamp|date-published|date-modified|publish-date|modified-date|caption|credits?|source-attribution|article-meta(?:data)?)(?:$|[\s_-])/i;
const month =
    '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const date = `(?:\\d{1,2}\\s+${month}\\s+\\d{4}|${month}\\s+\\d{1,2},?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})`;
const clock =
    '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*(?:am|pm))?(?:\\s*(?:GMT|UTC|BST|EST|EDT|CET|CEST)(?:[+-]\\d{1,2}(?::\\d{2})?)?)?';
const standaloneDate = new RegExp(
    `^(?:(?:Published|Updated|Posted|Last updated)(?:\\s+(?:on|at))?[:\\s]+)?${date}(?:[,\\s|·–-]+(?:at\\s+)?${clock})?$`,
    'i',
);
const standaloneTime = new RegExp(`^\\[?${clock}\\]?$`, 'i');

function isServiceLine(text: string): boolean {
    return (
        /^(?:advertisement|advertising|advert|ad|реклама|publicité|werbung|advertentie|sponsored content|end of (?:list|article)|share(?: this (?:article|story))?|copy link|read more|continue reading|читать далее|listen(?: to (?:this|the) article)?(?:\s*\(\d+\s*mins?\))?|\d+\s*(?:min(?:ute)?s?)\s+read)[\s:!.]*$/iu.test(
            text,
        ) ||
        standaloneTime.test(text) ||
        standaloneDate.test(text) ||
        /^\d+\s+(?:minutes?|hours?|days?|mins?|hrs?)\s+ago$/i.test(text) ||
        /^(?:source|sources|reporting by|additional reporting by|editing by|источник)\s*:\s*[^\n]{1,150}$/iu.test(
            text,
        )
    );
}

function inlineNarrative(element: Element): boolean {
    const paragraph = element.parentElement?.closest('p, li, blockquote');
    if (!paragraph) return false;
    const remainder = compact(paragraph.textContent ?? '').replace(
        compact(element.textContent ?? ''),
        '',
    );
    return (
        /[\p{L}\p{N}]/u.test(remainder) &&
        !/^(?:by|author|published|updated|source|автор|источник)\s*:?$/iu.test(
            compact(remainder),
        )
    );
}

export interface ArticleCleanupOptions {
    title?: string | null;
    authors?: string[];
}

/** Mutates a disposable DOM clone, removing page furniture, never prose substrings. */
export function cleanArticleMarkup(
    root: Element,
    options: ArticleCleanupOptions = {},
) {
    for (const element of Array.from(root.querySelectorAll('*'))) {
        if (!root.contains(element)) continue;
        if (
            isHiddenArticleElement(element) ||
            element.matches(
                'script, style, template, noscript, nav, footer, button, input, select, textarea, iframe, video, audio, svg, figcaption, [role="navigation"], [role="banner"], [role="contentinfo"]',
            ) ||
            chromeLabel.test(label(element))
        ) {
            element.remove();
            continue;
        }
        if (
            !inlineNarrative(element) &&
            (metadataLabel.test(label(element)) ||
                element.matches(
                    '[rel~="author"], [itemprop~="author"], [itemprop~="datePublished"], [itemprop~="dateModified"], time',
                ))
        )
            element.remove();
    }
    // These are narrative nodes left after structural cleanup. Do not let
    // Readability's broad class heuristics (e.g. "share-price") erase them.
    for (const element of Array.from(
        root.querySelectorAll('p, a, time, span'),
    )) {
        const text = compact(element.textContent ?? '');
        const linkLength = Array.from(element.querySelectorAll('a')).reduce(
            (sum, link) => sum + (link.textContent?.length ?? 0),
            0,
        );
        if (
            inlineNarrative(element) ||
            (element.tagName === 'P' &&
                words(text).length >= 20 &&
                /[.!?](?:\s|$)/u.test(text) &&
                linkLength / Math.max(1, text.length) < 0.35)
        ) {
            element.removeAttribute('class');
            element.removeAttribute('id');
            if (element.matches('[rel~="author"]'))
                element.removeAttribute('rel');
            if (element.matches('[itemprop~="author"]'))
                element.removeAttribute('itemprop');
        }
    }
    // Inspect access controls after hidden widgets/recommendations are excluded,
    // but before removing their labels from the article that will be saved.
    const before = normalizeRetrievedText(root.innerHTML);
    const paywall = hasArticlePaywallMarker(before);
    const truncated = hasArticleTruncationMarker(before);
    const title = compact(options.title ?? '');
    const authors = (options.authors ?? []).map(compact).filter(Boolean);
    for (const element of Array.from(
        root.querySelectorAll('p, div, span, h1, h2, h3, li, a, small'),
    )) {
        if (
            !root.contains(element) ||
            element.querySelector('p, div, h1, h2, h3, li')
        )
            continue;
        const text = compact(element.textContent ?? '');
        if (!text || inlineNarrative(element)) continue;
        if (
            (title && text === title) ||
            isServiceLine(text) ||
            /^(?:by|автор)\s*:?$/iu.test(text) ||
            authors.some(
                (author) =>
                    text === author ||
                    text.toLowerCase() === `by ${author}`.toLowerCase(),
            ) ||
            (words(text).length <= 25 && hasArticlePaywallMarker(text))
        )
            element.remove();
    }
    return { paywall, truncated };
}

export function cleanStructuredArticleText(
    value: string,
    options: ArticleCleanupOptions = {},
) {
    const fragment = JSDOM.fragment(value);
    const root = fragment.ownerDocument.createElement('div');
    root.append(fragment);
    const evidence = cleanArticleMarkup(root, options);
    // Plain JSON-LD bodies often separate metadata with newlines rather than tags.
    const normalized = normalizeRetrievedText(root.innerHTML);
    const authors = (options.authors ?? []).map(compact);
    const text = normalized
        .split(/\n+/)
        .filter((line) => {
            const trimmed = compact(line);
            return (
                !isServiceLine(trimmed) &&
                trimmed !== compact(options.title ?? '') &&
                !authors.some(
                    (author) =>
                        trimmed === author ||
                        trimmed.toLowerCase() === `by ${author}`.toLowerCase(),
                ) &&
                !(
                    words(trimmed).length <= 25 &&
                    hasArticlePaywallMarker(trimmed)
                )
            );
        })
        .join('\n\n');
    return { text, ...evidence };
}

/** Prefer a publisher's body container over its surrounding page layout. */
export function findArticleContentRoot(
    document: Document,
    title?: string | null,
): Element | null {
    const eligible = (element: Element) => {
        if (isHiddenArticleElement(element)) return false;
        for (
            let ancestor: Element | null = element;
            ancestor;
            ancestor = ancestor.parentElement
        ) {
            if (
                ancestor.matches('aside, nav, footer, [role="navigation"]') ||
                chromeLabel.test(label(ancestor))
            )
                return false;
        }
        return words(element.textContent ?? '').length >= 5;
    };
    const sortByProse = (elements: Element[]) =>
        elements.sort(
            (left, right) =>
                Array.from(right.querySelectorAll('p')).reduce(
                    (sum, p) => sum + (p.textContent?.length ?? 0),
                    0,
                ) -
                Array.from(left.querySelectorAll('p')).reduce(
                    (sum, p) => sum + (p.textContent?.length ?? 0),
                    0,
                ),
        );
    // A complete article wrapper retains introductions and sibling body sections.
    const articles = sortByProse(
        Array.from(document.querySelectorAll('article')).filter(eligible),
    );
    const localTitle = (element: Element) =>
        element
            .querySelector('h1, [itemprop~="headline"]')
            ?.textContent?.trim();
    if (title) {
        const matched = articles.find((article) => {
            const heading = localTitle(article);
            return heading && articleTitlesMatch(title, heading);
        });
        if (matched) return matched;
        const withoutHeading = articles.find((article) => !localTitle(article));
        if (withoutHeading) return withoutHeading;
    }
    if (articles[0]) return articles[0];
    const bodies = Array.from(
        document.querySelectorAll(
            '[itemprop~="articleBody"], .article-body, .article__body, .article-content, .entry-content, .story-body, .story__body, .wysiwyg',
        ),
    ).filter(eligible);
    if (bodies.length) {
        let ancestor: Element | null = bodies[0];
        while (ancestor && !bodies.every((body) => ancestor!.contains(body)))
            ancestor = ancestor.parentElement;
        if (ancestor) return ancestor;
    }
    return (
        sortByProse(
            Array.from(document.querySelectorAll('main, [role="main"]')).filter(
                eligible,
            ),
        )[0] ?? null
    );
}

/** Readability may discard interleaved widgets; prose must still occur in order. */
export function articleParagraphsBelongToBody(
    text: string,
    body: string,
): boolean {
    const source = compact(body);
    const paragraphs = text
        .split(/\n+/)
        .map(compact)
        .filter((part) => words(part).length >= 5);
    if (!source || !paragraphs.length) return false;
    let offset = 0;
    for (const paragraph of paragraphs) {
        const index = source.indexOf(paragraph, offset);
        if (index < 0) return false;
        offset = index + paragraph.length;
    }
    return true;
}
