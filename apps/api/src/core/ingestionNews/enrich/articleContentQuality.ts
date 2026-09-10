import { createHash } from 'node:crypto';

export type ArticleExtractionMethod = 'READABILITY' | 'JSON_LD';

export type ArticleContentAssessment = {
    version: 1;
    textHash: string;
    fullText: boolean;
    qualityScore: number;
    reasons: string[];
    method: ArticleExtractionMethod | 'EXISTING' | 'MANUAL';
    sourceUrl: string | null;
    sourceDate: string | null;
    signals: {
        documentComplete: boolean;
        identityMatched: boolean;
        titleMatched: boolean | null;
        dateMatched: boolean | null;
        paywall: boolean;
        truncated: boolean;
        paragraphs: number;
        sentences: number;
        wordCount: number;
    };
};

export interface ArticleTextEvidence {
    method: ArticleExtractionMethod;
    sourceUrl: string;
    canonicalUrl?: string | null;
    articleUrl?: string | null;
    sourceTitle?: string | null;
    sourceDate?: string | null;
    documentComplete: boolean;
    articleBody: boolean;
    paywall?: boolean;
    truncated?: boolean;
    linkDensity?: number;
}

export interface AssessArticleTextInput {
    text: string;
    title?: string | null;
    summary?: string | null;
    url?: string | null;
    publishedAt?: string | Date | null;
    evidence?: ArticleTextEvidence;
}

export function getArticleTextHash(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

const normalizedWords = (text: string) =>
    text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

const normalizedText = (text: string) => normalizedWords(text).join(' ');

export function articleTitlesMatch(expected: string, actual: string): boolean {
    const left = normalizedText(expected);
    const right = normalizedText(actual);
    if (!left || !right) return false;
    if (left === right || (left.length >= 15 && right.includes(left)))
        return true;
    const expectedWords = new Set(
        normalizedWords(expected).filter((word) => word.length > 2),
    );
    const actualWords = new Set(
        normalizedWords(actual).filter((word) => word.length > 2),
    );
    if (expectedWords.size < 3 || actualWords.size < 3) return false;
    const common = [...expectedWords].filter((word) =>
        actualWords.has(word),
    ).length;
    return (
        common / expectedWords.size >= 0.7 && common / actualWords.size >= 0.45
    );
}

export function normalizeArticleIdentityUrl(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        url.hash = '';
        url.protocol = 'https:';
        url.hostname = url.hostname.replace(/^www\./i, '');
        for (const name of [...url.searchParams.keys()]) {
            if (
                /^(utm_.+|at_(?:medium|campaign|campaign_type|link_type|link_id|link_origin|format|ptr_name|bbc_team)|fbclid|gclid|dclid|mc_cid|mc_eid|amp)$/i.test(
                    name,
                )
            ) {
                url.searchParams.delete(name);
            }
        }
        url.searchParams.sort();
        url.pathname =
            url.pathname.replace(/\/amp\/?$/i, '').replace(/\/+$/, '') || '/';
        return url.toString();
    } catch {
        return null;
    }
}

