import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assessArticleText,
    getArticleTextHash,
} from '../src/core/ingestionNews/enrich/articleContentQuality';
import {
    ArticleDocumentFetchError,
    type ArticleDocument,
} from '../src/core/ingestionNews/enrich/fetchArticleDocument';
import {
    retrieveCompleteArticleContent,
    type CompleteArticleRetrievalOptions,
} from '../src/core/ingestionNews/enrich/retrieveCompleteArticleContent';
import type { RetrievedArticleContent } from '../src/core/ingestionNews/enrich/retrieveArticleContent';

const url = 'https://publisher.example.org/news/library';
const title = 'City council approves library renovation';
const publishedAt = '2026-09-09T10:00:00Z';
const capturedAt = '2026-09-10T08:30:00.000Z';
const snapshotUrl = 'https://archive.ph/Ab12C';
const input = {
    url,
    title,
    publishedAt,
    summary:
        'Council members approved a renovation project after hearing from residents.',
};
const body = [
    'Council members approved the library renovation during a public meeting on Tuesday. The work will improve access to the building and replace damaged windows on the upper floor.',
    'Construction will begin in October after the contractor completes a site survey. Library staff said the main reading room will remain open throughout the work and borrowed books can still be returned.',
    'The council published the project budget after the vote. Residents will receive monthly progress reports and the next public meeting is scheduled for November.',
].join('\n\n');
const fragment =
    'Council members approved the renovation after a public meeting. The contractor is expected to begin work soon...';
const html = (text = body, heading = title, date = publishedAt) =>
    `<!doctype html><html><head><title>${heading}</title><link rel="canonical" href="${url}"><meta property="article:published_time" content="${date}"></head><body><article><h1>${heading}</h1>${text
        .split('\n\n')
        .map((p) => `<p>${p}</p>`)
        .join('')}</article></body></html>`;
const document = (
    text = body,
    heading = title,
    date = publishedAt,
): ArticleDocument => ({
    url,
    html: html(text, heading, date),
    contentType: 'text/html',
    receivedBytes: Buffer.byteLength(html(text, heading, date)),
});
const candidate = (content = body): RetrievedArticleContent => ({
    content,
    summary: input.summary,
    imageUrl: null,
    sourceUrl: url,
    method: 'READABILITY',
    assessment: assessArticleText({
        text: content,
        ...input,
        evidence: {
            method: 'READABILITY',
            sourceUrl: url,
            canonicalUrl: url,
            sourceTitle: title,
            sourceDate: publishedAt,
            articleBody: true,
            documentComplete: true,
        },
    }),
});
const archive = (
    text = body,
    overrides: {
        url?: string;
        title?: string;
        date?: string;
        originalUrl?: string;
    } = {},
) => ({
    document: {
        ...document(text, overrides.title, overrides.date),
        url: overrides.url ?? snapshotUrl,
    },
    originalUrl: overrides.originalUrl ?? url,
    capturedAt,
});
const emptyArchive = async () => ({
    documents: [],
    reasons: ['ARCHIVE_NOT_FOUND'],
    errors: [],
});
const noContent = async () => ({
    candidate: null,
    reasons: ['NO_USABLE_ARTICLE_CONTENT'],
});
const options = (
    overrides: CompleteArticleRetrievalOptions = {},
): CompleteArticleRetrievalOptions => ({
    browserEnabled: true,
    archiveEnabled: true,
    retrievePublisher: noContent,
    fetchBrowserDocument: async () => ({
        ...document(),
        html: '<html><head><title>Publisher</title></head><body></body></html>',
    }),
    fetchArchiveDocuments: emptyArchive,
    now: () => new Date('2026-09-11T12:00:00Z'),
    ...overrides,
});
const fail = (code: string) => {
    throw new ArticleDocumentFetchError(code, `Fixture ${code}`);
};

test('verified publisher text stops the pipeline before browser or archive requests', async () => {
    const original = candidate();
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            retrievePublisher: async () => ({
                candidate: original,
                reasons: [],
            }),
            fetchBrowserDocument: async () =>
                assert.fail('browser should not run'),
            fetchArchiveDocuments: async () =>
                assert.fail('archive should not run'),
        }),
    );
    assert.equal(result.candidate?.content, body);
    assert.equal(result.candidate?.retrieval?.provider, 'PUBLISHER_HTTP');
    assert.equal(result.attempts?.length, 1);
    assert.equal(
        result.candidate?.assessment.textHash,
        getArticleTextHash(body),
    );
    assert.equal(
        original.retrieval,
        undefined,
        'Do not mutate the adapter result',
    );
});

