import assert from 'node:assert/strict';
import test from 'node:test';
import {
    fetchArchiveArticleDocuments,
    parseArchiveLookup,
    parseArchiveSnapshot,
    type ArchiveArticleInput,
    type ArchiveArticleOptions,
} from '../src/core/ingestionNews/enrich/archiveToday';
import {
    ArticleDocumentFetchError,
    type ArticleDocument,
    type FetchArticleDocumentOptions,
} from '../src/core/ingestionNews/enrich/fetchArticleDocument';
import { retrieveArticleContent } from '../src/core/ingestionNews/enrich/retrieveArticleContent';

const originalUrl = 'https://publisher.example.com/news/library?edition=local';
const title = 'City council approves library renovation';
const publishedAt = '2024-09-09T10:00:00.000Z';
const capturedAt = '2025-01-11T12:13:14.000Z';
const input: ArchiveArticleInput = { url: originalUrl, title, publishedAt };
const snapshotUrl = 'https://archive.ph/Ab12C';
const longUrl = `https://archive.ph/20250111121314/${originalUrl}`;
const body = [
    "City council members approved the new library renovation during Tuesday's public meeting. The project will replace damaged windows and improve access for residents with limited mobility.",
    'Work is scheduled to begin in October after the contractor completes a site survey. Library staff said the reading room will remain open and borrowed books can still be returned at the main entrance.',
    'The council published the budget and construction timetable after the vote. Local groups will receive monthly progress reports, and the next public update is planned for early November.',
].join('\n\n');
const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fixture = (html: string, url = snapshotUrl): ArticleDocument => ({
    html,
    url,
    contentType: 'text/html; charset=utf-8',
    receivedBytes: Buffer.byteLength(html),
});

// Synthetic conservative fixtures, not a saved production snapshot. The live
// archive.ph home confirmed GET /search/?q=... and its exact-URL example; the
// sample snapshot returned a security check, which was not interacted with.
const snapshot = ({
    original = originalUrl,
    shareUrl = longUrl,
    heading = title,
    text = body,
    date = publishedAt as string | null,
    canonical = snapshotUrl,
    semantic = true,
    extra = '',
    head = '',
} = {}) => `<!doctype html><html><head><title>${escape(heading)}</title>
<link rel="canonical" href="${escape(canonical)}">
<meta property="og:url" content="${escape(canonical)}">
<meta property="og:description" content="archived 11 Jan 2025 12:13:14 UTC">
${date ? `<meta property="article:published_time" content="${date}">` : ''}${head}
</head><body><div id="HEADER"><input name="q" value="${escape(original)}">
<input id="SHARE_LONGLINK" value="${escape(shareUrl)}">
<p>Saved from ${escape(original)} at 11 Jan 2025. Sign in. Privacy policy. Cookie settings. Terms of service. All rights reserved.</p>
<form action="/submit/"><input name="url" value="${escape(original)}"></form></div>
<div id="CONTENT"><${semantic ? 'article' : 'div'}><h1>${escape(heading)}</h1>${text
    .split('\n\n')
    .map((paragraph) => `<p>${escape(paragraph)}</p>`)
    .join('')}</${semantic ? 'article' : 'div'}>${extra}</div>
<div id="FOOTER">archive.today webpage capture</div></body></html>`;
const lookup = (urls: string[], url = 'https://archive.today/search/') =>
    fixture(
        `<!doctype html><html><head><title>Search snapshots</title></head><body><form id="search" method="get" action="/search/"><input name="q" value="${escape(originalUrl)}"></form>${urls.map((value) => `<a href="${escape(value)}">snapshot</a>`).join('')}</body></html>`,
        url,
    );
const lookupUrl = (origin = 'https://archive.today') =>
    `${origin}/search/?q=${encodeURIComponent(originalUrl)}`;
const searchFixture = (urls: string[], origin = 'https://archive.today') =>
    lookup(urls, lookupUrl(origin));

test('isolates verified publisher HTML and keeps capture time separate from publication', async () => {
    assert.ok(body.length < 1200);
    const parsed = parseArchiveSnapshot(fixture(snapshot()), input);
    assert.deepEqual(parsed.reasons, []);
    assert.ok(parsed.document);
    assert.equal(parsed.document.document.url, snapshotUrl);
    assert.equal(parsed.document.originalUrl, originalUrl);
    assert.equal(parsed.document.capturedAt, capturedAt);
    assert.doesNotMatch(
        parsed.document.document.html,
        /Saved from|archived 11 Jan|id="HEADER"|id="FOOTER"|\/submit\//,
    );
    assert.match(parsed.document.document.html, /<article>/);
    assert.match(parsed.document.document.html, /2024-09-09T10:00:00.000Z/);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate?.assessment.fullText, true);
    assert.equal(retrieved.candidate?.assessment.sourceDate, publishedAt);
    assert.doesNotMatch(
        retrieved.candidate?.content ?? '',
        /archive\.today|privacy policy/i,
    );
});

