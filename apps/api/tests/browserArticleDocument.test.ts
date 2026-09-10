import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import {
    chromium,
    type Browser,
    type BrowserContext,
    type LaunchOptions,
} from 'playwright';
import {
    fetchBrowserArticleDocument,
    type FetchBrowserArticleDocumentOptions,
} from '../src/core/ingestionNews/enrich/fetchBrowserArticleDocument';
import {
    ArticleDocumentFetchError,
    fetchArticleDocument,
    fetchPublicResource,
    type ArticleHttpResponse,
    type ArticleHttpTransport,
    type FetchArticleDocumentOptions,
} from '../src/core/ingestionNews/enrich/fetchArticleDocument';

const url = 'https://publisher.example.com/news/story';
const address = { address: '93.184.216.34', family: 4 as const };
const html = (
    body = '<article><p>A complete article body.</p></article>',
    head = '',
) =>
    `<!doctype html><html><head><title>Library renovation</title>${head}</head><body>${body}</body></html>`;
const response = (
    body: string | Uint8Array,
    headers: Record<string, string> = {
        'content-type': 'text/html; charset=utf-8',
    },
    status = 200,
) => {
    let cancelled = 0;
    const value: ArticleHttpResponse = {
        status,
        headers: new Headers(headers),
        body: (async function* () {
            yield typeof body === 'string' ? Buffer.from(body) : body;
        })(),
        complete: () => true,
        cancel: () => {
            cancelled++;
        },
    };
    return { value, cancelled: () => cancelled };
};
const localOptions = (
    transport: ArticleHttpTransport,
    overrides: FetchArticleDocumentOptions = {},
): FetchArticleDocumentOptions => ({
    resolve: async () => [address],
    transport,
    retries: 0,
    ...overrides,
});
const code = (expected: string) => (error: unknown) =>
    error instanceof ArticleDocumentFetchError && error.code === expected;
const browserOptions = (
    transport: ArticleHttpTransport = async () => response(html()).value,
    overrides: FetchBrowserArticleDocumentOptions = {},
): FetchBrowserArticleDocumentOptions => ({
    resolve: async () => [address],
    transport,
    timeoutMs: 6000,
    minRenderMs: 80,
    settleMs: 80,
    ...overrides,
});

test('public resources preserve complete decoded JS/JSON bytes and pin the validated DNS address', async () => {
    for (const contentType of [
        'application/javascript',
        'text/css',
        'application/json',
    ]) {
        const bytes = Buffer.from('window.article = {"title":"Library"};');
        const compressed = gzipSync(bytes);
        const fixture = response(compressed, {
            'content-type': contentType,
            'content-encoding': 'gzip',
            'content-length': String(compressed.length),
        });
        const resource = await fetchPublicResource(
            url,
            localOptions(async (_target, options) => {
                assert.deepEqual(options.address, address);
                assert.equal(options.accept, '*/*');
                return fixture.value;
            }),
        );
        assert.deepEqual(resource.body, bytes);
        assert.equal(resource.contentType, contentType);
        assert.equal(resource.receivedBytes, compressed.length);
        assert.equal(fixture.cancelled(), 1);
    }
});

test('manual redirects return a checked absolute destination without issuing its GET', async () => {
    const requested: string[] = [];
    const resource = await fetchPublicResource(url, {
        ...localOptions(async (target) => {
            requested.push(target.href);
            return response('', { location: '/moved/story' }, 302).value;
        }),
        redirect: 'manual',
    });
    assert.equal(resource.status, 302);
    assert.equal(
        resource.headers.get('location'),
        'https://publisher.example.com/moved/story',
    );
    assert.equal(resource.body.length, 0);
    assert.deepEqual(requested, [url]);
    await assert.rejects(
        fetchPublicResource(url, {
            ...localOptions(
                async () =>
                    response('', { location: 'http://127.0.0.1/' }, 302).value,
            ),
            redirect: 'manual',
        }),
        code('BLOCKED_ADDRESS'),
    );
});

