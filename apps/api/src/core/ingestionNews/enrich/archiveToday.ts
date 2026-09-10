import { JSDOM } from 'jsdom';
import {
    articleTitlesMatch,
    normalizeArticleIdentityUrl,
} from './articleContentQuality';
import {
    ArticleDocumentFetchError,
    fetchArticleDocument,
    type ArticleDocument,
    type FetchArticleDocumentOptions,
} from './fetchArticleDocument';

export interface ArchiveArticleInput {
    url: string;
    title: string;
    publishedAt?: string | Date | null;
}

export interface ArchiveArticleDocument {
    document: ArticleDocument;
    originalUrl: string;
    capturedAt: string | null;
}

export interface ArchiveRetrievalError {
    code: string;
    message: string;
    url?: string;
}

export interface ArchiveArticleResult {
    documents: ArchiveArticleDocument[];
    reasons: string[];
    errors: ArchiveRetrievalError[];
}

export interface ArchiveArticleOptions {
    signal?: AbortSignal;
    fetchDocument?: (
        url: string,
        options?: FetchArticleDocumentOptions,
    ) => Promise<ArticleDocument>;
    /** Return true once the caller has a satisfactory, assessed article. */
    onDocument?: (
        document: ArchiveArticleDocument,
    ) => boolean | Promise<boolean>;
    /** A shorter budget can be supplied by the enclosing retrieval operation. */
    timeoutMs?: number;
}

const LOOKUP_ORIGINS = ['https://archive.today', 'https://archive.ph'];
// archive.ph's own FAQ redirects to archive.md. Keep redirects explicit;
// an arbitrary archive.* hostname is not evidence of an archive snapshot.
const ARCHIVE_HOSTS = new Set(['archive.today', 'archive.ph', 'archive.md']);
const MAX_SNAPSHOTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_PATH = /^\/[a-zA-Z0-9]{5}\/?$/;
const TIMESTAMP_PATH =
    /^\/(\d{14}|\d{4}\.\d{2}\.\d{2}(?:-\d{6})?)\/((?:https?:|https?%3a)\/\/.+)$/i;
const ARCHIVE_BRANDED_TITLE =
    /^archive\.(?:today|ph|md)(?:\s+webpage\s+capture)?$/i;

function archiveEmbeddedOriginal(value: string): string {
    // Archive links can encode the embedded protocol colon. Decode only this
    // delimiter: encoded slashes and query separators belong to article identity.
    return value.replace(/^(https?)%3a(?=\/\/)/i, '$1:');
}

function archiveUrl(value: string, base?: string): URL | null {
    try {
        const url = new URL(value, base);
        if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.port ||
            !ARCHIVE_HOSTS.has(url.hostname)
        )
            return null;
        url.hash = '';
        return url;
    } catch {
        return null;
    }
}

function captureDate(value: string): string | null {
    const digits = value.replace(/[.-]/g, '');
    if (!/^\d{8}(?:\d{6})?$/.test(digits)) return null;
    const parts = [
        Number(digits.slice(0, 4)),
        Number(digits.slice(4, 6)),
        Number(digits.slice(6, 8)),
        Number(digits.slice(8, 10) || 0),
        Number(digits.slice(10, 12) || 0),
        Number(digits.slice(12, 14) || 0),
    ];
    const date = new Date(
        Date.UTC(
            parts[0],
            parts[1] - 1,
            parts[2],
            parts[3],
            parts[4],
            parts[5],
        ),
    );
    if (
        date.getUTCFullYear() !== parts[0] ||
        date.getUTCMonth() + 1 !== parts[1] ||
        date.getUTCDate() !== parts[2] ||
        date.getUTCHours() !== parts[3] ||
        date.getUTCMinutes() !== parts[4] ||
        date.getUTCSeconds() !== parts[5]
    )
        return null;
    return date.toISOString();
}

