import { fetchText } from '../shared/fetchText';

export async function fetchRssFeed(feedUrl: string): Promise<string> {
    const text = await fetchText(feedUrl);
    const normalized = text.trimStart().toLowerCase();

    const looksLikeXml =
        normalized.startsWith('<?xml') ||
        normalized.startsWith('<rss') ||
        normalized.startsWith('<feed');

    if (!looksLikeXml) {
        throw new Error(
            `Feed did not return XML/RSS content for URL: ${feedUrl}`,
        );
    }

    return text;
}