test('caller URL policy applies before the initial request and each redirect', async () => {
    let calls = 0;
    const transport: ArticleHttpTransport = async () => {
        calls++;
        return response(
            '',
            { location: '/submit/?url=https://example.com' },
            302,
        ).value;
    };
    const validateUrl = (target: URL) => {
        if (target.pathname === '/submit/')
            throw new ArticleDocumentFetchError(
                'ARCHIVE_UNSAFE_DESTINATION',
                'No archive submission',
            );
    };
    await assert.rejects(
        fetchArticleDocument(url, localOptions(transport, { validateUrl })),
        code('ARCHIVE_UNSAFE_DESTINATION'),
    );
    assert.equal(calls, 1);
    await assert.rejects(
        fetchArticleDocument(
            'https://publisher.example.com/submit/',
            localOptions(transport, { validateUrl }),
        ),
        code('ARCHIVE_UNSAFE_DESTINATION'),
    );
    assert.equal(calls, 1);
});

test('resource transport closes a response that arrives after cancellation', async () => {
    const controller = new AbortController();
    const fixture = response(html());
    let resolveResponse!: (value: ArticleHttpResponse) => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
        started = resolve;
    });
    const pending = fetchPublicResource(
        url,
        localOptions(
            () => {
                started();
                return new Promise((resolve) => {
                    resolveResponse = resolve;
                });
            },
            { signal: controller.signal },
        ),
    );
    await start;
    controller.abort();
    await assert.rejects(pending, code('ABORTED'));
    resolveResponse(fixture.value);
    await delay(0);
    assert.equal(fixture.cancelled(), 1);
});

test('browser rejects truncated source markup before launching Chromium', async () => {
    let launched = false;
    await assert.rejects(
        fetchBrowserArticleDocument(
            url,
            browserOptions(
                async () =>
                    response(html().replace('</body></html>', '')).value,
                {
                    launch: async () => {
                        launched = true;
                        throw new Error('Must not launch');
                    },
                },
            ),
        ),
        code('INCOMPLETE_HTML_DOCUMENT'),
    );
    assert.equal(launched, false);
});

test('browser cancellation before entry neither fetches nor launches', async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        fetchBrowserArticleDocument(
            url,
            browserOptions(
                async () => {
                    assert.fail('No GET after cancellation');
                },
                {
                    signal: controller.signal,
                    launch: async () => {
                        assert.fail('No launch after cancellation');
                    },
                },
            ),
        ),
        code('ABORTED'),
    );
});

test('browser cancellation returns during launch and closes the late browser', async () => {
    const controller = new AbortController();
    let resolveLaunch!: (value: Browser) => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
        started = resolve;
    });
    let closed = 0;
    const pending = fetchBrowserArticleDocument(
        url,
        browserOptions(undefined, {
            signal: controller.signal,
            launch: () => {
                started();
                return new Promise((resolve) => {
                    resolveLaunch = resolve;
                });
            },
        }),
    );
    await start;
    controller.abort();
    await assert.rejects(pending, code('ABORTED'));
    resolveLaunch({
        close: async () => {
            closed++;
        },
    } as unknown as Browser);
    await delay(0);
    assert.equal(closed, 1);
});

test('browser cancellation also closes a context created after cancellation', async () => {
    const controller = new AbortController();
    let resolveContext!: (value: BrowserContext) => void;
    let started!: () => void;
    const start = new Promise<void>((resolve) => {
        started = resolve;
    });
    let browserClosed = 0;
    let contextClosed = 0;
    const pending = fetchBrowserArticleDocument(
        url,
        browserOptions(undefined, {
            signal: controller.signal,
            launch: async () =>
                ({
                    close: async () => {
                        browserClosed++;
                    },
                    newContext: () => {
                        started();
                        return new Promise((resolve) => {
                            resolveContext = resolve;
                        });
                    },
                }) as unknown as Browser,
        }),
    );
    await start;
    controller.abort();
    await assert.rejects(pending, code('ABORTED'));
    resolveContext({
        close: async () => {
            contextClosed++;
        },
    } as unknown as BrowserContext);
    await delay(0);
    assert.equal(browserClosed, 1);
    assert.equal(contextClosed, 1);
});