function snapshotIdentity(value: string, base?: string) {
    const url = archiveUrl(value, base);
    if (!url) return null;
    if (SNAPSHOT_PATH.test(url.pathname) && !url.search)
        return { url: url.toString(), originalUrl: null, capturedAt: null };
    const match = TIMESTAMP_PATH.exec(url.pathname + url.search);
    if (!match) return null;
    const original = archiveEmbeddedOriginal(match[2]);
    const originalUrl = normalizeArticleIdentityUrl(original);
    const capturedAt = captureDate(match[1]);
    return originalUrl && capturedAt
        ? { url: url.toString(), originalUrl: original, capturedAt }
        : null;
}

function isChallenge(document: Document): boolean {
    return (
        !!document.querySelector(
            '#g-recaptcha, .g-recaptcha, .h-captcha, #challenge-form, #cf-challenge-running, form[action*="chk_captcha"]',
        ) ||
        /(?:please complete the security check|why do i have to complete a captcha|verify (?:that )?you are human|checking your browser before accessing)/i.test(
            document.body.textContent ?? '',
        )
    );
}

function completeHtml(html: string): boolean {
    return (
        /<html(?:\s|>)/i.test(html) &&
        /<\/html\s*>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html) &&
        (!/<body(?:\s|>)/i.test(html) || /<\/body\s*>/i.test(html)) &&
        (html.match(/<script(?:\s|>)/gi)?.length ?? 0) ===
            (html.match(/<\/script\s*>/gi)?.length ?? 0)
    );
}

function expectedIdentity(input: ArchiveArticleInput): string | null {
    try {
        const url = new URL(input.url);
        return !url.username && !url.password && !url.port
            ? normalizeArticleIdentityUrl(input.url)
            : null;
    } catch {
        return null;
    }
}

