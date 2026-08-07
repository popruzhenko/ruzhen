import type { ArticleCreateCandidate } from '../../ingestionNews/parse/types';
import { normalizeContent } from './normalizeContent';
import { normalizeImageUrl } from './normalizeImageUrl';
import { normalizeSummary } from './normalizeSummary';
import { normalizeTitle } from './normalizeTitle';
import { normalizeUrl } from './normalizeUrl';

export function normalizeArticleCandidate(
    candidate: ArticleCreateCandidate | null,
): ArticleCreateCandidate | null {
    if (!candidate) {
        return null;
    }

    const url = normalizeUrl(candidate.url);
    const title = normalizeTitle(candidate.title);
    const summary = normalizeSummary(candidate.summary);
    const content = normalizeContent(candidate.content);
    const imageUrl = normalizeImageUrl(candidate.imageUrl, candidate.url);

    if (!url || !title) {
        return null;
    }

    return {
        ...candidate,
        url,
        title,
        summary,
        content,
        imageUrl,
    };
}
