import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { promisify } from 'node:util';
import { brotliDecompress, gunzip, inflate } from 'node:zlib';

export interface ArticleDocument {
    html: string;
    url: string;
    contentType: string;
    receivedBytes: number;
}

export interface ResolvedArticleAddress {
    address: string;
    family: 4 | 6;
}

export interface ArticleHttpResponse {
    status: number;
    headers: Headers;
    body: AsyncIterable<Uint8Array>;
    cancel: () => void;
    complete?: () => boolean;
}

export type ArticleHttpTransport = (
    url: URL,
    options: {
        signal: AbortSignal;
        address: ResolvedArticleAddress;
        accept?: string;
    },
) => Promise<ArticleHttpResponse>;

export interface FetchArticleDocumentOptions {
    signal?: AbortSignal;
    resolve?: (hostname: string) => Promise<ResolvedArticleAddress[]>;
    transport?: ArticleHttpTransport;
    timeoutMs?: number;
    maxBytes?: number;
    maxRedirects?: number;
    retries?: number;
    /** Additional caller policy, checked before the initial and redirected GET. */
    validateUrl?: (url: URL) => void;
}

export interface PublicArticleResource {
    url: string;
    status: number;
    headers: Headers;
    contentType: string;
    /** Complete, decompressed bytes; receivedBytes counts the wire body. */
    body: Buffer;
    receivedBytes: number;
}

export interface FetchPublicResourceOptions extends FetchArticleDocumentOptions {
    redirect?: 'follow' | 'manual';
    accept?: string;
    requireHtml?: boolean;
}

export class ArticleDocumentFetchError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly retryable = false,
    ) {
        super(message);
        this.name = 'ArticleDocumentFetchError';
    }
}

const blockedIpv4 = new BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 3],
] as const)
    blockedIpv4.addSubnet(address, prefix, 'ipv4');
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const blockedIpv6 = new BlockList();
for (const [address, prefix] of [
    ['2001::', 32],
    ['2001:2::', 48],
    ['2001:10::', 28],
    ['2001:20::', 28],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
] as const)
    blockedIpv6.addSubnet(address, prefix, 'ipv6');

export function isPublicArticleAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !blockedIpv4.check(address, 'ipv4');
    if (family === 6)
        return (
            globalIpv6.check(address, 'ipv6') &&
            !blockedIpv6.check(address, 'ipv6')
        );
    return false;
}

function checkedUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new ArticleDocumentFetchError(
            'INVALID_URL',
            'Article URL is invalid',
        );
    }
    const hostname = url.hostname
        .replace(/^\[|\]$/g, '')
        .replace(/\.$/, '')
        .toLowerCase();
    if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        (url.port && url.port !== '80' && url.port !== '443')
    ) {
        throw new ArticleDocumentFetchError(
            'UNSAFE_URL',
            'Article URL must use public HTTP(S) without credentials or custom ports',
        );
    }
    if (
        !hostname ||
        /(?:^|\.)(?:localhost|local|internal|home|lan|onion)$/.test(hostname) ||
        (isIP(hostname) && !isPublicArticleAddress(hostname))
    ) {
        throw new ArticleDocumentFetchError(
            'BLOCKED_ADDRESS',
            'Article URL does not identify a public host',
        );
    }
    url.hash = '';
    return url;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () =>
            reject(signal.reason ?? new Error('Request aborted'));
        signal.addEventListener('abort', abort, { once: true });
        promise
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
        if (signal.aborted) abort();
    });
}

const resolvePublicHost = async (
    url: URL,
    resolver: NonNullable<FetchArticleDocumentOptions['resolve']>,
    signal: AbortSignal,
) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    const family = isIP(hostname);
    const addresses = family
        ? [{ address: hostname, family: family as 4 | 6 }]
        : await abortable(resolver(hostname), signal);
    if (
        addresses.length === 0 ||
        addresses.some(
            ({ address, family: resolvedFamily }) =>
                !isPublicArticleAddress(address) ||
                isIP(address) !== resolvedFamily,
        )
    ) {
        throw new ArticleDocumentFetchError(
            'BLOCKED_ADDRESS',
            'Article host resolves to a private, reserved or invalid address',
        );
    }
    return addresses[0];
};