test('browser uses sandboxed headless launch, a blackhole proxy and a fresh anonymous context', async () => {
    let capturedLaunch: LaunchOptions | undefined;
    let capturedContext: Parameters<Browser['newContext']>[0];
    let browserClosed = 0;
    await assert.rejects(
        fetchBrowserArticleDocument(
            url,
            browserOptions(undefined, {
                launch: async (options) => {
                    capturedLaunch = options;
                    return {
                        close: async () => {
                            browserClosed++;
                        },
                        newContext: async (
                            options: Parameters<Browser['newContext']>[0],
                        ) => {
                            capturedContext = options;
                            throw new Error('Stop at process boundary');
                        },
                    } as unknown as Browser;
                },
            }),
        ),
        code('BROWSER_RENDER_INCOMPLETE'),
    );
    assert.equal(capturedLaunch?.headless, true);
    assert.equal(capturedLaunch?.chromiumSandbox, true);
    assert.deepEqual(capturedLaunch?.proxy, {
        server: 'http://127.0.0.1:9',
        bypass: '<-loopback>',
    });
    assert.ok(capturedLaunch?.args?.includes('--disable-quic'));
    assert.ok(
        capturedLaunch?.args?.includes(
            '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ),
    );
    assert.ok(
        capturedLaunch?.args?.includes('--host-resolver-rules=MAP * ~NOTFOUND'),
    );
    assert.equal(capturedContext?.serviceWorkers, 'block');
    assert.equal(capturedContext?.acceptDownloads, false);
    assert.deepEqual(capturedContext?.storageState, {
        cookies: [],
        origins: [],
    });
    assert.equal(browserClosed, 1);
});

// Opt in after `playwright install chromium`. Every publisher response remains
// in memory behind the real checked transport; these tests never contact sites.
const chromiumFixture = {
    skip: process.env.RUZHEN_BROWSER_TESTS !== '1',
    timeout: 15000,
};
const diagnosticLaunch =
    (messages: string[]) => async (options: LaunchOptions) => {
        const browser = await chromium.launch(options);
        const newContext = browser.newContext.bind(browser);
        browser.newContext = async (options) => {
            const context = await newContext(options);
            context.on('page', (page) => {
                page.on('console', (message) =>
                    messages.push(
                        `console ${message.type()}: ${message.text()}`,
                    ),
                );
                page.on('pageerror', (error) =>
                    messages.push(`pageerror: ${error.message}`),
                );
                page.on('request', (request) =>
                    messages.push(
                        `request: ${request.method()} ${request.url()}`,
                    ),
                );
                page.on('requestfinished', (request) =>
                    messages.push(`finished: ${request.url()}`),
                );
                page.on('requestfailed', (request) =>
                    messages.push(
                        `failed: ${request.url()} ${request.failure()?.errorText}`,
                    ),
                );
            });
            return context;
        };
        return browser;
    };
const routes = (
    fixtures: Record<
        string,
        {
            body: string;
            type?: string;
            status?: number;
            headers?: Record<string, string>;
            waitMs?: number;
        }
    >,
) => {
    const requested: string[] = [];
    const transport: ArticleHttpTransport = async (target, options) => {
        assert.deepEqual(options.address, address);
        requested.push(target.href);
        const fixture = fixtures[target.href];
        assert.ok(fixture, `Unexpected publisher GET: ${target.href}`);
        if (fixture.waitMs)
            await delay(fixture.waitMs, undefined, { signal: options.signal });
        return response(
            fixture.body,
            {
                'content-type': fixture.type ?? 'text/html; charset=utf-8',
                ...fixture.headers,
            },
            fixture.status,
        ).value;
    };
    return { transport, requested };
};

test(
    'Chromium: executes JS and delayed fetch, preserves redirected origin, waits for final article text',
    chromiumFixture,
    async () => {
        const finalUrl = 'https://publisher.example.com/moved/story';
        const fixture = routes({
            [url]: { body: '', status: 302, headers: { location: finalUrl } },
            [finalUrl]: {
                body: html(
                    '<article aria-busy="true"><p>Loading article.</p></article>',
                    '<link rel="stylesheet" href="./style.css"><script defer src="./app.js"></script>',
                ),
                headers: {
                    'set-cookie':
                        'personal=must-not-enter-browser; Secure; Path=/',
                },
            },
            'https://publisher.example.com/moved/style.css': {
                body: 'article { display: block; }',
                type: 'text/css',
            },
            'https://publisher.example.com/moved/app.js': {
                body: `console.error('Unrelated analytics error');
                fetch('./article.json').then(response => response.json()).then(value => {
                    const article = document.querySelector('article');
                    article.innerHTML = '<p>' + value.first + '</p>';
                    setTimeout(() => {
                        article.innerHTML += '<p>' + value.last + '</p><p id="cookie">Cookie: ' + document.cookie + '</p>';
                        article.removeAttribute('aria-busy');
                    }, 240);
                });`,
                type: 'application/javascript',
            },
            'https://publisher.example.com/moved/article.json': {
                body: JSON.stringify({
                    first: 'The city approved the library renovation.',
                    last: 'The complete final paragraph will be published in November.',
                }),
                type: 'application/json',
                waitMs: 140,
            },
        });
        const messages: string[] = [];
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(fixture.transport, {
                launch: diagnosticLaunch(messages),
            }),
        ).catch((error) => {
            assert.fail(
                `${String(error)}\n${messages.join('\n')}\nTransport: ${fixture.requested.join(', ')}`,
            );
        });
        assert.equal(document.url, finalUrl);
        assert.match(document.html, /complete final paragraph/);
        assert.match(document.html, /id="cookie">Cookie: <\/p>/);
        assert.doesNotMatch(document.html, /aria-busy="true"/);
        assert.equal(
            fixture.requested.filter((target) => target === finalUrl).length,
            1,
        );
        assert.equal(fixture.requested.length, 5);
    },
);