test('does not infer article-body semantics or publication date from a verified archive wrapper', async () => {
    const parsed = parseArchiveSnapshot(
        fixture(snapshot({ semantic: false, date: null })),
        input,
    );
    assert.ok(parsed.document);
    assert.doesNotMatch(
        parsed.document.document.html,
        /<article|<main|article:published_time|datePublished/i,
    );
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate, null);
    assert.ok(retrieved.reasons.includes('UNVERIFIED_ARTICLE_BODY'));
});

test('requires snapshot original identity before considering a matching title and full body', () => {
    const wrong = 'https://publisher.example.com/news/another-story';
    for (const html of [
        snapshot({ original: wrong }),
        snapshot({ shareUrl: `https://archive.ph/20250111121314/${wrong}` }),
        snapshot({ canonical: wrong }),
        snapshot({
            canonical:
                'https://publisher.example.com/news/library?edition=international',
        }),
    ]) {
        const parsed = parseArchiveSnapshot(fixture(html), input);
        assert.equal(parsed.document, null);
        assert.ok(parsed.reasons.includes('ARCHIVE_ORIGINAL_URL_MISMATCH'));
    }
    const unconfirmed = snapshot().replace(
        /<div id="HEADER">[\s\S]*?<\/div>/,
        '',
    );
    assert.ok(
        parseArchiveSnapshot(fixture(unconfirmed), input).reasons.includes(
            'ARCHIVE_ORIGINAL_URL_UNCONFIRMED',
        ),
    );
});

test('publisher canonical corroborates identity, preserving harmless tracking normalization', () => {
    const tracked = `${originalUrl}&utm_source=feed#comments`;
    const parsed = parseArchiveSnapshot(
        fixture(snapshot({ original: tracked, canonical: tracked })),
        input,
    );
    assert.ok(parsed.document);
    assert.match(parsed.document.document.html, /rel="canonical"/);
});

test('removes archive screenshot social images while preserving publisher and CDN article images', async () => {
    const archived = parseArchiveSnapshot(
        fixture(
            snapshot({
                head: '<meta property="og:image" content="https://archive.ph/Ab12C/scr.png"><meta name="twitter:image" content="http://archive.today/Ab12C/scr.png"><meta property="twitter:image:src" content="https://archive.md/Ab12C/scr.png">',
            }),
        ),
        input,
    );
    assert.ok(archived.document);
    assert.doesNotMatch(archived.document.document.html, /scr\.png/);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...archived.document!.document,
            url: archived.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate?.imageUrl, null);
    assert.equal(retrieved.candidate?.assessment.fullText, true);
    for (const image of [
        'https://publisher.example.com/library.jpg',
        'https://cdn.example.com/library.jpg',
    ]) {
        const publisher = parseArchiveSnapshot(
            fixture(
                snapshot({
                    head: `<meta property="og:image" content="${image}"><meta name="twitter:image" content="${image}">`,
                }),
            ),
            input,
        );
        assert.ok(publisher.document);
        assert.match(publisher.document.document.html, /property="og:image"/);
        assert.match(publisher.document.document.html, /name="twitter:image"/);
        const candidate = await retrieveArticleContent(input, {
            fetchDocument: async () => ({
                ...publisher.document!.document,
                url: publisher.document!.originalUrl,
            }),
        });
        assert.equal(candidate.candidate?.imageUrl, image);
    }
});