// Pin the address checked above. A separate global fetch() would resolve DNS a
// second time and allow rebinding between validation and the actual connection.
const nativeTransport: ArticleHttpTransport = (
    url,
    { signal, address, accept },
) =>
    new Promise((resolve, reject) => {
        const request = (
            url.protocol === 'https:' ? httpsRequest : httpRequest
        )(
            url,
            {
                method: 'GET',
                signal,
                agent: false,
                family: address.family,
                lookup: (_hostname, _options, callback) =>
                    callback(null, address.address, address.family),
                headers: {
                    Accept: accept ?? 'text/html,application/xhtml+xml',
                    'Accept-Encoding': 'identity',
                    'User-Agent': 'RuzhenArticleFetcher/1.0',
                },
            },
            (response) => {
                const headers = new Headers();
                for (const [name, value] of Object.entries(response.headers)) {
                    if (value !== undefined)
                        headers.set(
                            name,
                            Array.isArray(value) ? value.join(', ') : value,
                        );
                }
                response.on('error', () => undefined);
                resolve({
                    status: response.statusCode ?? 0,
                    headers,
                    body: response,
                    cancel: () => {
                        response.destroy();
                        request.destroy();
                    },
                    complete: () => response.complete,
                });
            },
        );
        request.on('error', reject);
        request.end();
    });

async function readResource(
    response: ArticleHttpResponse,
    url: URL,
    maxBytes: number,
    signal: AbortSignal,
    requireHtml: boolean,
): Promise<PublicArticleResource> {
    const contentType = response.headers.get('content-type') ?? '';
    if (
        requireHtml &&
        !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|\s*$)/i.test(
            contentType,
        )
    ) {
        throw new ArticleDocumentFetchError(
            'INVALID_CONTENT_TYPE',
            'Article response is not an HTML document',
        );
    }
    const declaredLengthText = response.headers.get('content-length');
    const declaredLength =
        declaredLengthText && /^\d+$/.test(declaredLengthText)
            ? Number(declaredLengthText)
            : null;
    if (declaredLength !== null && declaredLength > maxBytes) {
        throw new ArticleDocumentFetchError(
            'RESPONSE_TOO_LARGE',
            'Article document exceeds the response size limit',
        );
    }
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    const iterator = response.body[Symbol.asyncIterator]();
    while (true) {
        const part = await abortable(iterator.next(), signal);
        if (part.done) break;
        receivedBytes += part.value.byteLength;
        if (receivedBytes > maxBytes)
            throw new ArticleDocumentFetchError(
                'RESPONSE_TOO_LARGE',
                'Article document exceeds the response size limit',
            );
        chunks.push(Buffer.from(part.value));
    }
    if (
        response.complete?.() === false ||
        (declaredLength !== null && receivedBytes !== declaredLength)
    ) {
        throw new ArticleDocumentFetchError(
            'INCOMPLETE_RESPONSE',
            'Article response ended before the complete document was received',
            true,
        );
    }
    if (receivedBytes === 0 && requireHtml)
        throw new ArticleDocumentFetchError(
            'EMPTY_RESPONSE',
            'Article response is empty',
        );
    let bytes: Buffer = Buffer.concat(chunks);
    const encoding = (response.headers.get('content-encoding') ?? 'identity')
        .trim()
        .toLowerCase();
    if (encoding !== 'identity') {
        const decoder =
            encoding === 'gzip'
                ? promisify(gunzip)
                : encoding === 'br'
                  ? promisify(brotliDecompress)
                  : encoding === 'deflate'
                    ? promisify(inflate)
                    : null;
        if (!decoder)
            throw new ArticleDocumentFetchError(
                'UNSUPPORTED_ENCODING',
                'Article response uses an unsupported content encoding',
            );
        try {
            bytes = await abortable(
                decoder(bytes, { maxOutputLength: maxBytes }),
                signal,
            );
        } catch (error) {
            if (signal.aborted) throw error;
            throw new ArticleDocumentFetchError(
                'INVALID_COMPRESSED_RESPONSE',
                'Article response is damaged or exceeds the decompressed size limit',
            );
        }
    }
    return {
        url: url.toString(),
        status: response.status,
        headers: new Headers(response.headers),
        contentType,
        body: bytes,
        receivedBytes,
    };
}

export function decodeArticleResourceText(
    bytes: Uint8Array,
    contentType: string,
): string {
    const charset =
        /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1] ?? 'utf-8';
    try {
        return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {
        throw new ArticleDocumentFetchError(
            'INVALID_TEXT_ENCODING',
            'Article response cannot be decoded completely',
        );
    }
}

