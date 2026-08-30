import { collapseWhitespace } from '../shared/collapseWhitespace';
import { stripHtml } from '../shared/stripHtml';

function removeContentNoise(value: string): string {
    return value
        .replace(/\bAdvertisement\b/gi, ' ')
        .replace(/\bRead more\b/gi, ' ')
        .replace(/\bAll rights reserved\b/gi, ' ')
        .replace(/\bSign up\b/gi, ' ');
}

export function normalizeContent(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const withoutHtml = stripHtml(value);
    const withoutNoise = removeContentNoise(withoutHtml);
    const normalized = collapseWhitespace(withoutNoise);

    if (normalized.length < 120) {
        return null;
    }

    return normalized;
}