test('replaces only explicit archive title branding using the verified captured heading', async () => {
    const heading = `${title}: funding approved`;
    for (const brand of [
        'archive.today',
        'archive.ph webpage capture',
        'archive.md',
    ]) {
        const html = snapshot({
            heading,
            head: `<meta property="og:title" content="${brand}">`,
        }).replace(`<title>${heading}</title>`, `<title>${brand}</title>`);
        const parsed = parseArchiveSnapshot(fixture(html), input);
        assert.ok(parsed.document);
        assert.match(
            parsed.document.document.html,
            /<title>City council approves library renovation: funding approved<\/title>/,
        );
        assert.doesNotMatch(
            parsed.document.document.html,
            /property="og:title"/,
        );
        const retrieved = await retrieveArticleContent(input, {
            fetchDocument: async () => ({
                ...parsed.document!.document,
                url: parsed.document!.originalUrl,
            }),
        });
        assert.equal(retrieved.candidate?.assessment.fullText, true);
    }
    const noHeading = snapshot({
        head: '<meta property="og:title" content="archive.today">',
    }).replace(/<h1>[\s\S]*?<\/h1>/, '');
    assert.deepEqual(parseArchiveSnapshot(fixture(noHeading), input).reasons, [
        'ARCHIVE_TITLE_MISMATCH',
    ]);
});

test('keeps conflicting publisher title metadata subject to the normal identity checks', async () => {
    const parsed = parseArchiveSnapshot(
        fixture(
            snapshot({
                head: '<meta property="og:title" content="Regional hospital opens emergency department">',
            }),
        ),
        input,
    );
    assert.ok(parsed.document);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate, null);
    assert.ok(retrieved.reasons.includes('TITLE_MISMATCH'));
});

test('rejects mismatched titles, publication dates and incomplete HTML', () => {
    assert.ok(
        parseArchiveSnapshot(
            fixture(
                snapshot({
                    heading: 'Regional hospital opens emergency department',
                }),
            ),
            input,
        ).reasons.includes('ARCHIVE_TITLE_MISMATCH'),
    );
    assert.ok(
        parseArchiveSnapshot(
            fixture(snapshot({ date: '2020-01-01T00:00:00Z' })),
            input,
        ).reasons.includes('ARCHIVE_PUBLICATION_DATE_MISMATCH'),
    );
    assert.ok(
        parseArchiveSnapshot(
            fixture(snapshot({ date: 'not-a-date' })),
            input,
        ).reasons.includes('ARCHIVE_INVALID_PUBLICATION_DATE'),
    );
    assert.ok(
        parseArchiveSnapshot(
            fixture(snapshot().replace('</html>', '')),
            input,
        ).reasons.includes('ARCHIVE_INCOMPLETE_DOCUMENT'),
    );
});

test('rejects captures predating publication, future captures and conflicting capture identities', () => {
    const oldUrl = `https://archive.ph/20200111121314/${originalUrl}`;
    assert.ok(
        parseArchiveSnapshot(
            fixture(snapshot({ shareUrl: oldUrl })),
            input,
        ).reasons.includes('ARCHIVE_CAPTURE_TIME_MISMATCH'),
    );
    const future = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000)
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
    assert.ok(
        parseArchiveSnapshot(
            fixture(
                snapshot({
                    shareUrl: `https://archive.ph/${future}/${originalUrl}`,
                }),
            ),
            input,
        ).reasons.includes('ARCHIVE_CAPTURE_TIME_MISMATCH'),
    );
    assert.ok(
        parseArchiveSnapshot(
            fixture(
                snapshot(),
                `https://archive.ph/20250111121315/${originalUrl}`,
            ),
            input,
        ).reasons.includes('ARCHIVE_CAPTURE_TIME_CONFLICT'),
    );
});

