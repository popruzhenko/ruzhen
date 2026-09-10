import { setTimeout as delay } from 'node:timers/promises';
import {
    chromium,
    type Browser,
    type BrowserContext,
    type LaunchOptions,
    type Page,
    type Request,
} from 'playwright';
import {
    ArticleDocumentFetchError,
    decodeArticleResourceText,
    fetchPublicResource,
    type ArticleDocument,
    type FetchArticleDocumentOptions,
    type PublicArticleResource,
} from './fetchArticleDocument';

export interface FetchBrowserArticleDocumentOptions extends Pick<
    FetchArticleDocumentOptions,
    | 'signal'
    | 'resolve'
    | 'transport'
    | 'maxBytes'
    | 'maxRedirects'
    | 'validateUrl'
> {
    timeoutMs?: number;
    maxResourceBytes?: number;
    maxTotalBytes?: number;
    maxRequests?: number;
    /** Minimum observation after load, followed by a stable article body. */
    minRenderMs?: number;
    settleMs?: number;
    /** Process boundary injection for offline fixtures and cancellation tests. */
    launch?: (options: LaunchOptions) => Promise<Browser>;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        promise.then(resolve, reject).finally(() => {
            signal.removeEventListener('abort', abort);
        });
        if (signal.aborted) abort();
    });
}

function completeSourceHtml(resource: PublicArticleResource): void {
    const html = decodeArticleResourceText(resource.body, resource.contentType);
    // Chromium repairs truncated markup. Check the publisher bytes before that
    // repair can turn an incomplete response into apparently complete evidence.
    if (
        !/<html(?:\s|>)/i.test(html) ||
        !/<\/html\s*>\s*(?:<!--[\s\S]*?-->\s*)*$/i.test(html) ||
        (/<body(?:\s|>)/i.test(html) && !/<\/body\s*>/i.test(html)) ||
        (html.match(/<script(?:\s|>)/gi)?.length ?? 0) !==
            (html.match(/<\/script\s*>/gi)?.length ?? 0)
    )
        throw new ArticleDocumentFetchError(
            'INCOMPLETE_HTML_DOCUMENT',
            'Publisher HTML is incomplete before browser rendering',
        );
}

function fulfillmentHeaders(resource: PublicArticleResource) {
    const headers: Record<string, string> = {};
    for (const [name, value] of resource.headers) {
        // Body bytes are already decoded. No cookies, alternate network routes,
        // background refresh or download instructions enter the browser context.
        if (
            !/^(?:content-encoding|content-length|transfer-encoding|connection|keep-alive|proxy-authenticate|proxy-authorization|trailer|upgrade|set-cookie|set-cookie2|alt-svc|refresh|content-disposition|report-to|reporting-endpoints|nel)$/i.test(
                name,
            )
        )
            headers[name] = value;
    }
    return headers;
}

const permittedResources = new Set([
    'document',
    'script',
    'stylesheet',
    'xhr',
    'fetch',
]);

function optionalResource(request: Request): boolean {
    if (request.resourceType() === 'document') return false;
    if (request.resourceType() === 'stylesheet') return true;
    const target = new URL(request.url());
    // Recognize services and endpoint names, not arbitrary third-party hosts:
    // publishers also load the article itself from separate APIs and CDNs.
    return (
        /(?:^|\.)(?:google-analytics\.com|googletagmanager\.com|doubleclick\.net|googlesyndication\.com|scorecardresearch\.com|chartbeat\.com|chartbeat\.net|parsely\.com|quantserve\.com|adnxs\.com|taboola\.com|outbrain\.com)$/i.test(
            target.hostname,
        ) ||
        /^\/(?:api\/(?:v\d+\/)?)?(?:analytics|telemetry|tracking|advertising|ads|beacon|pixel)(?:[\/._-]|$)/i.test(
            target.pathname,
        )
    );
}

function fatalResourceError(error: ArticleDocumentFetchError): boolean {
    return /^(?:BLOCKED_ADDRESS|INVALID_URL|UNSAFE_URL|BROWSER_RESOURCE_LIMIT|BROWSER_UNEXPECTED_NAVIGATION)$/.test(
        error.code,
    );
}

/**
 * Render anonymous publisher HTML. Chromium never performs publisher HTTP:
 * every allowed GET is fulfilled by the DNS-pinned, bounded Node transport.
 */