test(
    'Chromium: blocks POST, sockets, popups, workers, images and child frames without publisher GETs',
    chromiumFixture,
    async () => {
        const fixture = routes({
            [url]: {
                body: html(`<article aria-busy="true"><p>Article starts.</p></article>
            <img src="http://127.0.0.1/private-image">
            <iframe src="https://other.example.com/frame"></iframe>
            <script>
                const article = document.querySelector('article');
                const blocked = window.open('https://other.example.com/popup') === null && typeof Worker === 'undefined' && typeof RTCPeerConnection === 'undefined';
                const socket = new WebSocket('ws://127.0.0.1/private-socket');
                fetch('https://other.example.com/submit', {method:'POST', body:'must not send'})
                  .catch(() => { article.innerHTML += '<p>Restricted transports blocked: ' + blocked + '</p>'; article.removeAttribute('aria-busy'); });
            </script>`),
            },
        });
        const messages: string[] = [];
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(fixture.transport, {
                launch: diagnosticLaunch(messages),
            }),
        ).catch((error) => {
            assert.fail(
                `${String(error)}\n${messages.join('\n')}\nTransport: ${fixture.requested.join(', ')}`,
            );
        });
        assert.match(document.html, /Restricted transports blocked: true<\/p>/);
        assert.deepEqual(fixture.requested, [url]);
    },
);

test(
    'Chromium: private fetch destinations never reach the HTTP transport',
    chromiumFixture,
    async () => {
        const fixture = routes({
            [url]: {
                body: html(
                    '<article aria-busy="true"><p>Loading.</p></article><script>fetch("https://169.254.169.254/latest/meta-data").catch(() => {});</script>',
                ),
            },
        });
        await assert.rejects(
            fetchBrowserArticleDocument(url, browserOptions(fixture.transport)),
            code('BLOCKED_ADDRESS'),
        );
        assert.deepEqual(fixture.requested, [url]);
    },
);

test(
    'Chromium: unknown script redirects remain blocked instead of executing with an incorrect module base',
    chromiumFixture,
    async () => {
        const fixture = routes({
            [url]: {
                body: html(
                    '<article><p>Article text.</p></article>',
                    '<script src="/app.js"></script>',
                ),
            },
            'https://publisher.example.com/app.js': {
                body: '',
                status: 302,
                headers: { location: 'https://cdn.example.com/app.js' },
            },
        });
        await assert.rejects(
            fetchBrowserArticleDocument(url, browserOptions(fixture.transport)),
            code('BROWSER_RESOURCE_REDIRECT'),
        );
        assert.deepEqual(fixture.requested, [
            url,
            'https://publisher.example.com/app.js',
        ]);
    },
);

test(
    'Chromium: failed analytics and stylesheet requests do not discard the rendered article',
    chromiumFixture,
    async () => {
        const fixture = routes({
            [url]: {
                body: html(
                    '<article><p>The complete article is already available.</p></article><script>fetch("/api/telemetry/events").catch(() => {});</script>',
                    '<link rel="stylesheet" href="/missing.css"><script src="https://www.google-analytics.com/analytics.js"></script>',
                ),
            },
            'https://publisher.example.com/missing.css': {
                body: 'Not found',
                status: 404,
            },
            'https://www.google-analytics.com/analytics.js': {
                body: 'Unauthorized',
                status: 401,
            },
            'https://publisher.example.com/api/telemetry/events': {
                body: 'Unauthorized',
                status: 401,
            },
        });
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(fixture.transport),
        );
        assert.match(
            document.html,
            /The complete article is already available/,
        );
        assert.equal(fixture.requested.length, 4);
    },
);