test('accepts timestamp snapshot URLs and the explicitly known archive.md redirect mirror', () => {
    const html = snapshot().replace(/<div id="HEADER">[\s\S]*?<\/div>/, '');
    const parsed = parseArchiveSnapshot(
        fixture(html, longUrl.replace('archive.ph', 'archive.md')),
        input,
    );
    assert.ok(parsed.document);
    assert.equal(parsed.document.capturedAt, capturedAt);
    assert.match(parsed.document.document.url, /^https:\/\/archive\.md\//);
    for (const host of [
        'archive.ph.evil.example',
        'archive.example',
        'www.archive.ph',
    ])
        assert.equal(
            parseArchiveSnapshot(
                fixture(snapshot(), `https://${host}/Ab12C`),
                input,
            ).document,
            null,
        );
});

test('accepts an archive-encoded protocol colon without decoding article path or query delimiters', async () => {
    const encodedOriginal =
        'https://publisher.example.com/news/library%2Fupdate?edition=local%26special';
    const encodedInput = { ...input, url: encodedOriginal };
    const encodedLong = `https://archive.ph/2025.01.11-121314/${encodedOriginal.replace('https:', 'https%3A')}`;
    const html = snapshot({ original: encodedOriginal, shareUrl: encodedLong });
    const parsed = parseArchiveSnapshot(
        fixture(html, encodedLong),
        encodedInput,
    );
    assert.ok(parsed.document);
    assert.equal(parsed.document.originalUrl, encodedOriginal);
    assert.equal(parsed.document.capturedAt, capturedAt);
    assert.equal(
        parseArchiveSnapshot(fixture(html, encodedLong), {
            ...input,
            url: 'https://publisher.example.com/news/library/update?edition=local&special',
        }).document,
        null,
    );
    let calls = 0;
    const result = await fetchArchiveArticleDocuments(encodedInput, {
        fetchDocument: async (_url, options) => {
            calls++;
            options?.validateUrl?.(
                new URL(
                    `https://archive.ph/${encodedOriginal.replace('https:', 'https%3A')}`,
                ),
            );
            options?.validateUrl?.(new URL(encodedLong));
            return fixture(html, encodedLong);
        },
        onDocument: () => true,
    });
    assert.equal(calls, 1);
    assert.equal(result.documents.length, 1);
    assert.deepEqual(result.errors, []);
});

test('rejects CAPTCHA and search pages as snapshot bodies', () => {
    const challenge = fixture(
        snapshot({
            extra: '<div id="g-recaptcha">Please complete the security check</div>',
        }),
    );
    assert.deepEqual(parseArchiveSnapshot(challenge, input).reasons, [
        'ARCHIVE_CAPTCHA',
    ]);
    assert.deepEqual(parseArchiveLookup(challenge, input).reasons, [
        'ARCHIVE_CAPTCHA',
    ]);
    assert.equal(
        parseArchiveSnapshot(lookup([snapshotUrl]), input).document,
        null,
    );
    assert.equal(
        parseArchiveSnapshot(
            fixture(snapshot().replace(/id="CONTENT"/, 'id="search-results"')),
            input,
        ).document,
        null,
    );
});

test('preserves teaser and access notices so normal quality checks never certify them as full text', async () => {
    const parsed = parseArchiveSnapshot(
        fixture(
            snapshot({
                text: `${body}\n\nSubscribe to read the full article.`,
            }),
        ),
        input,
    );
    assert.ok(parsed.document);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate?.assessment.fullText, false);
    assert.ok(retrieved.reasons.includes('PAYWALL_OR_ACCESS_NOTICE'));
});

test('preserves publisher descriptions so an archive copy of a summary remains summary-only', async () => {
    const parsed = parseArchiveSnapshot(
        fixture(
            snapshot({
                head: `<meta name="description" content="${escape(`${title} ${body}`)}">`,
            }),
        ),
        input,
    );
    assert.ok(parsed.document);
    assert.match(parsed.document.document.html, /name="description"/);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate?.assessment.fullText, false);
    assert.ok(retrieved.reasons.includes('SUMMARY_ONLY_TEXT'));
});

test('archive header dates never become publisher publication evidence', async () => {
    const html = snapshot({ date: null }).replace(
        '<div id="HEADER">',
        `<div id="HEADER"><time itemprop="datePublished" datetime="${capturedAt}">Captured</time>`,
    );
    const parsed = parseArchiveSnapshot(fixture(html), input);
    assert.ok(parsed.document);
    assert.equal(parsed.document.capturedAt, capturedAt);
    assert.doesNotMatch(parsed.document.document.html, /datePublished/);
    const retrieved = await retrieveArticleContent(input, {
        fetchDocument: async () => ({
            ...parsed.document!.document,
            url: parsed.document!.originalUrl,
        }),
    });
    assert.equal(retrieved.candidate?.assessment.sourceDate, null);
});

test('lookup returns only bounded snapshot links, never archive actions or unrelated timestamp URLs', () => {
    const urls = [
        '/submit/?url=https://publisher.example.com/news/library',
        '/save',
        '/search/?q=other',
        'https://evil.example/Ab12C',
        'http://archive.ph/Ab12C',
        'https://archive.ph:8443/Ab12C',
        `https://archive.ph/20250111121314/https://publisher.example.com/news/other`,
        'https://archive.ph/20251340129999/https://publisher.example.com/news/library',
        snapshotUrl,
        snapshotUrl,
        'https://archive.md/Bc23D',
        longUrl,
        'https://archive.ph/Cd34E',
    ];
    assert.deepEqual(parseArchiveLookup(lookup(urls), input), {
        snapshots: [snapshotUrl, 'https://archive.md/Bc23D', longUrl],
        reasons: [],
    });
});

