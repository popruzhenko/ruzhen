import {
    assessArticleText,
    type ArticleContentAssessment,
    type ArticleExtractionMethod,
} from './articleContentQuality';
import { extractArticleDocument } from './extractReadableContent';
import {
    ArticleDocumentFetchError,
    fetchArticleDocument,
    type ArticleDocument,
} from './fetchArticleDocument';
import type {
    ArticleRetrievalAttempt,
    ArticleRetrievalMetadata,
} from './articleRetrievalTypes';

export interface RetrievedArticleContent {
    content: string;
    summary: string | null;
    imageUrl: string | null;
    sourceUrl: string;
    method: ArticleExtractionMethod;
    assessment: ArticleContentAssessment;
    retrieval?: ArticleRetrievalMetadata;
}

export interface RetrieveArticleContentInput {
    url: string;
    title: string;
    publishedAt?: string | Date | null;
    summary?: string | null;
    content?: string | null;
}

export interface RetrieveArticleContentDependencies {
    signal?: AbortSignal;
    fetchDocument?: (
        url: string,
        options?: { signal?: AbortSignal },
    ) => Promise<ArticleDocument>;
}

export interface RetrieveArticleContentResult {
    candidate: RetrievedArticleContent | null;
    reasons: string[];
    attempts?: ArticleRetrievalAttempt[];
}

export async function retrieveArticleContent(
    input: RetrieveArticleContentInput,
    deps: RetrieveArticleContentDependencies = {},
): Promise<RetrieveArticleContentResult> {
    const reasons: string[] = [];
    try {
        deps.signal?.throwIfAborted();
        const document = await (deps.fetchDocument ?? fetchArticleDocument)(
            input.url,
            { signal: deps.signal },
        );
        deps.signal?.throwIfAborted();
        const extracted = extractArticleDocument(document.html, document.url);
        reasons.push(...extracted.reasons);
        const candidates: RetrievedArticleContent[] = [];
        for (const source of extracted.candidates) {
            const assessment = assessArticleText({
                text: source.text,
                title: input.title,
                summary: input.summary ?? source.summary,
                url: input.url,
                publishedAt: input.publishedAt,
                evidence: {
                    method: source.method,
                    sourceUrl: document.url,
                    canonicalUrl: source.canonicalUrl,
                    articleUrl: source.articleUrl,
                    sourceTitle: source.title,
                    sourceDate: source.sourceDate,
                    documentComplete: extracted.documentComplete,
                    articleBody: source.articleBody,
                    paywall: extracted.paywall || source.paywall,
                    truncated: extracted.truncated || source.truncated,
                    linkDensity: source.linkDensity,
                },
            });
            reasons.push(...assessment.reasons);
            // Never offer an unrelated story, login page, navigation or a
            // description without evidence that it belongs to an article body.
            if (
                !assessment.signals.identityMatched ||
                assessment.signals.dateMatched === false ||
                !source.articleBody ||
                assessment.signals.wordCount < 10 ||
                assessment.reasons.includes('NAVIGATION_OR_BOILERPLATE') ||
                assessment.reasons.includes('REPEATED_OR_BOILERPLATE_TEXT')
            )
                continue;
            candidates.push({
                content: source.text,
                summary: source.summary,
                imageUrl: source.imageUrl,
                sourceUrl: document.url,
                method: source.method,
                assessment,
            });
        }
        candidates.sort(
            (left, right) =>
                Number(right.assessment.fullText) -
                    Number(left.assessment.fullText) ||
                right.assessment.qualityScore - left.assessment.qualityScore ||
                right.assessment.signals.wordCount -
                    left.assessment.signals.wordCount ||
                Number(right.method === 'JSON_LD') -
                    Number(left.method === 'JSON_LD'),
        );
        const candidate = candidates[0] ?? null;
        if (!candidate) reasons.push('NO_USABLE_ARTICLE_CONTENT');
        return { candidate, reasons: [...new Set(reasons)] };
    } catch (error) {
        if (deps.signal?.aborted)
            throw new ArticleDocumentFetchError(
                'ABORTED',
                'Article retrieval was cancelled',
            );
        if (error instanceof ArticleDocumentFetchError) throw error;
        throw new ArticleDocumentFetchError(
            'EXTRACTION_FAILED',
            error instanceof Error
                ? error.message
                : 'Failed to extract publisher article content',
        );
    }
}