/** Isolate an existing snapshot only after checking its captured original URL. */
export function parseArchiveSnapshot(
    source: ArticleDocument,
    input: ArchiveArticleInput,
): { document: ArchiveArticleDocument | null; reasons: string[] } {
    const reject = (reason: string) => ({ document: null, reasons: [reason] });
    const location = snapshotIdentity(source.url);
    const expected = expectedIdentity(input);
    if (!location || !expected) return reject('ARCHIVE_UNSAFE_SNAPSHOT_URL');
    const dom = new JSDOM(source.html, { url: source.url });
    try {
        const document = dom.window.document;
        if (isChallenge(document)) return reject('ARCHIVE_CAPTCHA');
        const content = document.querySelector('#CONTENT');
        if (!content || document.querySelectorAll('#CONTENT').length !== 1)
            return reject('ARCHIVE_SNAPSHOT_UNCONFIRMED');
        if (!completeHtml(source.html))
            return reject('ARCHIVE_INCOMPLETE_DOCUMENT');

        const originals: string[] = [];
        const captures: string[] = [];
        if (location.originalUrl) originals.push(location.originalUrl);
        if (location.capturedAt) captures.push(location.capturedAt);
        for (const element of Array.from(
            document.querySelectorAll(
                '#SHARE_LONGLINK, #HEADER input[name="q"], #HEADER input[name="url"], #HEADER input#q',
            ),
        )) {
            if (content.contains(element)) continue;
            const value = element.getAttribute('value')?.trim();
            if (!value) continue;
            if (element.id === 'SHARE_LONGLINK') {
                const identity = snapshotIdentity(value, source.url);
                if (!identity?.originalUrl)
                    return reject('ARCHIVE_CAPTURE_IDENTITY_UNCONFIRMED');
                if (identity?.originalUrl) originals.push(identity.originalUrl);
                if (identity?.capturedAt) captures.push(identity.capturedAt);
            } else {
                originals.push(value);
            }
        }
        // Some snapshots retain the publisher canonical instead of an archive
        // canonical. A conflicting publisher identity always invalidates them.
        for (const element of Array.from(
            document.querySelectorAll(
                'link[rel~="canonical"], meta[property="og:url"]',
            ),
        )) {
            const value =
                element.getAttribute('href') ?? element.getAttribute('content');
            if (!value) continue;
            const absolute = new URL(value, input.url).toString();
            if (!archiveUrl(absolute)) originals.push(absolute);
        }
        if (!originals.length)
            return reject('ARCHIVE_ORIGINAL_URL_UNCONFIRMED');
        if (
            originals.some(
                (value) => normalizeArticleIdentityUrl(value) !== expected,
            )
        )
            return reject('ARCHIVE_ORIGINAL_URL_MISMATCH');
        if (new Set(captures).size > 1)
            return reject('ARCHIVE_CAPTURE_TIME_CONFLICT');
        const capturedAt = captures[0] ?? null;
        const publication = input.publishedAt
            ? new Date(input.publishedAt).getTime()
            : Number.NaN;
        if (
            capturedAt &&
            (new Date(capturedAt).getTime() > Date.now() + DAY_MS ||
                (Number.isFinite(publication) &&
                    new Date(capturedAt).getTime() < publication - 2 * DAY_MS))
        )
            return reject('ARCHIVE_CAPTURE_TIME_MISMATCH');

        const publisherHeading = content
            .querySelector('h1')
            ?.textContent?.trim();
        const sourceTitle =
            publisherHeading ||
            document
                .querySelector('meta[property="og:title"]')
                ?.getAttribute('content') ||
            document.title;
        if (!sourceTitle || !articleTitlesMatch(input.title, sourceTitle))
            return reject('ARCHIVE_TITLE_MISMATCH');
        for (const element of Array.from(
            document.querySelectorAll(
                'meta[property="article:published_time"], meta[itemprop="datePublished"], time[itemprop="datePublished"]',
            ),
        )) {
            if (!document.head.contains(element) && !content.contains(element))
                continue;
            const value =
                element.getAttribute('content') ??
                element.getAttribute('datetime');
            if (!value) continue;
            const date = new Date(value).getTime();
            if (!Number.isFinite(date))
                return reject('ARCHIVE_INVALID_PUBLICATION_DATE');
            if (
                Number.isFinite(publication) &&
                Math.abs(date - publication) > 2 * DAY_MS
            )
                return reject('ARCHIVE_PUBLICATION_DATE_MISMATCH');
        }

        // Preserve the captured publisher's actual semantic tags and notices.
        // #CONTENT itself is not proof of an article body: never turn it into
        // an <article> or invent publication metadata from the capture time.
        const isolated = content.cloneNode(true) as Element;
        for (const element of Array.from(
            isolated.querySelectorAll(
                '#HEADER, #FOOTER, #SHARE, #TOOLBAR, iframe, object, embed',
            ),
        ))
            element.remove();
        document.body.replaceChildren(isolated);
        if (publisherHeading) {
            // The original URL and the captured h1 have already been verified.
            // Remove only archive branding; preserve conflicting publisher
            // headlines for the normal extraction identity checks.
            for (const element of Array.from(
                document.head.querySelectorAll('meta[property="og:title"]'),
            )) {
                if (
                    ARCHIVE_BRANDED_TITLE.test(
                        element.getAttribute('content')?.trim() ?? '',
                    )
                )
                    element.remove();
            }
            if (ARCHIVE_BRANDED_TITLE.test(document.title.trim()))
                document.title = publisherHeading;
        }
        for (const element of Array.from(
            document.querySelectorAll(
                'base, script:not([type="application/ld+json"]), link[rel~="canonical"], meta[property="og:url"], meta[property="og:description"], meta[name="description"]',
            ),
        )) {
            if (
                element.tagName === 'LINK' ||
                element.getAttribute('property') === 'og:url'
            ) {
                const value =
                    element.getAttribute('href') ??
                    element.getAttribute('content');
                if (value && !archiveUrl(value, input.url)) continue;
            }
            if (
                element.getAttribute('property') === 'og:description' ||
                element.getAttribute('name') === 'description'
            ) {
                // The archive adds a capture-date description. An actual
                // publisher description must survive summary-only checks.
                if (
                    !/^archived\s+(?:\d|on\b)/i.test(
                        element.getAttribute('content')?.trim() ?? '',
                    )
                )
                    continue;
            }
            element.remove();
        }
        for (const element of Array.from(
            document.head.querySelectorAll(
                'meta[property="og:image"], meta[property="twitter:image"], meta[name="twitter:image"], meta[property="twitter:image:src"], meta[name="twitter:image:src"]',
            ),
        )) {
            try {
                const image = new URL(
                    element.getAttribute('content') ?? '',
                    source.url,
                );
                // Archive social cards show the captured page's screenshot,
                // not the publisher's article image. Keep publisher/CDN URLs.
                if (ARCHIVE_HOSTS.has(image.hostname)) element.remove();
            } catch {
                // Leave malformed publisher metadata to the normal extractor.
            }
        }
        return {
            document: {
                document: { ...source, html: dom.serialize() },
                originalUrl: originals[0],
                capturedAt,
            },
            reasons: [],
        };
    } catch {
        return reject('ARCHIVE_INVALID_SNAPSHOT');
    } finally {
        dom.window.close();
    }
}