test('recognizes real empty-result search forms without an id and reports missing snapshots without errors', async () => {
    const noResults = (url: string) =>
        fixture(
            `<!doctype html><html><head><title>archive.ph</title></head><body>
        <form method="GET" action="https://archive.ph/search/"><input type="text" name="q" value="${escape(originalUrl)}"><input type="submit" value="search"></form>
        <div>No results</div><form action="https://archive.ph/submit/"><input name="url" value="${escape(originalUrl)}"><input type="submit" value="save"></form>
        </body></html>`,
            url,
        );
    assert.deepEqual(parseArchiveLookup(noResults(lookupUrl()), input), {
        snapshots: [],
        reasons: ['ARCHIVE_NOT_FOUND'],
    });
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => noResults(url),
    });
    assert.deepEqual(result.documents, []);
    assert.deepEqual(result.reasons, ['ARCHIVE_NOT_FOUND']);
    assert.deepEqual(result.errors, []);
});

test('search forms without ids still require safe GET search actions and one exact original URL', () => {
    const valid = searchFixture([snapshotUrl]);
    valid.html = valid.html.replace(' id="search"', '');
    assert.deepEqual(parseArchiveLookup(valid, input), {
        snapshots: [snapshotUrl],
        reasons: [],
    });
    for (const html of [
        valid.html.replace('action="/search/"', 'action="/submit/"'),
        valid.html.replace(
            'action="/search/"',
            'action="https://evil.example/search/"',
        ),
        valid.html.replace(
            'action="/search/"',
            'action="http://archive.ph/search/"',
        ),
        valid.html.replace(
            'action="/search/"',
            'action="/search/?url=unexpected"',
        ),
        valid.html.replace('method="get"', 'method="post"'),
        valid.html.replace(
            escape(originalUrl),
            'https://publisher.example.com/news/other',
        ),
        valid.html.replace('name="q"', 'disabled name="q"'),
        valid.html.replace(
            '</form>',
            `<input name="q" value="${escape(originalUrl)}"></form>`,
        ),
    ]) {
        assert.deepEqual(parseArchiveLookup({ ...valid, html }, input), {
            snapshots: [],
            reasons: ['ARCHIVE_LOOKUP_UNCONFIRMED'],
        });
    }
});

test('fetches an exact original-URL search and stops immediately when the caller accepts full text', async () => {
    const calls: string[] = [];
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url, options) => {
            calls.push(url);
            assert.equal(options?.retries, 0);
            assert.ok(options?.signal);
            assert.ok(options?.validateUrl);
            return calls.length === 1
                ? searchFixture([snapshotUrl, 'https://archive.ph/Bc23D'])
                : fixture(snapshot());
        },
        onDocument: () => true,
    });
    assert.deepEqual(calls, [lookupUrl(), snapshotUrl]);
    assert.equal(result.documents.length, 1);
    assert.deepEqual(result.errors, []);
});

test('tries further snapshots when earlier text is only a teaser and never exceeds three snapshots', async () => {
    const calls: string[] = [];
    const seen: string[] = [];
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => {
            calls.push(url);
            if (url === lookupUrl())
                return searchFixture([
                    snapshotUrl,
                    'https://archive.ph/Bc23D',
                    'https://archive.ph/Cd34E',
                    'https://archive.ph/De45F',
                ]);
            return fixture(
                snapshot({ text: `${body}\n\nContinue reading...` }),
                url,
            );
        },
        onDocument: (value) => {
            seen.push(value.document.url);
            return false;
        },
    });
    assert.equal(calls.length, 4);
    assert.equal(result.documents.length, 3);
    assert.equal(seen.length, 3);
});

test('falls back from an unavailable lookup mirror and reports transport errors distinctly from missing snapshots', async () => {
    const calls: string[] = [];
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => {
            calls.push(url);
            if (calls.length === 1)
                throw new ArticleDocumentFetchError(
                    'HTTP_503',
                    'Temporarily unavailable',
                    true,
                );
            return fixture(snapshot());
        },
        onDocument: () => true,
    });
    assert.deepEqual(calls, [lookupUrl(), lookupUrl('https://archive.ph')]);
    assert.equal(result.documents.length, 1);
    assert.equal(result.errors[0]?.code, 'HTTP_503');
    assert.ok(!result.reasons.includes('ARCHIVE_NOT_FOUND'));
    const absent = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => lookup([], url),
    });
    assert.equal(absent.documents.length, 0);
    assert.deepEqual(absent.reasons, ['ARCHIVE_NOT_FOUND']);
    assert.deepEqual(absent.errors, []);
});