test('a browser-rendered complete article replaces an HTTP teaser and stops archive lookup', async () => {
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            retrievePublisher: async () => ({
                candidate: candidate(fragment),
                reasons: [],
            }),
            fetchBrowserDocument: async () => document(),
            fetchArchiveDocuments: async () =>
                assert.fail('archive should not run'),
        }),
    );
    assert.equal(result.candidate?.assessment.fullText, true);
    assert.equal(result.candidate?.retrieval?.provider, 'PUBLISHER_BROWSER');
    assert.deepEqual(
        result.attempts?.map((a) => a.outcome),
        ['PARTIAL_TEXT', 'FULL_TEXT'],
    );
});

test('archive recovery continues after HTTP and browser failures and separates capture from publication', async () => {
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            retrievePublisher: async () => fail('HTTP_503'),
            fetchBrowserDocument: async () => fail('BROWSER_CHALLENGE'),
            fetchArchiveDocuments: async () => ({
                documents: [archive()],
                reasons: [],
                errors: [],
            }),
        }),
    );
    assert.equal(result.candidate?.assessment.fullText, true);
    assert.equal(result.candidate?.sourceUrl, snapshotUrl);
    assert.equal(result.candidate?.assessment.sourceUrl, snapshotUrl);
    assert.equal(
        result.candidate?.assessment.sourceDate,
        new Date(publishedAt).toISOString(),
    );
    assert.equal(result.candidate?.retrieval?.archiveCapturedAt, capturedAt);
    assert.equal(result.candidate?.retrieval?.originalUrl, url);
    assert.deepEqual(
        result.attempts?.map((a) => a.outcome),
        ['ERROR', 'ERROR', 'FULL_TEXT'],
    );
});

test('a later failed fallback preserves a better earlier partial body and its full attempt history', async () => {
    const partial = `${body}\n\nThe final detailed timetable will be announced...`;
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            retrievePublisher: async () => ({
                candidate: candidate(partial),
                reasons: [],
            }),
            fetchBrowserDocument: async () => document(fragment),
            fetchArchiveDocuments: async () => ({
                documents: [],
                reasons: [],
                errors: [
                    {
                        code: 'HTTP_429',
                        message: 'Archive is rate limited',
                        url: 'https://archive.ph/search/',
                    },
                ],
            }),
        }),
    );
    assert.equal(result.candidate?.content, partial);
    assert.equal(result.candidate?.retrieval?.provider, 'PUBLISHER_HTTP');
    assert.equal(result.candidate?.assessment.fullText, false);
    assert.ok(
        result.candidate?.retrieval?.attempts.some((a) =>
            a.reasons.includes('HTTP_429'),
        ),
    );
});

test('an archive snapshot for another URL is rejected even when its content and headline match', async () => {
    await assert.rejects(
        retrieveCompleteArticleContent(
            input,
            options({
                fetchArchiveDocuments: async () => ({
                    documents: [
                        archive(body, {
                            originalUrl:
                                'https://publisher.example.org/other-story',
                        }),
                    ],
                    reasons: [],
                    errors: [],
                }),
            }),
        ),
        /ARCHIVE_IDENTITY_MISMATCH/,
    );
});

test('archive identity does not override a conflicting headline or publication date inside its body', async () => {
    for (const overrides of [
        { title: 'National football team wins a major tournament' },
        { date: '2020-01-01T12:00:00Z' },
    ]) {
        const result = await retrieveCompleteArticleContent(
            input,
            options({
                fetchArchiveDocuments: async () => ({
                    documents: [archive(body, overrides)],
                    reasons: [],
                    errors: [],
                }),
            }),
        );
        assert.equal(result.candidate, null);
        assert.equal(
            result.attempts?.[result.attempts.length - 1]?.outcome,
            'NO_CONTENT',
        );
    }
});

test('cancellation during publisher retrieval never starts fallback sources', async () => {
    const controller = new AbortController();
    await assert.rejects(
        retrieveCompleteArticleContent(
            input,
            options({
                signal: controller.signal,
                retrievePublisher: async () => {
                    controller.abort();
                    return { candidate: candidate(fragment), reasons: [] };
                },
                fetchBrowserDocument: async () =>
                    assert.fail('browser should not run'),
                fetchArchiveDocuments: async () =>
                    assert.fail('archive should not run'),
            }),
        ),
        (error: unknown) =>
            error instanceof ArticleDocumentFetchError &&
            error.code === 'ABORTED',
    );
});

