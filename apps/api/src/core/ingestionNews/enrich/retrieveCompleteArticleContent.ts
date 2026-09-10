import {
    isCurrentFullTextAssessment,
    normalizeArticleIdentityUrl,
} from './articleContentQuality';
import type {
    ArticleRetrievalAttempt,
    ArticleRetrievalMetadata,
    ArticleRetrievalProvider,
} from './articleRetrievalTypes';
import { fetchArchiveArticleDocuments } from './archiveToday';
import {
    ArticleDocumentFetchError,
    type ArticleDocument,
} from './fetchArticleDocument';
import { fetchBrowserArticleDocument } from './fetchBrowserArticleDocument';
import { formatArticleRetrievalAttempts } from './formatArticleRetrieval';
import {
    retrieveArticleContent,
    type RetrieveArticleContentInput,
    type RetrieveArticleContentResult,
    type RetrievedArticleContent,
} from './retrieveArticleContent';

export interface CompleteArticleRetrievalOptions {
    signal?: AbortSignal;
    browserEnabled?: boolean;
    archiveEnabled?: boolean;
    now?: () => Date;
    retrievePublisher?: (
        input: RetrieveArticleContentInput,
        signal?: AbortSignal,
    ) => Promise<RetrieveArticleContentResult>;
    fetchBrowserDocument?: typeof fetchBrowserArticleDocument;
    fetchArchiveDocuments?: typeof fetchArchiveArticleDocuments;
}

const verified = (candidate: RetrievedArticleContent | null | undefined) =>
    !!candidate &&
    isCurrentFullTextAssessment(candidate.content, candidate.assessment);

function isBetter(
    candidate: RetrievedArticleContent,
    previous: RetrievedArticleContent | null,
) {
    if (!previous) return true;
    const fullDifference =
        Number(verified(candidate)) - Number(verified(previous));
    if (fullDifference) return fullDifference > 0;
    const scoreDifference =
        candidate.assessment.qualityScore - previous.assessment.qualityScore;
    return (
        scoreDifference > 0 ||
        (scoreDifference === 0 &&
            candidate.content.length > previous.content.length)
    );
}