const PAYWALL_PATTERNS = [
    /\b(?:subscribe|sign\s+in|log\s+in|register|subscription\s+required)\b.{0,90}\b(?:to\s+(?:continue|keep)\s+reading|to\s+read|full\s+(?:article|story)|rest\s+of\s+(?:the\s+)?(?:article|story)|unlock)\b/iu,
    /\b(?:continue\s+reading|read\s+the\s+full\s+(?:article|story)|unlock\s+(?:this|the)\s+(?:article|story))\b.{0,90}\b(?:subscrib|subscription|sign\s+in|log\s+in|register)/iu,
    /^(?:(?:subscriber[- ]only|subscribers\s+only|premium\s+subscribers)(?:\s+(?:content|article|story))?|subscription\s+required)[\s.!:]*$/iu,
    /^you(?:'|’)ve\s+reached\s+your\s+(?:free\s+)?article\s+limit\b/iu,
    /(?:подпишитесь|оформите\s+подписку|войдите).{0,90}(?:читать|продолжить\s+чтение|полную\s+статью)/iu,
    /(?:pour\s+(?:lire\s+la\s+suite|continuer\s+la\s+lecture)|r[ée]serv[ée]\s+aux\s+abonn[ée]s|abonnez-vous\s+pour\s+lire)/iu,
    /(?:abonneer\s+om\s+verder\s+te\s+lezen|alleen\s+voor\s+abonnees|um\s+weiterzulesen|nur\s+f[üu]r\s+abonnenten)/iu,
];

export function hasArticlePaywallMarker(text: string): boolean {
    return text.split(/\n+/).some((line) => {
        const compact = line.replace(/\s+/g, ' ').trim();
        return PAYWALL_PATTERNS.some((pattern) => pattern.test(compact));
    });
}

const endsSentence = (text: string) => /[.!?。！？][\s"'”’»\])}]*$/u.test(text);
const endsTruncated = (text: string) =>
    /(?:\.{3}|…|\[\s*(?:\.\.\.|…|read more)\s*\])[\s"'”’»\])}]*$/iu.test(text);

export function hasArticleTruncationMarker(text: string): boolean {
    return (
        endsTruncated(text.trim()) ||
        /(?:\b(?:read\s+more|continue\s+reading|read\s+(?:the\s+)?full\s+(?:article|story)|to\s+be\s+continued|lire\s+la\s+suite|lees\s+verder|weiterlesen)\b|читать\s+далее|продолжение\s+(?:следует|статьи))[\s.!?…:»”'"\])}]*$/iu.test(
            text.trim(),
        )
    );
}

export function assessArticleText(
    input: AssessArticleTextInput,
): ArticleContentAssessment {
    const { evidence } = input;
    const text = input.text.trim();
    const words = normalizedWords(text);
    const paragraphs = text
        .split(/\n\s*\n|\r?\n/)
        .map((part) => part.trim())
        .filter(Boolean);
    const sentences = text
        .split(/(?<=[.!?。！？])(?:["'”’»\])}]*\s+|$)/u)
        .map((part) => part.trim())
        .filter(Boolean);
    const sentenceCount = (
        text.match(/[.!?。！？](?:["'”’»\])}]*)(?=\s|$)/gu) ?? []
    ).length;
    const titleMatched = input.title?.trim()
        ? evidence?.sourceTitle?.trim()
            ? articleTitlesMatch(input.title, evidence.sourceTitle)
            : false
        : null;
    const expectedUrl = input.url
        ? normalizeArticleIdentityUrl(input.url)
        : null;
    const sourceUrl = evidence?.sourceUrl
        ? normalizeArticleIdentityUrl(evidence.sourceUrl)
        : null;
    const canonicalUrl = evidence?.canonicalUrl
        ? normalizeArticleIdentityUrl(evidence.canonicalUrl)
        : null;
    const embeddedArticleUrl = evidence?.articleUrl
        ? normalizeArticleIdentityUrl(evidence.articleUrl)
        : null;
    const urlMatched =
        !!expectedUrl &&
        (expectedUrl === sourceUrl || expectedUrl === canonicalUrl);
    // Syndicated articles can name the original publisher as canonical while
    // their Article.mainEntityOfPage explicitly identifies this received page.
    const syndicatedIdentity =
        !!expectedUrl &&
        !!canonicalUrl &&
        sourceUrl === expectedUrl &&
        embeddedArticleUrl === expectedUrl &&
        titleMatched === true &&
        new URL(canonicalUrl).hostname !== new URL(expectedUrl).hostname;
    const canonicalConflict =
        (!!evidence?.canonicalUrl &&
            canonicalUrl !== expectedUrl &&
            !syndicatedIdentity) ||
        (!!evidence?.articleUrl && embeddedArticleUrl !== expectedUrl);
    const identityMatched =
        urlMatched && !canonicalConflict && titleMatched !== false;
    const expectedDate = input.publishedAt
        ? new Date(input.publishedAt).getTime()
        : Number.NaN;
    const sourceDate = evidence?.sourceDate
        ? new Date(evidence.sourceDate).getTime()
        : Number.NaN;
    const dateMatched =
        Number.isFinite(expectedDate) && Number.isFinite(sourceDate)
            ? Math.abs(sourceDate - expectedDate) <= 48 * 60 * 60 * 1000
            : null;
    const paywall = !!evidence?.paywall || hasArticlePaywallMarker(text);
    const bodyParagraphs = paragraphs.filter(
        (part) => normalizedWords(part).length >= 9,
    );
    const unclosedParagraphs = bodyParagraphs.filter(
        (part) => !endsSentence(part),
    );
    const truncated =
        !!evidence?.truncated ||
        hasArticleTruncationMarker(text) ||
        (!!text && !endsSentence(text)) ||
        (bodyParagraphs.length > 1 &&
            unclosedParagraphs.length / bodyParagraphs.length > 0.4);
    const reasons: string[] = [];
    if (!evidence?.articleBody) reasons.push('UNVERIFIED_ARTICLE_BODY');
    if (!evidence?.documentComplete) reasons.push('INCOMPLETE_DOCUMENT');
    if (!identityMatched) reasons.push('ARTICLE_IDENTITY_UNCONFIRMED');
    if (titleMatched === false) reasons.push('TITLE_MISMATCH');
    if (dateMatched === false) reasons.push('PUBLICATION_DATE_MISMATCH');
    if (evidence?.sourceDate && !Number.isFinite(sourceDate))
        reasons.push('INVALID_PUBLICATION_DATE');
    if (paywall) reasons.push('PAYWALL_OR_ACCESS_NOTICE');
    if (truncated) reasons.push('INCOMPLETE_SENTENCE_OR_TRAILER');
    if (words.length < 35 || sentenceCount < 2)
        reasons.push('TOO_LITTLE_ARTICLE_TEXT');
    const summary = normalizedText(input.summary ?? '');
    const body = normalizedText(text);
    if (
        summary &&
        (body === summary || (summary.includes(body) && body.length > 0))
    ) {
        reasons.push('SUMMARY_ONLY_TEXT');
    }
    const navigationMatches =
        text.match(
            /\b(?:privacy policy|cookie settings|terms of (?:use|service)|all rights reserved|sign in|log in|menu|latest news|back to top)\b/giu,
        ) ?? [];
    if ((evidence?.linkDensity ?? 0) > 0.35 || navigationMatches.length >= 4) {
        reasons.push('NAVIGATION_OR_BOILERPLATE');
    }
    if (
        sentences.length >= 5 &&
        new Set(sentences.map(normalizedText)).size / sentences.length < 0.55
    ) {
        reasons.push('REPEATED_OR_BOILERPLATE_TEXT');
    }
    const documentComplete = evidence?.documentComplete === true;
    const baseScore =
        Math.min(30, words.length / 5) +
        Math.min(15, sentenceCount * 3) +
        (identityMatched ? 20 : 0) +
        (documentComplete ? 15 : 0) +
        (evidence?.articleBody ? 15 : 0) +
        (paragraphs.length >= 2 ? 5 : 0);
    const qualityScore = Math.max(
        0,
        Math.round(baseScore - reasons.length * 8),
    );
    return {
        version: 1,
        textHash: getArticleTextHash(input.text),
        fullText: reasons.length === 0,
        qualityScore,
        reasons,
        method: evidence?.method ?? 'EXISTING',
        sourceUrl: evidence?.sourceUrl ?? null,
        sourceDate: Number.isFinite(sourceDate)
            ? new Date(sourceDate).toISOString()
            : null,
        signals: {
            documentComplete,
            identityMatched,
            titleMatched,
            dateMatched,
            paywall,
            truncated,
            paragraphs: paragraphs.length,
            sentences: sentenceCount,
            wordCount: words.length,
        },
    };
}

export function isCurrentFullTextAssessment(
    text: string,
    assessment: unknown,
): boolean {
    if (
        !assessment ||
        typeof assessment !== 'object' ||
        Array.isArray(assessment)
    )
        return false;
    const value = assessment as Record<string, unknown>;
    const signals = value.signals as Record<string, unknown> | undefined;
    return (
        value.version === 1 &&
        value.fullText === true &&
        value.textHash === getArticleTextHash(text) &&
        (value.method === 'READABILITY' ||
            value.method === 'JSON_LD' ||
            value.method === 'MANUAL') &&
        Array.isArray(value.reasons) &&
        value.reasons.length === 0 &&
        !!signals &&
        signals.documentComplete === true &&
        signals.identityMatched === true &&
        signals.paywall === false &&
        signals.truncated === false
    );
}

// Only the server's explicit editor-confirmation path may create this evidence.
// Ordinary text edits must invalidate the previous assessment instead.
export function makeManualContentAssessment(
    text: string,
): ArticleContentAssessment {
    if (!text.trim())
        throw new Error('Cannot confirm empty article text as complete');
    const assessed = assessArticleText({ text });
    return {
        ...assessed,
        fullText: true,
        qualityScore: 100,
        reasons: [],
        method: 'MANUAL',
        signals: {
            ...assessed.signals,
            documentComplete: true,
            identityMatched: true,
            titleMatched: null,
            dateMatched: null,
            paywall: false,
            truncated: false,
        },
    };
}
