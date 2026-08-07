import { normalizeContent } from './normalizeContent';
import { normalizeImageUrl } from './normalizeImageUrl';
import { normalizeSummary } from './normalizeSummary';
import { normalizeTitle } from './normalizeTitle';

export function normalizeEnrichedFields(input: {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    imageUrl?: string | null;
    url?: string | null;
}) {
    return {
        title: normalizeTitle(input.title),
        summary: normalizeSummary(input.summary),
        content: normalizeContent(input.content),
        imageUrl: normalizeImageUrl(input.imageUrl, input.url),
    };
}