/** Try each independent source until a complete matching body is verified. */
export async function retrieveCompleteArticleContent(
    input: RetrieveArticleContentInput,
    options: CompleteArticleRetrievalOptions = {},
): Promise<RetrieveArticleContentResult> {
    const attempts: ArticleRetrievalAttempt[] = [];
    let best: RetrievedArticleContent | null = null;
    let bestSource: Omit<ArticleRetrievalMetadata, 'attempts'> | null = null;
    const now = options.now ?? (() => new Date());
    const browserEnabled =
        options.browserEnabled ??
        !/^(false|0)$/i.test(process.env.ENRICH_BROWSER_ENABLED ?? 'true');
    const archiveEnabled =
        options.archiveEnabled ??
        !/^(false|0)$/i.test(process.env.ENRICH_ARCHIVE_ENABLED ?? 'true');
    const checkAbort = () => {
        if (options.signal?.aborted)
            throw new ArticleDocumentFetchError(
                'ABORTED',
                'Article retrieval was cancelled',
            );
    };
    const record = (
        provider: ArticleRetrievalProvider,
        result: RetrieveArticleContentResult,
        url: string,
        capturedAt: string | null = null,
    ) => {
        const candidate = result.candidate;
        attempts.push({
            provider,
            url,
            outcome: candidate
                ? verified(candidate)
                    ? 'FULL_TEXT'
                    : 'PARTIAL_TEXT'
                : 'NO_CONTENT',
            reasons: candidate ? candidate.assessment.reasons : result.reasons,
        });
        if (candidate && isBetter(candidate, best)) {
            best = candidate;
            bestSource = {
                provider,
                originalUrl: input.url,
                retrievedUrl: url,
                retrievedAt: now().toISOString(),
                archiveCapturedAt: capturedAt,
            };
        }
    };
    const failure = (
        provider: ArticleRetrievalProvider,
        error: unknown,
        url = input.url,
    ) => {
        checkAbort();
        const code =
            error instanceof ArticleDocumentFetchError
                ? error.code
                : 'RETRIEVAL_FAILED';
        if (code === 'ABORTED') throw error;
        const message =
            error instanceof Error ? error.message : 'Article retrieval failed';
        attempts.push({
            provider,
            outcome: 'ERROR',
            url,
            reasons: [code, message],
        });
    };
    const finish = (): RetrieveArticleContentResult => ({
        candidate:
            best && bestSource
                ? {
                      ...best,
                      retrieval: { ...bestSource, attempts: [...attempts] },
                  }
                : null,
        reasons: [...new Set(attempts.flatMap((attempt) => attempt.reasons))],
        attempts,
    });

    checkAbort();
    try {
        const result = await (
            options.retrievePublisher ??
            ((value, signal) => retrieveArticleContent(value, { signal }))
        )(input, options.signal);
        checkAbort();
        record(
            'PUBLISHER_HTTP',
            result,
            result.candidate?.sourceUrl ?? input.url,
        );
    } catch (error) {
        if (
            error instanceof ArticleDocumentFetchError &&
            ['INVALID_URL', 'UNSAFE_URL', 'BLOCKED_ADDRESS'].includes(
                error.code,
            )
        )
            throw error;
        failure('PUBLISHER_HTTP', error);
    }
    if (verified(best)) return finish();

    if (browserEnabled) {
        checkAbort();
        try {
            const document = await (
                options.fetchBrowserDocument ?? fetchBrowserArticleDocument
            )(input.url, { signal: options.signal });
            const result = await retrieveArticleContent(input, {
                signal: options.signal,
                fetchDocument: async () => document,
            });
            checkAbort();
            record('PUBLISHER_BROWSER', result, document.url);
        } catch (error) {
            failure('PUBLISHER_BROWSER', error);
        }
    } else {
        attempts.push({
            provider: 'PUBLISHER_BROWSER',
            outcome: 'SKIPPED',
            url: input.url,
            reasons: ['Browser retrieval is disabled in API configuration.'],
        });
    }
    if (verified(best)) return finish();

    if (archiveEnabled) {
        checkAbort();
        const seen = new Set<string>();
        const accept = async (archive: {
            document: ArticleDocument;
            originalUrl: string;
            capturedAt: string | null;
        }) => {
            checkAbort();
            if (seen.has(archive.document.url)) return verified(best);
            seen.add(archive.document.url);
            if (
                normalizeArticleIdentityUrl(archive.originalUrl) !==
                normalizeArticleIdentityUrl(input.url)
            ) {
                failure(
                    'ARCHIVE_TODAY',
                    new ArticleDocumentFetchError(
                        'ARCHIVE_IDENTITY_MISMATCH',
                        'The snapshot belongs to a different article.',
                    ),
                    archive.document.url,
                );
                return false;
            }
            try {
                // The archive adapter verifies the saved original URL before
                // supplying the isolated body. Relative publisher metadata is
                // interpreted against that verified URL; provenance keeps the
                // actual snapshot URL and capture time separately.
                const result = await retrieveArticleContent(input, {
                    signal: options.signal,
                    fetchDocument: async () => ({
                        ...archive.document,
                        url: archive.originalUrl,
                    }),
                });
                if (result.candidate)
                    result.candidate = {
                        ...result.candidate,
                        sourceUrl: archive.document.url,
                        assessment: {
                            ...result.candidate.assessment,
                            sourceUrl: archive.document.url,
                        },
                    };
                record(
                    'ARCHIVE_TODAY',
                    result,
                    archive.document.url,
                    archive.capturedAt,
                );
            } catch (error) {
                failure('ARCHIVE_TODAY', error, archive.document.url);
            }
            return verified(best);
        };
        try {
            const result = await (
                options.fetchArchiveDocuments ?? fetchArchiveArticleDocuments
            )(input, { signal: options.signal, onDocument: accept });
            checkAbort();
            // Also support providers that return collected documents without
            // invoking the optional early-stop callback.
            for (const document of result.documents) {
                if (await accept(document)) break;
            }
            for (const error of result.errors ?? []) {
                failure(
                    'ARCHIVE_TODAY',
                    new ArticleDocumentFetchError(error.code, error.message),
                    error.url ?? input.url,
                );
            }
            if (!seen.size && !result.errors?.length)
                attempts.push({
                    provider: 'ARCHIVE_TODAY',
                    outcome: 'NO_CONTENT',
                    url: input.url,
                    reasons: result.reasons.length
                        ? result.reasons
                        : ['ARCHIVE_NOT_FOUND'],
                });
        } catch (error) {
            failure('ARCHIVE_TODAY', error);
        }
    } else {
        attempts.push({
            provider: 'ARCHIVE_TODAY',
            outcome: 'SKIPPED',
            url: input.url,
            reasons: ['Archive retrieval is disabled in API configuration.'],
        });
    }
    checkAbort();
    if (!best && attempts.some((attempt) => attempt.outcome === 'ERROR')) {
        throw new ArticleDocumentFetchError(
            'ALL_RETRIEVAL_FAILED',
            formatArticleRetrievalAttempts(attempts),
            true,
        );
    }
    return finish();
}