/** Read only links to snapshots; never return save/submit/search/pagination URLs. */
export function parseArchiveLookup(
    source: ArticleDocument,
    input: ArchiveArticleInput,
): { snapshots: string[]; reasons: string[] } {
    if (!archiveUrl(source.url))
        return { snapshots: [], reasons: ['ARCHIVE_UNSAFE_LOOKUP_URL'] };
    const dom = new JSDOM(source.html, { url: source.url });
    try {
        const document = dom.window.document;
        if (isChallenge(document))
            return { snapshots: [], reasons: ['ARCHIVE_CAPTCHA'] };
        if (!completeHtml(source.html))
            return { snapshots: [], reasons: ['ARCHIVE_INCOMPLETE_DOCUMENT'] };
        const expected = expectedIdentity(input);
        const confirmedSearch =
            expected &&
            Array.from(document.querySelectorAll('form')).some((form) => {
                // Live empty-result pages do not always give this form an id.
                // Its GET action and exact original URL identify a search;
                // a save/submit form must never establish lookup identity.
                const action = archiveUrl(
                    form.getAttribute('action') ?? '',
                    source.url,
                );
                const queryFields = form.querySelectorAll('input[name="q"]');
                const query = queryFields[0];
                return (
                    (form.getAttribute('method') ?? 'get').toLowerCase() ===
                        'get' &&
                    action?.pathname === '/search/' &&
                    !action.search &&
                    queryFields.length === 1 &&
                    !query.hasAttribute('disabled') &&
                    normalizeArticleIdentityUrl(
                        query.getAttribute('value') ?? '',
                    ) === expected
                );
            });
        if (!confirmedSearch)
            return { snapshots: [], reasons: ['ARCHIVE_LOOKUP_UNCONFIRMED'] };
        const snapshots = new Set<string>();
        for (const link of Array.from(document.querySelectorAll('a[href]'))) {
            const identity = snapshotIdentity(
                link.getAttribute('href') ?? '',
                source.url,
            );
            if (!identity) continue;
            if (
                identity.originalUrl &&
                normalizeArticleIdentityUrl(identity.originalUrl) !== expected
            )
                continue;
            snapshots.add(identity.url);
        }
        return {
            snapshots: [...snapshots].slice(0, MAX_SNAPSHOTS),
            reasons: snapshots.size ? [] : ['ARCHIVE_NOT_FOUND'],
        };
    } finally {
        dom.window.close();
    }
}

function waitForSignal<T>(
    promise: Promise<T>,
    signal: AbortSignal,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () =>
            reject(signal.reason ?? new Error('Archive retrieval aborted'));
        if (signal.aborted) return abort();
        signal.addEventListener('abort', abort, { once: true });
        promise
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
    });
}