test('CAPTCHA halts archive requests and reports an error without trying another mirror', async () => {
    let calls = 0;
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => {
            calls++;
            return fixture(
                '<html><head><title>archive.ph</title></head><body><div id="g-recaptcha">Please complete the security check</div></body></html>',
                url,
            );
        },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.reasons, ['ARCHIVE_CAPTCHA']);
    assert.equal(result.errors[0]?.code, 'ARCHIVE_CAPTCHA');
});

test('HTTP 429 stops archive retrieval without using another mirror to evade the limit', async () => {
    let calls = 0;
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async () => {
            calls++;
            throw new ArticleDocumentFetchError(
                'HTTP_429',
                'Too many requests',
                true,
            );
        },
    });
    assert.equal(calls, 1);
    assert.equal(result.documents.length, 0);
    assert.equal(result.errors[0]?.code, 'HTTP_429');
    assert.ok(!result.reasons.includes('ARCHIVE_NOT_FOUND'));
});

test('generic HTML and home pages are unconfirmed lookups, not successful empty searches', async () => {
    const generic =
        '<html><head><title>Temporarily unavailable</title></head><body><p>Come back later.</p></body></html>';
    const result = await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url) => fixture(generic, url),
    });
    assert.equal(result.documents.length, 0);
    assert.deepEqual(result.reasons, ['ARCHIVE_LOOKUP_UNCONFIRMED']);
    assert.equal(result.errors.length, 2);
    assert.ok(
        result.errors.every(
            (error) => error.code === 'ARCHIVE_LOOKUP_UNCONFIRMED',
        ),
    );
    const home = searchFixture([]);
    home.html = home.html.replace(`value="${escape(originalUrl)}"`, 'value=""');
    assert.deepEqual(parseArchiveLookup(home, input).reasons, [
        'ARCHIVE_LOOKUP_UNCONFIRMED',
    ]);
    assert.deepEqual(
        parseArchiveLookup(
            { ...home, html: home.html.replace('</html>', '') },
            input,
        ).reasons,
        ['ARCHIVE_INCOMPLETE_DOCUMENT'],
    );
});

test('redirect validation rejects submit and off-mirror destinations before transport can request them', async () => {
    const forbidden = [
        'https://archive.ph/submit/?url=https://publisher.example.com/news/library',
        'https://evil.example/Ab12C',
        'https://archive.ph/search/?q=https://other.example/',
    ];
    for (const destination of forbidden) {
        const result = await fetchArchiveArticleDocuments(input, {
            fetchDocument: async (_url, options) => {
                assert.throws(
                    () => options?.validateUrl?.(new URL(destination)),
                    /outside an existing-snapshot lookup/,
                );
                return fixture(snapshot(), destination);
            },
        });
        assert.equal(result.documents.length, 0);
        assert.equal(result.errors[0]?.code, 'ARCHIVE_UNSAFE_REDIRECT');
    }
});

test('total budget bounds a hanging dependency and cancellation propagates as ABORTED', async () => {
    // Keep the event loop alive while AbortSignal.timeout's unref timer fires.
    const keepAlive = setInterval(() => undefined, 1000);
    try {
        let calls = 0;
        const hung: NonNullable<
            ArchiveArticleOptions['fetchDocument']
        > = async () => {
            calls++;
            return new Promise(() => undefined);
        };
        const result = await fetchArchiveArticleDocuments(input, {
            fetchDocument: hung,
            timeoutMs: 20,
        });
        assert.equal(calls, 1);
        assert.equal(result.errors[0]?.code, 'ARCHIVE_TIMEOUT');
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            fetchArchiveArticleDocuments(input, {
                signal: controller.signal,
                fetchDocument: hung,
            }),
            (error: unknown) =>
                error instanceof ArticleDocumentFetchError &&
                error.code === 'ABORTED',
        );
        assert.equal(calls, 1);
    } finally {
        clearInterval(keepAlive);
    }
});

test('the same conservative options remain compatible with the existing document fetcher dependency', async () => {
    const received: FetchArticleDocumentOptions[] = [];
    await fetchArchiveArticleDocuments(input, {
        fetchDocument: async (url, options) => {
            received.push(options ?? {});
            return lookup([], url);
        },
    });
    assert.equal(received.length, 2);
    assert.ok(
        received.every(
            (options) => options.timeoutMs === 10000 && options.retries === 0,
        ),
    );
});