test('cancellation during browser rendering stops archive lookup', async () => {
    const controller = new AbortController();
    await assert.rejects(
        retrieveCompleteArticleContent(
            input,
            options({
                signal: controller.signal,
                fetchBrowserDocument: async () => {
                    controller.abort();
                    return document();
                },
                fetchArchiveDocuments: async () =>
                    assert.fail('archive should not run'),
            }),
        ),
        (error: unknown) =>
            error instanceof ArticleDocumentFetchError &&
            error.code === 'ABORTED',
    );
});

test('complete retrieval failures remain errors for durable retry instead of becoming an empty success', async () => {
    await assert.rejects(
        retrieveCompleteArticleContent(
            input,
            options({
                retrievePublisher: async () => fail('HTTP_403'),
                fetchBrowserDocument: async () => fail('BROWSER_UNAVAILABLE'),
                fetchArchiveDocuments: async () => ({
                    documents: [],
                    reasons: [],
                    errors: [
                        {
                            code: 'ARCHIVE_CHALLENGE',
                            message: 'Archive requires verification',
                        },
                    ],
                }),
            }),
        ),
        (error: unknown) => {
            assert.ok(error instanceof ArticleDocumentFetchError);
            assert.equal(error.code, 'ALL_RETRIEVAL_FAILED');
            for (const code of [
                'HTTP_403',
                'BROWSER_UNAVAILABLE',
                'ARCHIVE_CHALLENGE',
            ])
                assert.match(error.message, new RegExp(code));
            return true;
        },
    );
});

test('successful empty sources report no content and disabled adapters are never called', async () => {
    const empty = await retrieveCompleteArticleContent(input, options());
    assert.equal(empty.candidate, null);
    assert.equal(empty.attempts?.length, 3);
    assert.ok(empty.reasons.includes('ARCHIVE_NOT_FOUND'));
    const disabled = await retrieveCompleteArticleContent(
        input,
        options({
            browserEnabled: false,
            archiveEnabled: false,
            fetchBrowserDocument: async () => assert.fail('disabled browser'),
            fetchArchiveDocuments: async () => assert.fail('disabled archive'),
        }),
    );
    assert.deepEqual(
        disabled.attempts?.map((a) => a.outcome),
        ['NO_CONTENT', 'SKIPPED', 'SKIPPED'],
    );
});

test('unsafe publisher addresses are not forwarded to external archive search', async () => {
    await assert.rejects(
        retrieveCompleteArticleContent(
            input,
            options({
                retrievePublisher: async () => fail('BLOCKED_ADDRESS'),
                fetchBrowserDocument: async () =>
                    assert.fail('browser should not run'),
                fetchArchiveDocuments: async () =>
                    assert.fail('archive should not run'),
            }),
        ),
        /BLOCKED_ADDRESS/,
    );
});

test('archive callback stops on full text and duplicate returned documents are assessed once', async () => {
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            fetchArchiveDocuments: async (_input, config) => {
                const item = archive();
                assert.equal(await config?.onDocument?.(item), true);
                return { documents: [item], reasons: [], errors: [] };
            },
        }),
    );
    assert.equal(
        result.attempts?.filter((a) => a.provider === 'ARCHIVE_TODAY').length,
        1,
    );
    assert.equal(result.candidate?.retrieval?.provider, 'ARCHIVE_TODAY');
});

test('an old full-text flag with a mismatched hash does not skip browser retrieval', async () => {
    const stale = candidate();
    stale.content = fragment;
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            retrievePublisher: async () => ({ candidate: stale, reasons: [] }),
            fetchBrowserDocument: async () => document(),
        }),
    );
    assert.equal(result.candidate?.retrieval?.provider, 'PUBLISHER_BROWSER');
    assert.equal(result.attempts?.length, 2);
});

test('a matching but truncated snapshot does not prevent trying a later complete snapshot', async () => {
    const result = await retrieveCompleteArticleContent(
        input,
        options({
            fetchArchiveDocuments: async (_input, config) => {
                const partial = archive(fragment, {
                    url: 'https://archive.ph/Short',
                });
                assert.equal(await config?.onDocument?.(partial), false);
                const full = archive();
                assert.equal(await config?.onDocument?.(full), true);
                return { documents: [partial, full], reasons: [], errors: [] };
            },
        }),
    );
    assert.equal(result.candidate?.sourceUrl, snapshotUrl);
    assert.deepEqual(
        result.attempts
            ?.filter((a) => a.provider === 'ARCHIVE_TODAY')
            .map((a) => a.outcome),
        ['PARTIAL_TEXT', 'FULL_TEXT'],
    );
});
