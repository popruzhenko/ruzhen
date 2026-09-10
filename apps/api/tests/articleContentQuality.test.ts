import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import {
    assessArticleText,
    getArticleTextHash,
    isCurrentFullTextAssessment,
    makeManualContentAssessment,
    type ArticleTextEvidence,
} from '../src/core/ingestionNews/enrich/articleContentQuality';
import {
    extractArticleDocument,
    extractReadableContent,
    normalizeRetrievedText,
} from '../src/core/ingestionNews/enrich/extractReadableContent';
import {
    ArticleDocumentFetchError,
    fetchArticleDocument,
    isPublicArticleAddress,
    type ArticleDocument,
    type ArticleHttpResponse,
    type ArticleHttpTransport,
    type FetchArticleDocumentOptions,
} from '../src/core/ingestionNews/enrich/fetchArticleDocument';
import { retrieveArticleContent } from '../src/core/ingestionNews/enrich/retrieveArticleContent';

const url = 'https://publisher.example.com/news/library';
const title = 'City council approves library renovation';
const sourceDate = '2026-09-09T10:00:00.000Z';
const shortArticle = [
    "City council members approved the new library renovation during Tuesday's public meeting. The project will replace damaged windows and improve access for residents with limited mobility.",
    'Work is scheduled to begin in October after the contractor completes a site survey. Library staff said the reading room will remain open and borrowed books can still be returned at the main entrance.',
    'The council published the budget and construction timetable after the vote. Local groups will receive monthly progress reports, and the next public update is planned for early November.',
].join('\n\n');
const evidence = (
    overrides: Partial<ArticleTextEvidence> = {},
): ArticleTextEvidence => ({
    method: 'READABILITY',
    sourceUrl: url,
    canonicalUrl: url,
    sourceTitle: title,
    sourceDate,
    documentComplete: true,
    articleBody: true,
    ...overrides,
});
const assess = (
    text = shortArticle,
    overrides: Partial<ArticleTextEvidence> = {},
) =>
    assessArticleText({
        text,
        title,
        url,
        publishedAt: sourceDate,
        evidence: evidence(overrides),
    });