/** GET existing snapshots only. No archive creation or CAPTCHA interaction. */
export async function fetchArchiveArticleDocuments(
    input: ArchiveArticleInput,
    options: ArchiveArticleOptions = {},
): Promise<ArchiveArticleResult> {
    const result: ArchiveArticleResult = {
        documents: [],
        reasons: [],
        errors: [],
    };
    const expected = expectedIdentity(input);
    if (!expected) {
        result.reasons.push('ARCHIVE_INVALID_ORIGINAL_URL');
        return result;
    }
    const deadline = AbortSignal.timeout(
        Math.max(1, Math.min(options.timeoutMs ?? 30000, 30000)),
    );
    const signal = options.signal
        ? AbortSignal.any([options.signal, deadline])
        : deadline;
    const fetchDocument = options.fetchDocument ?? fetchArticleDocument;
    const visited = new Set<string>();
    let snapshotsFetched = 0;
    let stop = false;
    const validateUrl = (url: URL) => {
        const allowed = archiveUrl(url.toString());
        const lookup =
            allowed &&
            allowed.pathname === '/search/' &&
            [...allowed.searchParams.keys()].every((key) => key === 'q') &&
            allowed.searchParams.getAll('q').length === 1 &&
            normalizeArticleIdentityUrl(allowed.searchParams.get('q') ?? '') ===
                expected;
        const pathLookup =
            allowed &&
            normalizeArticleIdentityUrl(
                archiveEmbeddedOriginal(
                    (allowed.pathname + allowed.search).slice(1),
                ),
            ) === expected;
        if (
            !allowed ||
            (!lookup && !pathLookup && !snapshotIdentity(allowed.toString()))
        )
            throw new ArticleDocumentFetchError(
                'ARCHIVE_UNSAFE_REDIRECT',
                'Archive request redirected outside an existing-snapshot lookup',
            );
    };
    const fetch = async (url: string) => {
        signal.throwIfAborted();
        validateUrl(new URL(url));
        const document = await waitForSignal(
            fetchDocument(url, {
                signal,
                retries: 0,
                timeoutMs: 10000,
                maxRedirects: 4,
                validateUrl,
            }),
            signal,
        );
        signal.throwIfAborted();
        validateUrl(new URL(document.url));
        return document;
    };
    const addFailure = (error: unknown, url: string) => {
        if (options.signal?.aborted)
            throw new ArticleDocumentFetchError(
                'ABORTED',
                'Archive retrieval was cancelled',
            );
        const code = signal.aborted
            ? 'ARCHIVE_TIMEOUT'
            : error instanceof ArticleDocumentFetchError
              ? error.code
              : 'ARCHIVE_REQUEST_FAILED';
        result.errors.push({
            code,
            message:
                error instanceof Error
                    ? error.message
                    : 'Archive lookup failed',
            url,
        });
        result.reasons.push(code);
        if (signal.aborted || code === 'HTTP_429') stop = true;
    };
    const accept = async (document: ArticleDocument) => {
        const parsed = parseArchiveSnapshot(document, input);
        result.reasons.push(...parsed.reasons);
        if (parsed.reasons.includes('ARCHIVE_CAPTCHA')) {
            result.errors.push({
                code: 'ARCHIVE_CAPTCHA',
                message: 'Archive requires a security check',
                url: document.url,
            });
            stop = true;
        }
        if (parsed.document) {
            result.documents.push(parsed.document);
            if (
                options.onDocument &&
                (await waitForSignal(
                    Promise.resolve(options.onDocument(parsed.document)),
                    signal,
                ))
            )
                stop = true;
        }
    };
    for (const origin of LOOKUP_ORIGINS) {
        if (stop || snapshotsFetched >= MAX_SNAPSHOTS) break;
        const lookup = new URL('/search/', origin);
        lookup.searchParams.set('q', input.url);
        try {
            const document = await fetch(lookup.toString());
            if (snapshotIdentity(document.url)) {
                if (!visited.has(document.url)) {
                    visited.add(document.url);
                    snapshotsFetched++;
                    await accept(document);
                }
                continue;
            }
            const parsed = parseArchiveLookup(document, input);
            result.reasons.push(...parsed.reasons);
            for (const code of parsed.reasons.filter(
                (reason) => reason !== 'ARCHIVE_NOT_FOUND',
            ))
                result.errors.push({
                    code,
                    message: 'Archive lookup could not be verified',
                    url: document.url,
                });
            if (parsed.reasons.includes('ARCHIVE_CAPTCHA')) {
                break;
            }
            for (const url of parsed.snapshots) {
                if (stop || snapshotsFetched >= MAX_SNAPSHOTS) break;
                if (visited.has(url)) continue;
                visited.add(url);
                snapshotsFetched++;
                try {
                    await accept(await fetch(url));
                } catch (error) {
                    addFailure(error, url);
                }
            }
        } catch (error) {
            addFailure(error, lookup.toString());
        }
    }
    result.reasons = [...new Set(result.reasons)];
    return result;
}