export async function fetchBrowserArticleDocument(
    value: string,
    options: FetchBrowserArticleDocumentOptions = {},
): Promise<ArticleDocument> {
    const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 30000, 60000));
    const maxBytes = Math.max(1, options.maxBytes ?? 4 * 1024 * 1024);
    const maxResourceBytes = Math.max(
        1,
        options.maxResourceBytes ?? 2 * 1024 * 1024,
    );
    const maxTotalBytes = Math.max(
        1,
        options.maxTotalBytes ?? 20 * 1024 * 1024,
    );
    const maxRequests = Math.max(1, Math.min(options.maxRequests ?? 80, 200));
    const minRenderMs = Math.max(0, options.minRenderMs ?? 1500);
    const settleMs = Math.max(1, options.settleMs ?? 750);
    const deadline = Date.now() + timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let failure: ArticleDocumentFetchError | undefined;
    let totalBytes = 0;
    let receivedBytes = 0;
    let requestCount = 0;
    let lastActivity = Date.now();
    const pending = new Set<Request>();
    const redirectedStylesheets = new Map<string, PublicArticleResource>();
    const intentionalAborts = new WeakSet<Request>();
    const fail = (error: ArticleDocumentFetchError) => {
        failure ??= error;
        controller.abort();
    };
    const account = (resource: PublicArticleResource) => {
        totalBytes += Math.max(
            resource.receivedBytes,
            resource.body.byteLength,
        );
        receivedBytes += resource.receivedBytes;
        if (totalBytes > maxTotalBytes)
            throw new ArticleDocumentFetchError(
                'BROWSER_RESOURCE_LIMIT',
                'Browser exceeded its total response size limit',
            );
    };
    const fetchOptions = {
        signal,
        resolve: options.resolve,
        transport: options.transport,
        validateUrl: options.validateUrl,
        retries: 0,
        timeoutMs,
    };
    try {
        signal.throwIfAborted();
        // Playwright does not call route handlers for subsequent requests in an
        // HTTP redirect chain. Resolve the main chain here, then navigate to its
        // final URL with cached bytes, preserving document origin and base URLs.
        const initial = await fetchPublicResource(value, {
            ...fetchOptions,
            maxBytes: Math.min(maxBytes, maxTotalBytes),
            maxRedirects: options.maxRedirects,
            requireHtml: true,
            accept: 'text/html,application/xhtml+xml',
        });
        completeSourceHtml(initial);
        account(initial);
        requestCount++;
        const launching = (
            options.launch ?? ((input) => chromium.launch(input))
        )({
            headless: true,
            channel: 'chromium',
            chromiumSandbox: true,
            timeout: Math.max(1, deadline - Date.now()),
            proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
            ignoreDefaultArgs: ['--disable-popup-blocking'],
            args: [
                '--disable-quic',
                '--disable-background-networking',
                '--disable-component-update',
                '--host-resolver-rules=MAP * ~NOTFOUND',
                '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
                '--webrtc-ip-handling-policy=disable_non_proxied_udp',
            ],
        });
        void launching.then(
            (lateBrowser) => {
                if (signal.aborted)
                    void lateBrowser.close().catch(() => undefined);
            },
            () => undefined,
        );
        browser = await abortable(launching, signal);
        const creatingContext = browser.newContext({
            serviceWorkers: 'block',
            acceptDownloads: false,
            permissions: [],
            storageState: { cookies: [], origins: [] },
            viewport: { width: 1280, height: 900 },
        });
        void creatingContext.then(
            (lateContext) => {
                if (signal.aborted)
                    void lateContext.close().catch(() => undefined);
            },
            () => undefined,
        );
        context = await abortable(creatingContext, signal);
        await abortable(
            context.addInitScript(() => {
                // These transports do not belong to the GET-only article path.
                for (const name of [
                    'WebTransport',
                    'RTCPeerConnection',
                    'webkitRTCPeerConnection',
                    'Worker',
                    'SharedWorker',
                ])
                    Object.defineProperty(globalThis, name, {
                        value: undefined,
                        writable: false,
                        configurable: false,
                    });
                Object.defineProperty(window, 'open', {
                    value: () => null,
                    writable: false,
                    configurable: false,
                });
            }),
            signal,
        );
        await abortable(
            context.routeWebSocket(/.*/, (socket) =>
                socket.close({
                    code: 1008,
                    reason: 'Article retrieval blocks sockets',
                }),
            ),
            signal,
        );
        let servedInitial = false;
        await abortable(
            context.route(/.*/, async (route, request) => {
                const type = request.resourceType();
                const optional = optionalResource(request);
                const abort = async () => {
                    intentionalAborts.add(request);
                    await route.abort('blockedbyclient').catch(() => undefined);
                };
                if (
                    signal.aborted ||
                    request.method() !== 'GET' ||
                    !permittedResources.has(type)
                ) {
                    await abort();
                    return;
                }
                try {
                    // Includes first popup and child-frame requests, which can
                    // arrive before the corresponding page-created event.
                    if (
                        !page ||
                        request.frame().page() !== page ||
                        request.frame() !== page.mainFrame()
                    ) {
                        await abort();
                        return;
                    }
                    if (!optional) {
                        pending.add(request);
                        lastActivity = Date.now();
                    }
                    let resource: PublicArticleResource;
                    if (type === 'document') {
                        if (servedInitial || request.url() !== initial.url)
                            throw new ArticleDocumentFetchError(
                                'BROWSER_UNEXPECTED_NAVIGATION',
                                'Publisher attempted another browser navigation',
                            );
                        servedInitial = true;
                        resource = initial;
                    } else {
                        if (++requestCount > maxRequests)
                            throw new ArticleDocumentFetchError(
                                'BROWSER_RESOURCE_LIMIT',
                                'Browser exceeded its request count limit',
                            );
                        const cachedStylesheet =
                            type === 'stylesheet'
                                ? redirectedStylesheets.get(request.url())
                                : undefined;
                        if (cachedStylesheet) {
                            redirectedStylesheets.delete(request.url());
                            resource = cachedStylesheet;
                        } else {
                            resource = await fetchPublicResource(
                                request.url(),
                                {
                                    ...fetchOptions,
                                    redirect:
                                        type === 'stylesheet'
                                            ? 'follow'
                                            : 'manual',
                                    maxRedirects: options.maxRedirects,
                                    timeoutMs: optional
                                        ? Math.min(timeoutMs, 5000)
                                        : timeoutMs,
                                    maxBytes: Math.min(
                                        maxResourceBytes,
                                        maxTotalBytes,
                                    ),
                                },
                            );
                            if (resource.status >= 300 && resource.status < 400)
                                throw new ArticleDocumentFetchError(
                                    'BROWSER_RESOURCE_REDIRECT',
                                    `Cannot preserve redirected script or data URL semantics: ${request.url()}`,
                                );
                            account(resource);
                            if (
                                type === 'stylesheet' &&
                                resource.url !== request.url()
                            ) {
                                // Returning redirected CSS at its old URL would
                                // resolve @import/url() against the wrong base.
                                // A new, intercepted GET for the checked final
                                // URL consumes these cached bytes without another
                                // publisher request or any browser network access.
                                redirectedStylesheets.set(
                                    resource.url,
                                    resource,
                                );
                                await route.fulfill({
                                    status: 200,
                                    contentType: 'text/css; charset=utf-8',
                                    body: `@import url(${JSON.stringify(resource.url)});`,
                                });
                                return;
                            }
                        }
                    }
                    if (signal.aborted) {
                        await abort();
                        return;
                    }
                    await route.fulfill({
                        status: resource.status,
                        headers: fulfillmentHeaders(resource),
                        body: resource.body,
                    });
                } catch (error) {
                    const fetchError =
                        error instanceof ArticleDocumentFetchError
                            ? error
                            : new ArticleDocumentFetchError(
                                  'BROWSER_RENDER_INCOMPLETE',
                                  `Article rendering resource failed: ${request.url()}`,
                              );
                    if (
                        !signal.aborted &&
                        (!optional || fatalResourceError(fetchError))
                    )
                        fail(
                            new ArticleDocumentFetchError(
                                fetchError.code,
                                `${fetchError.message} (${request.url()})`,
                                fetchError.retryable,
                            ),
                        );
                    await abort();
                }
            }),
            signal,
        );
        context.on('requestfinished', (request) => {
            if (pending.delete(request)) lastActivity = Date.now();
        });
        context.on('requestfailed', (request) => {
            if (pending.delete(request)) {
                lastActivity = Date.now();
                if (!signal.aborted && !intentionalAborts.has(request))
                    fail(
                        new ArticleDocumentFetchError(
                            'BROWSER_RENDER_INCOMPLETE',
                            'An article rendering request did not finish',
                        ),
                    );
            }
        });
        page = await abortable(context.newPage(), signal);
        context.on('page', (extraPage) => {
            if (extraPage !== page)
                void extraPage.close().catch(() => undefined);
        });
        page.on('download', (download) => {
            void download.cancel().catch(() => undefined);
            fail(
                new ArticleDocumentFetchError(
                    'BROWSER_DOWNLOAD_BLOCKED',
                    'Publisher attempted a file download',
                ),
            );
        });
        page.on(
            'dialog',
            (dialog) => void dialog.dismiss().catch(() => undefined),
        );
        await abortable(
            page.goto(initial.url, {
                waitUntil: 'load',
                timeout: Math.max(1, deadline - Date.now()),
            }),
            signal,
        );
        const loadedAt = Date.now();
        let previousSignature = '';
        let stableSince = loadedAt;
        while (true) {
            signal.throwIfAborted();
            const captureHtml =
                pending.size === 0 &&
                Date.now() - loadedAt >= minRenderMs &&
                Date.now() - Math.max(stableSince, lastActivity) >= settleMs;
            const snapshot = await abortable(
                page.evaluate(
                    ({ captureHtml, maxBytes }) => {
                        const body = document.body;
                        const article =
                            document.querySelector<HTMLElement>(
                                'article, [itemprop="articleBody"], main',
                            ) ?? body;
                        const text = (article?.innerText ?? '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        const pageText = (body?.innerText ?? '').replace(
                            /\s+/g,
                            ' ',
                        );
                        const challenge =
                            /(?:verify (?:that )?you (?:are|['’]re) human|checking your browser|performing security verification|enable javascript and cookies to continue|please complete the security check|подтвердите[, ]+что вы человек)/iu.test(
                                pageText,
                            ) ||
                            /^(?:just a moment|access denied|security verification|attention required)[.!\s]*$/i.test(
                                document.title,
                            ) ||
                            Array.from(
                                document.querySelectorAll<HTMLElement>(
                                    '#challenge-running, #challenge-stage, #challenge-form, [id^="cf-chl-"], [data-testid="challenge-page"]',
                                ),
                            ).some(
                                (element) => !!element.getClientRects().length,
                            );
                        const signature = JSON.stringify([
                            text,
                            document.title,
                            document
                                .querySelector('link[rel="canonical"]')
                                ?.getAttribute('href'),
                            Array.from(
                                document.querySelectorAll(
                                    'script[type="application/ld+json"]',
                                ),
                            ).map((node) => node.textContent),
                        ]);
                        // Serialize in this same task so body readiness and its
                        // exact returned HTML cannot race another publisher timer.
                        const html = captureHtml
                            ? document.documentElement.outerHTML
                            : null;
                        const oversized =
                            text.length > maxBytes ||
                            signature.length > maxBytes ||
                            (html !== null && html.length > maxBytes);
                        return {
                            ready: document.readyState === 'complete',
                            text: oversized ? '' : text,
                            html: oversized ? null : html,
                            oversized,
                            busy:
                                !!article?.matches('[aria-busy="true"]') ||
                                !!article?.querySelector(
                                    '[aria-busy="true"], [data-loading="true"]',
                                ),
                            challenge,
                            signature: oversized ? '' : signature,
                        };
                    },
                    { captureHtml, maxBytes },
                ),
                signal,
            );
            if (snapshot.oversized)
                throw new ArticleDocumentFetchError(
                    'RESPONSE_TOO_LARGE',
                    'Rendered article exceeds the document size limit',
                );
            if (snapshot.challenge)
                throw new ArticleDocumentFetchError(
                    'BROWSER_CHALLENGE',
                    'Publisher requires human or security verification',
                );
            const now = Date.now();
            if (snapshot.signature !== previousSignature) {
                previousSignature = snapshot.signature;
                stableSince = now;
            }
            // Stability is evidence from a bounded observation window, not a
            // claim that arbitrary future publisher timers can never run.
            if (
                snapshot.ready &&
                snapshot.text &&
                snapshot.html &&
                !snapshot.busy &&
                pending.size === 0 &&
                now - loadedAt >= minRenderMs &&
                now - Math.max(stableSince, lastActivity) >= settleMs
            ) {
                const html = snapshot.html;
                signal.throwIfAborted();
                if (Buffer.byteLength(html) > maxBytes)
                    throw new ArticleDocumentFetchError(
                        'RESPONSE_TOO_LARGE',
                        'Rendered article exceeds the document size limit',
                    );
                const renderedUrl = new URL(page.url());
                if (renderedUrl.origin !== new URL(initial.url).origin)
                    throw new ArticleDocumentFetchError(
                        'BROWSER_UNEXPECTED_NAVIGATION',
                        'Browser left the checked publisher origin',
                    );
                options.validateUrl?.(renderedUrl);
                return {
                    html,
                    url: renderedUrl.toString(),
                    contentType: 'text/html; charset=utf-8',
                    receivedBytes,
                };
            }
            await delay(100, undefined, { signal });
        }
    } catch (error) {
        if (options.signal?.aborted)
            throw new ArticleDocumentFetchError(
                'ABORTED',
                'Browser retrieval was cancelled',
            );
        if (failure) throw failure;
        if (signal.aborted || Date.now() >= deadline)
            throw new ArticleDocumentFetchError(
                'BROWSER_RENDER_TIMEOUT',
                'Article rendering did not finish within the browser deadline',
                true,
            );
        if (error instanceof ArticleDocumentFetchError) throw error;
        throw new ArticleDocumentFetchError(
            browser ? 'BROWSER_RENDER_INCOMPLETE' : 'BROWSER_UNAVAILABLE',
            browser
                ? 'Browser could not finish rendering the article'
                : 'Chromium could not be started',
            true,
        );
    } finally {
        clearTimeout(timer);
        controller.abort();
        // Closing the browser also cancels pending routes and closes its fresh,
        // nonpersistent context. Late launches/context creation close above.
        await Promise.all([
            context?.close().catch(() => undefined),
            browser?.close().catch(() => undefined),
        ]);
    }
}