test(
    'Chromium: optional advertising redirects cannot abort the article or bypass checked transport',
    chromiumFixture,
    async () => {
        const fixture = routes({
            [url]: {
                body: html(
                    '<article><p>The complete article is already available.</p></article>',
                    '<script src="/advertising/banner.js"></script>',
                ),
            },
            'https://publisher.example.com/advertising/banner.js': {
                body: '',
                status: 302,
                headers: {
                    location: 'https://advertising.example.com/banner.js',
                },
            },
        });
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(fixture.transport),
        );
        assert.match(
            document.html,
            /The complete article is already available/,
        );
        assert.deepEqual(fixture.requested, [
            url,
            'https://publisher.example.com/advertising/banner.js',
        ]);
    },
);

test(
    'Chromium: stylesheet redirects retain the final origin and relative import base through checked cached bytes',
    chromiumFixture,
    async () => {
        const finalStyle = 'https://cdn.example.com/styles/article.css';
        const fixture = routes({
            [url]: {
                body: html(
                    `<article aria-busy="true"><p>Article starts.</p></article><script>
                    window.addEventListener('load', () => {
                        const article = document.querySelector('article');
                        article.innerHTML += '<p>Styles: ' + getComputedStyle(article).getPropertyValue('--article-fixture').trim() + '</p>';
                        article.removeAttribute('aria-busy');
                    });</script>`,
                    '<link rel="stylesheet" href="/old/article.css">',
                ),
            },
            'https://publisher.example.com/old/article.css': {
                body: '',
                status: 302,
                headers: { location: finalStyle },
            },
            [finalStyle]: {
                body: '@import "./nested.css"; article { display: block; }',
                type: 'text/css',
            },
            'https://cdn.example.com/styles/nested.css': {
                body: 'article { --article-fixture: correct-final-base; }',
                type: 'text/css',
            },
        });
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(fixture.transport),
        );
        assert.match(document.html, /Styles: correct-final-base<\/p>/);
        assert.deepEqual(fixture.requested, [
            url,
            'https://publisher.example.com/old/article.css',
            finalStyle,
            'https://cdn.example.com/styles/nested.css',
        ]);
    },
);

test(
    'Chromium: a stalled telemetry fetch does not masquerade as an unfinished article request',
    chromiumFixture,
    async () => {
        let telemetryStarted = false;
        let telemetryCancelled = false;
        const document = await fetchBrowserArticleDocument(
            url,
            browserOptions(async (target, options) => {
                if (target.href === url)
                    return response(
                        html(
                            '<article><p>The complete article is already available.</p></article><script>fetch("/telemetry/events").catch(() => {});</script>',
                        ),
                    ).value;
                assert.equal(target.pathname, '/telemetry/events');
                telemetryStarted = true;
                options.signal.addEventListener('abort', () => {
                    telemetryCancelled = true;
                });
                return new Promise(() => undefined);
            }),
        );
        assert.match(
            document.html,
            /The complete article is already available/,
        );
        assert.equal(telemetryStarted, true);
        assert.equal(telemetryCancelled, true);
    },
);

test(
    'Chromium: failed article data and unknown publisher scripts still prevent acceptance',
    chromiumFixture,
    async () => {
        for (const source of [
            '<script>fetch("/api/article-body").catch(() => document.querySelector("article").removeAttribute("aria-busy"));</script>',
            '<script src="https://cdn.example.com/article-app.js"></script>',
        ]) {
            await assert.rejects(
                fetchBrowserArticleDocument(
                    url,
                    browserOptions(async (target) =>
                        target.href === url
                            ? response(
                                  html(
                                      '<article aria-busy="true"><p>A complete-looking teaser.</p></article>' +
                                          source,
                                  ),
                              ).value
                            : response('Unauthorized', {}, 401).value,
                    ),
                ),
                code('HTTP_401'),
            );
        }
    },
);

