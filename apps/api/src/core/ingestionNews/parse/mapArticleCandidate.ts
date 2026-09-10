import type {
    ArticleCreateCandidate,
    ParseSourceInput,
    ParsedFeedItem,
    SectionArticleCandidate,
} from './types';
import { assessArticleText } from '../enrich/articleContentQuality';
import { normalizeRetrievedText } from '../enrich/extractReadableContent';

function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseDate(value?: string): Date | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeUrl(value?: string): string | null {
    if (!value) {
        return null;
    }

    try {
        const url = new URL(value.trim());
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

function normalizeText(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

export function mapFeedItemToArticleInput(
    source: ParseSourceInput,
    item: ParsedFeedItem,
): ArticleCreateCandidate | null {
    const url = normalizeUrl(item.link);
    const title = normalizeText(item.title);

    if (!url || !title) {
        return null;
    }

    const summaryRaw = item.summary ?? item.description ?? null;
    const contentRaw = item.content ?? null;

    const strippedSummary = summaryRaw
        ? normalizeText(stripHtml(summaryRaw))
        : null;
    const strippedContent = contentRaw
        ? normalizeRetrievedText(contentRaw) || null
        : null;

    // An access hint must never discard text already supplied by the feed.
    const content = strippedContent;
    const publishedAt = parseDate(item.isoDate ?? item.pubDate);
    const contentAssessment = content
        ? assessArticleText({
              text: content,
              title,
              summary: strippedSummary,
              url,
              publishedAt,
          })
        : null;

    return {
        sourceId: source.id,
        url,
        title,
        summary: strippedSummary,
        content,
        contentAssessment,
        cleanedAccessibleText: null,
        imageUrl: item.imageUrl ?? null,
        publishedAt,
        language: source.language ?? null,
        country: source.country ?? null,
        rawPayload: item.raw,
    };
}

export function mapSectionItemToArticleInput(
    source: ParseSourceInput,
    item: SectionArticleCandidate,
): ArticleCreateCandidate | null {
    const url = normalizeUrl(item.url);
    const title = normalizeText(item.title);

    if (!url || !title) {
        return null;
    }

    const summary = normalizeText(item.summary);

    return {
        sourceId: source.id,
        url,
        title,
        summary,
        content: null,
        cleanedAccessibleText: null,
        imageUrl: item.imageUrl ?? null,
        publishedAt: item.publishedAt ?? null,
        language: source.language ?? null,
        country: source.country ?? null,
        rawPayload: item.raw,
    };
}