const htmlEscape = (text: string) =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
const page = ({
    body = shortArticle,
    structured = [] as Record<string, unknown>[],
    extra = '',
    canonical = url,
    heading = title,
    date = sourceDate,
} = {}) => `<!doctype html><html><head>
<title>${htmlEscape(heading)}</title>
<link rel="canonical" href="${htmlEscape(canonical)}">
<meta property="og:title" content="${htmlEscape(heading)}">
<meta property="og:image" content="/library.jpg">
<meta property="article:published_time" content="${date}">
${structured.map((value) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`).join('\n')}
</head><body><article><h1>${htmlEscape(heading)}</h1>${body
    .split('\n\n')
    .map((paragraph) => `<p>${htmlEscape(paragraph)}</p>`)
    .join('')}</article>${extra}</body></html>`;

const documentFixture = (html: string): ArticleDocument => ({
    html,
    url,
    contentType: 'text/html; charset=utf-8',
    receivedBytes: Buffer.byteLength(html),
});
const retrieve = (
    html: string,
    overrides: { title?: string; publishedAt?: string } = {},
) =>
    retrieveArticleContent(
        { url, title, publishedAt: sourceDate, ...overrides },
        {
            fetchDocument: async () => documentFixture(html),
        },
    );

test('accepts a short complete publisher article and binds its evidence to every exact text byte', () => {
    assert.ok(shortArticle.length < 1200);
    const assessment = assess();
    assert.equal(assessment.fullText, true);
    assert.deepEqual(assessment.reasons, []);
    assert.ok(assessment.signals.paragraphs >= 3);
    assert.ok(assessment.signals.sentences >= 6);
    assert.equal(assessment.textHash, getArticleTextHash(shortArticle));
    assert.equal(
        isCurrentFullTextAssessment(
            shortArticle,
            JSON.parse(JSON.stringify(assessment)),
        ),
        true,
    );
    assert.equal(
        isCurrentFullTextAssessment(`${shortArticle} `, assessment),
        false,
    );
    assert.equal(
        isCurrentFullTextAssessment(
            shortArticle.replace('October', 'December'),
            assessment,
        ),
        false,
    );
    assert.equal(
        isCurrentFullTextAssessment(shortArticle, { fullText: true }),
        false,
    );
});

test('does not infer completeness from legacy length and requires explicit evidence for manual confirmation', () => {
    const legacyText = Array.from(
        { length: 15 },
        (_, index) => `Report ${index + 1}. ${shortArticle}`,
    ).join('\n\n');
    assert.ok(legacyText.length > 1200);
    const assessment = assessArticleText({ text: legacyText, title, url });
    assert.equal(assessment.fullText, false);
    assert.ok(assessment.reasons.includes('UNVERIFIED_ARTICLE_BODY'));
    const manual = makeManualContentAssessment(shortArticle);
    assert.equal(manual.method, 'MANUAL');
    assert.equal(isCurrentFullTextAssessment(shortArticle, manual), true);
    assert.equal(
        isCurrentFullTextAssessment(`${shortArticle}\nRevision.`, manual),
        false,
    );
    assert.throws(() => makeManualContentAssessment(' \n\t'));
});

test('rejects long truncations, summary-only text, repeated filler and navigation despite their length', () => {
    const longBody = Array.from(
        { length: 12 },
        (_, index) =>
            `During meeting ${index + 1}, council members reviewed the library budget and agreed to publish the financial records. Residents received a detailed response to their questions.`,
    ).join('\n\n');
    const truncated = `${longBody}\n\nThe final decision will be announced after the committee reviews`;
    assert.ok(truncated.length > 1200);
    assert.equal(assess(truncated).fullText, false);
    assert.ok(
        assess(`${longBody}...`).reasons.includes(
            'INCOMPLETE_SENTENCE_OR_TRAILER',
        ),
    );
    const summaryOnly = assessArticleText({
        text: shortArticle,
        summary: shortArticle,
        title,
        url,
        evidence: evidence(),
    });
    assert.ok(summaryOnly.reasons.includes('SUMMARY_ONLY_TEXT'));
    assert.ok(
        assess(
            'Privacy policy. Cookie settings. Sign in. Latest news. '.repeat(
                40,
            ),
        ).reasons.includes('NAVIGATION_OR_BOILERPLATE'),
    );
    assert.ok(
        assess(
            'An entirely repeated sentence about the library renovation. '.repeat(
                60,
            ),
        ).reasons.includes('REPEATED_OR_BOILERPLATE_TEXT'),
    );
    assert.ok(
        assess(shortArticle, { linkDensity: 0.8 }).reasons.includes(
            'NAVIGATION_OR_BOILERPLATE',
        ),
    );
});

test('validates title, canonical identity and publication date before certifying a body', () => {
    assert.equal(
        assess(shortArticle, { sourceTitle: `${title} | Publisher News` })
            .fullText,
        true,
    );
    assert.equal(
        assess(shortArticle, {
            sourceUrl: `${url}?utm_source=feed`,
            canonicalUrl: `${url}/`,
        }).fullText,
        true,
    );
    for (const overrides of [
        { sourceTitle: 'National football team wins a major championship' },
        { canonicalUrl: 'https://publisher.example.com/news/unrelated' },
        { articleUrl: 'https://publisher.example.com/news/unrelated' },
        { sourceDate: '2025-09-09T10:00:00Z' },
    ])
        assert.equal(assess(shortArticle, overrides).fullText, false);
});

test('decodes markup, preserves paragraphs and access notices, and never cuts off long content', () => {
    const normalized = normalizeRetrievedText(
        '<p>Library &amp; community &lt;budget&gt;.</p><p>Subscribe to continue reading.</p><script>not article text</script>',
    );
    assert.equal(
        normalized,
        'Library & community <budget>.\n\nSubscribe to continue reading.',
    );
    const longText = Array.from(
        { length: 400 },
        (_, index) =>
            `Paragraph ${index + 1} contains the complete published details without an arbitrary excerpt cutoff.`,
    ).join('\n\n');
    assert.equal(normalizeRetrievedText(longText), longText);
    const extracted = extractReadableContent(page({ body: longText }), url);
    assert.ok(
        extracted.textContent?.includes(
            'Paragraph 400 contains the complete published details',
        ),
    );
    assert.equal(
        extracted.imageUrl,
        'https://publisher.example.com/library.jpg',
    );
});

test('retrieves complete short Readability text and prefers a complete JSON-LD body over a visible teaser', async () => {
    const readable = await retrieve(page());
    assert.ok(readable.candidate);
    assert.equal(readable.candidate.method, 'READABILITY');
    assert.equal(readable.candidate.assessment.fullText, true);
    assert.ok(readable.candidate.content.includes('early November.'));
    assert.equal(readable.candidate.assessment.sourceDate, sourceDate);
    const structured = await retrieve(
        page({
            body: 'Council members approved renovation work. The project will begin soon...',
            structured: [
                {
                    '@type': 'NewsArticle',
                    headline: title,
                    articleBody: shortArticle,
                    datePublished: sourceDate,
                    mainEntityOfPage: { '@id': url },
                },
            ],
        }),
    );
    assert.ok(structured.candidate);
    assert.equal(structured.candidate.method, 'JSON_LD');
    assert.equal(structured.candidate.content, shortArticle);
    assert.equal(structured.candidate.assessment.fullText, true);
});

test('carries paywall evidence captured before Readability into every candidate assessment', async () => {
    const html = page({
        extra: '<aside class="paywall">Subscribe to continue reading the full article.</aside>',
        structured: [
            {
                '@type': 'NewsArticle',
                headline: title,
                articleBody: shortArticle,
                isAccessibleForFree: false,
            },
        ],
    });
    const extracted = extractArticleDocument(html, url);
    assert.equal(extracted.paywall, true);
    const result = await retrieve(html);
    assert.ok(result.candidate);
    assert.equal(result.candidate.assessment.fullText, false);
    assert.equal(result.candidate.assessment.signals.paywall, true);
    assert.ok(result.reasons.includes('PAYWALL_OR_ACCESS_NOTICE'));
});

test('keeps teaser trailers as truncation evidence even when Readability discards the control', async () => {
    for (const trailer of ['Read more.', 'Continue reading', 'Читать далее']) {
        const html = page().replace(
            '</article>',
            `<a href="${url}/full">${trailer}</a></article>`,
        );
        const result = await retrieve(html);
        assert.ok(result.candidate);
        assert.equal(result.candidate.assessment.fullText, false, trailer);
        assert.equal(
            result.candidate.assessment.signals.truncated,
            true,
            trailer,
        );
    }
});

test('rejects unrelated structured stories and metadata descriptions and never certifies repaired truncated HTML', async () => {
    const unrelated = await retrieve(
        page({ heading: 'National football team wins a major championship' }),
    );
    assert.equal(unrelated.candidate, null);
    const graph = await retrieve(
        page({
            structured: [
                {
                    '@graph': [
                        {
                            '@type': 'NewsArticle',
                            headline: title,
                            articleBody: shortArticle,
                            url: 'https://publisher.example.com/another-story',
                            isAccessibleForFree: false,
                        },
                        {
                            '@type': 'NewsArticle',
                            headline: title,
                            articleBody: shortArticle,
                            url,
                        },
                    ],
                },
            ],
        }),
    );
    assert.equal(graph.candidate?.assessment.fullText, true);
    const datedOnlyInSchema = page({
        structured: [
            {
                '@type': 'NewsArticle',
                headline: title,
                datePublished: '2020-01-01T10:00:00Z',
                url,
            },
        ],
    }).replace(/<meta property="article:published_time"[^>]*>/, '');
    const outdated = await retrieve(datedOnlyInSchema);
    assert.equal(outdated.candidate, null);
    assert.ok(outdated.reasons.includes('PUBLICATION_DATE_MISMATCH'));
    const metadataOnly = await retrieve(
        `<!doctype html><html><head><title>${title}</title><meta name="description" content="${htmlEscape(shortArticle)}"></head><body><h1>${title}</h1></body></html>`,
    );
    assert.equal(metadataOnly.candidate, null);
    const cutoff = await retrieve(page().replace('</body></html>', ''));
    assert.ok(cutoff.candidate);
    assert.equal(cutoff.candidate.assessment.fullText, false);
    assert.ok(cutoff.reasons.includes('INCOMPLETE_HTML_DOCUMENT'));
});

const publicAddress = { address: '93.184.216.34', family: 4 as const };
const response = (
    bytes: string | Uint8Array = page(),
    options: {
        status?: number;
        headers?: Record<string, string>;
        complete?: boolean;
    } = {},
) => {
    let cancelled = false;
    const value: ArticleHttpResponse = {
        status: options.status ?? 200,
        headers: new Headers({
            'content-type': 'text/html; charset=utf-8',
            ...options.headers,
        }),
        body: (async function* () {
            yield typeof bytes === 'string' ? Buffer.from(bytes) : bytes;
        })(),
        cancel: () => {
            cancelled = true;
        },
        complete: () => options.complete ?? true,
    };
    return { value, cancelled: () => cancelled };
};
const localOptions = (
    transport: ArticleHttpTransport,
    overrides: FetchArticleDocumentOptions = {},
): FetchArticleDocumentOptions => ({
    resolve: async () => [publicAddress],
    transport,
    retries: 0,
    ...overrides,
});
const expectFetchCode = (code: string) => (error: unknown) =>
    error instanceof ArticleDocumentFetchError && error.code === code;

test('blocks private and reserved addresses, mixed DNS answers and numeric localhost URL forms without requesting them', async () => {
    for (const address of [
        '127.0.0.1',
        '10.0.0.4',
        '169.254.169.254',
        '172.16.0.1',
        '192.168.1.1',
        '100.64.0.1',
        '::1',
        'fc00::1',
        'fe80::1',
        '::ffff:127.0.0.1',
        '2001:db8::1',
    ]) {
        assert.equal(isPublicArticleAddress(address), false, address);
    }
    assert.equal(isPublicArticleAddress(publicAddress.address), true);
    assert.equal(isPublicArticleAddress('2606:4700:4700::1111'), true);
    const transport: ArticleHttpTransport = async () => {
        assert.fail('Blocked hosts must never reach the transport');
    };
    for (const target of [
        'http://2130706433/',
        'http://0x7f000001/',
        'http://[::ffff:127.0.0.1]/',
        'http://localhost/',
        'http://service.internal/',
    ]) {
        await assert.rejects(
            fetchArticleDocument(target, localOptions(transport)),
            expectFetchCode('BLOCKED_ADDRESS'),
        );
    }
    await assert.rejects(
        fetchArticleDocument(
            url,
            localOptions(transport, {
                resolve: async () => [
                    publicAddress,
                    { address: '10.0.0.1', family: 4 },
                ],
            }),
        ),
        expectFetchCode('BLOCKED_ADDRESS'),
    );
    for (const target of [
        'file:///etc/passwd',
        'https://user:password@publisher.example.com/story',
        'http://publisher.example.com:8080/story',
    ]) {
        await assert.rejects(
            fetchArticleDocument(target, localOptions(transport)),
            expectFetchCode('UNSAFE_URL'),
        );
    }
});

test('passes the validated DNS address to transport and revalidates every redirect destination', async () => {
    const hosts: string[] = [];
    const requested: string[] = [];
    const redirect = response('', {
        status: 302,
        headers: { location: 'https://www.publisher.example.com/news/library' },
    });
    const html = page();
    const final = response(html);
    const options = localOptions(
        async (target, input) => {
            assert.deepEqual(input.address, publicAddress);
            requested.push(target.toString());
            return requested.length === 1 ? redirect.value : final.value;
        },
        {
            resolve: async (host) => {
                hosts.push(host);
                return [publicAddress];
            },
        },
    );
    const document = await fetchArticleDocument(url, options);
    assert.deepEqual(hosts, [
        'publisher.example.com',
        'www.publisher.example.com',
    ]);
    assert.equal(
        document.url,
        'https://www.publisher.example.com/news/library',
    );
    assert.equal(document.html, html);
    assert.equal(redirect.cancelled(), true);
    assert.equal(final.cancelled(), true);
    let calls = 0;
    await assert.rejects(
        fetchArticleDocument(
            url,
            localOptions(async () => {
                calls++;
                return response('', {
                    status: 302,
                    headers: {
                        location: 'http://169.254.169.254/latest/meta-data',
                    },
                }).value;
            }),
        ),
        expectFetchCode('BLOCKED_ADDRESS'),
    );
    assert.equal(calls, 1);
});

test('fails explicitly on response limits, wrong types, broken encoding and incomplete bodies without returning partial HTML', async () => {
    for (const [fixture, overrides, code] of [
        [
            response(page(), { headers: { 'content-length': '9999999' } }),
            {},
            'RESPONSE_TOO_LARGE',
        ],
        [response(page()), { maxBytes: 50 }, 'RESPONSE_TOO_LARGE'],
        [
            response('short', { headers: { 'content-length': '100' } }),
            {},
            'INCOMPLETE_RESPONSE',
        ],
        [response(page(), { complete: false }), {}, 'INCOMPLETE_RESPONSE'],
        [
            response('{}', { headers: { 'content-type': 'application/json' } }),
            {},
            'INVALID_CONTENT_TYPE',
        ],
        [response(new Uint8Array([0xc3, 0x28])), {}, 'INVALID_TEXT_ENCODING'],
        [
            response(gzipSync('x'.repeat(10000)), {
                headers: { 'content-encoding': 'gzip' },
            }),
            { maxBytes: 100 },
            'INVALID_COMPRESSED_RESPONSE',
        ],
    ] as const) {
        await assert.rejects(
            fetchArticleDocument(
                url,
                localOptions(async () => fixture.value, overrides),
            ),
            expectFetchCode(code),
        );
        assert.equal(fixture.cancelled(), true);
    }
});

test('retries transient publisher failures within the attempt limit but does not retry permanent HTTP errors', async () => {
    let attempts = 0;
    const document = await fetchArticleDocument(
        url,
        localOptions(
            async () => {
                attempts++;
                return response(page(), { status: attempts === 1 ? 503 : 200 })
                    .value;
            },
            { retries: 1 },
        ),
    );
    assert.equal(attempts, 2);
    assert.equal(document.html, page());
    attempts = 0;
    await assert.rejects(
        fetchArticleDocument(
            url,
            localOptions(
                async () => {
                    attempts++;
                    return response('', { status: 404 }).value;
                },
                { retries: 2 },
            ),
        ),
        expectFetchCode('HTTP_404'),
    );
    assert.equal(attempts, 1);
    await assert.rejects(
        fetchArticleDocument(
            url,
            localOptions(
                async () =>
                    response('', { status: 302, headers: { location: url } })
                        .value,
                { maxRedirects: 1 },
            ),
        ),
        expectFetchCode('TOO_MANY_REDIRECTS'),
    );
});

test('honors cancellation and bounds DNS waiting without making a network request', async () => {
    const controller = new AbortController();
    const transport: ArticleHttpTransport = async () => {
        assert.fail('DNS never completed');
    };
    const cancelled = fetchArticleDocument(
        url,
        localOptions(transport, {
            signal: controller.signal,
            resolve: () => new Promise(() => undefined),
        }),
    );
    controller.abort();
    await assert.rejects(cancelled, expectFetchCode('ABORTED'));
    const keepEventLoopAlive = setTimeout(() => undefined, 1000);
    try {
        await assert.rejects(
            fetchArticleDocument(
                url,
                localOptions(transport, {
                    timeoutMs: 10,
                    resolve: () => new Promise(() => undefined),
                }),
            ),
            expectFetchCode('FETCH_TIMEOUT'),
        );
    } finally {
        clearTimeout(keepEventLoopAlive);
    }
});

test('retrieval propagates fetch failures so durable jobs can distinguish errors from no useful body', async () => {
    const failure = new ArticleDocumentFetchError(
        'HTTP_503',
        'Publisher returned HTTP 503',
        true,
    );
    await assert.rejects(
        retrieveArticleContent(
            { url, title },
            {
                fetchDocument: async () => {
                    throw failure;
                },
            },
        ),
        (error) => error === failure,
    );
    const empty = await retrieve(
        '<html><head><title>Publisher</title></head><body></body></html>',
    );
    assert.equal(empty.candidate, null);
    assert.ok(empty.reasons.includes('NO_USABLE_ARTICLE_CONTENT'));
});