/** GET-only public HTTP transport shared by HTML retrieval and browser routes. */
export async function fetchPublicResource(
    value: string,
    options: FetchPublicResourceOptions = {},
): Promise<PublicArticleResource> {
    const initial = checkedUrl(value);
    options.validateUrl?.(new URL(initial));
    const resolver =
        options.resolve ??
        (async (hostname: string) =>
            (await lookup(hostname, { all: true })).map(
                ({ address, family }) => ({ address, family: family as 4 | 6 }),
            ));
    const transport = options.transport ?? nativeTransport;
    const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
    const retries = Math.max(0, Math.min(options.retries ?? 1, 2));
    const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 4, 8));
    let lastError: Error = new ArticleDocumentFetchError(
        'REQUEST_FAILED',
        'Article request failed',
    );
    for (let attempt = 0; attempt <= retries; attempt++) {
        const deadline = AbortSignal.timeout(options.timeoutMs ?? 15000);
        const signal = options.signal
            ? AbortSignal.any([options.signal, deadline])
            : deadline;
        try {
            let url = new URL(initial);
            for (let redirects = 0; ; redirects++) {
                signal.throwIfAborted();
                const address = await resolvePublicHost(url, resolver, signal);
                const pendingResponse = transport(url, {
                    signal,
                    address,
                    accept: options.accept ?? '*/*',
                });
                // A DI transport or a delayed connection may finish after abort.
                // Dispose that response even when the caller has already returned.
                void pendingResponse.then(
                    (response) => {
                        if (signal.aborted) response.cancel();
                    },
                    () => undefined,
                );
                const response = await abortable(pendingResponse, signal);
                try {
                    if ([301, 302, 303, 307, 308].includes(response.status)) {
                        const location = response.headers.get('location');
                        if (!location)
                            throw new ArticleDocumentFetchError(
                                'INVALID_REDIRECT',
                                'Article redirect is missing a destination',
                            );
                        const destination = checkedUrl(
                            new URL(location, url).toString(),
                        );
                        options.validateUrl?.(new URL(destination));
                        if (options.redirect === 'manual') {
                            const headers = new Headers(response.headers);
                            headers.set('location', destination.toString());
                            return {
                                url: url.toString(),
                                status: response.status,
                                headers,
                                contentType: headers.get('content-type') ?? '',
                                body: Buffer.alloc(0),
                                receivedBytes: 0,
                            };
                        }
                        if (redirects >= maxRedirects)
                            throw new ArticleDocumentFetchError(
                                'TOO_MANY_REDIRECTS',
                                'Article request exceeded the redirect limit',
                            );
                        url = destination;
                        continue;
                    }
                    if (response.status < 200 || response.status >= 300) {
                        throw new ArticleDocumentFetchError(
                            `HTTP_${response.status}`,
                            `Publisher returned HTTP ${response.status}`,
                            [408, 429, 500, 502, 503, 504].includes(
                                response.status,
                            ),
                        );
                    }
                    return await readResource(
                        response,
                        url,
                        maxBytes,
                        signal,
                        options.requireHtml ?? false,
                    );
                } finally {
                    response.cancel();
                }
            }
        } catch (error) {
            if (options.signal?.aborted)
                throw new ArticleDocumentFetchError(
                    'ABORTED',
                    'Article request was cancelled',
                );
            lastError = signal.aborted
                ? new ArticleDocumentFetchError(
                      'FETCH_TIMEOUT',
                      'Article request timed out',
                      true,
                  )
                : error instanceof ArticleDocumentFetchError
                  ? error
                  : new ArticleDocumentFetchError(
                        'REQUEST_FAILED',
                        error instanceof Error
                            ? error.message
                            : 'Article request failed',
                        true,
                    );
            if (
                !(lastError instanceof ArticleDocumentFetchError) ||
                !lastError.retryable ||
                attempt === retries
            )
                throw lastError;
        }
    }
    throw lastError;
}

export async function fetchArticleDocument(
    value: string,
    options: FetchArticleDocumentOptions = {},
): Promise<ArticleDocument> {
    const resource = await fetchPublicResource(value, {
        ...options,
        accept: 'text/html,application/xhtml+xml',
        requireHtml: true,
    });
    return {
        html: decodeArticleResourceText(resource.body, resource.contentType),
        url: resource.url,
        contentType: resource.contentType,
        receivedBytes: resource.receivedBytes,
    };
}