test(
    'Chromium: refuses a human verification page',
    chromiumFixture,
    async () => {
        await assert.rejects(
            fetchBrowserArticleDocument(
                url,
                browserOptions(
                    async () =>
                        response(
                            html(
                                '<main><h1>Verify you are human</h1><p>Complete verification to read this article.</p></main>',
                            ),
                        ).value,
                ),
            ),
            code('BROWSER_CHALLENGE'),
        );
    },
);

test(
    'Chromium: a busy or continuously changing article cannot be certified at the deadline',
    chromiumFixture,
    async () => {
        for (const body of [
            '<article aria-busy="true"><p>A rendered teaser with an unfinished article request.</p></article>',
            '<article><p>Article starts.</p></article><script>setInterval(() => document.querySelector("article").append(" Still rendering."), 20);</script>',
        ]) {
            await assert.rejects(
                fetchBrowserArticleDocument(
                    url,
                    browserOptions(async () => response(html(body)).value, {
                        timeoutMs: 1400,
                        settleMs: 140,
                    }),
                ),
                code('BROWSER_RENDER_TIMEOUT'),
            );
        }
    },
);

test(
    'Chromium: pending essential fetch and caller cancellation never return partial HTML',
    chromiumFixture,
    async () => {
        const controller = new AbortController();
        let fetchStarted!: () => void;
        const started = new Promise<void>((resolve) => {
            fetchStarted = resolve;
        });
        let launched: Browser | undefined;
        const pending = fetchBrowserArticleDocument(
            url,
            browserOptions(
                async (target) => {
                    if (target.href === url)
                        return response(
                            html(
                                '<article><p>A complete-looking teaser.</p></article><script>fetch("/pending.json").catch(() => {});</script>',
                            ),
                        ).value;
                    fetchStarted();
                    return new Promise(() => undefined);
                },
                {
                    signal: controller.signal,
                    launch: async (options) => {
                        launched = await chromium.launch(options);
                        return launched;
                    },
                },
            ),
        );
        try {
            await Promise.race([
                started,
                pending.then(() =>
                    assert.fail('Returned before essential fetch'),
                ),
            ]);
            await delay(200);
            controller.abort();
            await assert.rejects(pending, code('ABORTED'));
            assert.equal(launched?.isConnected(), false);
        } finally {
            controller.abort();
            await pending.catch(() => undefined);
        }
    },
);

test(
    'Chromium: rejects an oversized rendered body without truncating it',
    chromiumFixture,
    async () => {
        await assert.rejects(
            fetchBrowserArticleDocument(
                url,
                browserOptions(
                    async () =>
                        response(
                            html(
                                '<article></article><script>document.querySelector("article").textContent = "Complete paragraph. ".repeat(400);</script>',
                            ),
                        ).value,
                    { maxBytes: 1800 },
                ),
            ),
            code('RESPONSE_TOO_LARGE'),
        );
    },
);

test(
    'Chromium: enforces request count and aggregate byte limits before accepting rendered content',
    chromiumFixture,
    async () => {
        const source = html(
            '<article><p>Article text.</p></article>',
            '<script src="/app.js"></script>',
        );
        const script = `document.querySelector('article').append(' Final paragraph.');/*${'x'.repeat(400)}*/`;
        for (const limits of [
            { maxRequests: 1 },
            {
                maxTotalBytes:
                    Buffer.byteLength(source) + Buffer.byteLength(script) - 1,
            },
        ]) {
            const fixture = routes({
                [url]: { body: source },
                'https://publisher.example.com/app.js': {
                    body: script,
                    type: 'application/javascript',
                },
            });
            await assert.rejects(
                fetchBrowserArticleDocument(
                    url,
                    browserOptions(fixture.transport, limits),
                ),
                code('BROWSER_RESOURCE_LIMIT'),
            );
            if ('maxRequests' in limits)
                assert.deepEqual(fixture.requested, [url]);
        }
    },
);

test(
    'Chromium: a stalled essential fetch is bounded by the rendering deadline',
    chromiumFixture,
    async () => {
        await assert.rejects(
            fetchBrowserArticleDocument(
                url,
                browserOptions(
                    async (target) => {
                        if (target.href === url)
                            return response(
                                html(
                                    '<article><p>A complete-looking teaser.</p></article><script>fetch("/pending.json").catch(() => {});</script>',
                                ),
                            ).value;
                        return new Promise(() => undefined);
                    },
                    { timeoutMs: 1400 },
                ),
            ),
            code('BROWSER_RENDER_TIMEOUT'),
        );
    },
);
