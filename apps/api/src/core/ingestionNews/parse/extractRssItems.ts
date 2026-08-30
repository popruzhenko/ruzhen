import type { ParsedFeedItem } from './types';

type XmlValue =
    string | number | boolean | null | undefined | XmlObject | XmlValue[];

interface XmlObject {
    [key: string]: XmlValue;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function isXmlObject(value: unknown): value is XmlObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    if (isXmlObject(value)) {
        const cdata = value.__cdata;
        if (typeof cdata === 'string') {
            const trimmed = cdata.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
    }

    return undefined;
}

function getObject(value: unknown): XmlObject | undefined {
    return isXmlObject(value) ? value : undefined;
}

export function extractRssItems(parsedXml: unknown): ParsedFeedItem[] {
    const root = getObject(parsedXml);
    if (!root) return [];

    const rss = getObject(root.rss);
    const channel = getObject(rss?.channel);
    const feed = getObject(root.feed);

    const channelItems = toArray(channel?.item).filter(isXmlObject);
    const atomEntries = toArray(feed?.entry).filter(isXmlObject);

    if (channelItems.length > 0) {
        return channelItems.map((item) => ({
            title: pickString(item.title),
            link: pickString(item.link),
            pubDate: pickString(item.pubDate),
            isoDate: pickString(item.isoDate),
            content:
                pickString(item['content:encoded']) ?? pickString(item.content),
            summary: pickString(item.description) ?? pickString(item.summary),
            description: pickString(item.description),
            imageUrl:
                pickString(item.enclosure) ??
                pickString(item['media:thumbnail']) ??
                pickString(item['media:content']),
            raw: item,
        }));
    }

    if (atomEntries.length > 0) {
        return atomEntries.map((entry) => {
            const singleLink = getObject(entry.link);

            const arrayLink = Array.isArray(entry.link)
                ? entry.link.find((link): link is XmlObject =>
                      isXmlObject(link),
                  )
                : undefined;

            const linkValue =
                (singleLink && typeof singleLink['@_href'] === 'string'
                    ? singleLink['@_href']
                    : undefined) ??
                (arrayLink && typeof arrayLink['@_href'] === 'string'
                    ? arrayLink['@_href']
                    : undefined);

            return {
                title: pickString(entry.title),
                link: pickString(linkValue),
                pubDate:
                    pickString(entry.published) ?? pickString(entry.updated),
                isoDate:
                    pickString(entry.published) ?? pickString(entry.updated),
                content: pickString(entry.content),
                summary: pickString(entry.summary),
                description: pickString(entry.summary),
                raw: entry,
            };
        });
    }

    return [];
}
