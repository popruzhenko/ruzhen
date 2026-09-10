import assert from 'node:assert/strict';
import test from 'node:test';
import { retrieveArticleContent } from '../src/core/ingestionNews/enrich/retrieveArticleContent';

const url = 'https://publisher.example/news/river-monitoring';
const title = 'New river monitoring network opens to residents';
const publishedAt = '2026-09-09T10:00:00.000Z';
const author = 'Maya Chen';
const paragraphs = [
    'Residents opened a river monitoring station beside the old railway bridge on Wednesday. The volunteers will publish water measurements every week so that nearby communities can follow changes throughout the year.',
    'Maya Chen said the first samples were collected shortly before 7am (02:00 GMT) while the river was calm. Laboratory staff checked each container before carrying the samples to the regional research centre.',
    'The project received funding after a public meeting about pollution along the river. Its organisers promised to publish the spending records and invite independent researchers to review the findings next spring.',
];
const expectedText = paragraphs.join('\n\n');
const escapeHtml = (text: string) =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
const paragraph = (text: string) => `<p>${escapeHtml(text)}</p>`;
const body = paragraphs.map(paragraph).join('');

function page(
    article: string,
    options: {
        canonical?: string;
        structured?: Record<string, unknown>;
        outside?: string;
    } = {},
) {
    return `<!doctype html><html><head>
        <title>${escapeHtml(title)}</title>
        <link rel="canonical" href="${escapeHtml(options.canonical ?? url)}">
        <meta property="og:title" content="${escapeHtml(title)}">
        <meta name="author" content="${author}">
        <meta property="article:published_time" content="${publishedAt}">
        ${options.structured ? `<script type="application/ld+json">${JSON.stringify(options.structured)}</script>` : ''}
        </head><body>${article}${options.outside ?? ''}</body></html>`;
}

function retrieve(html: string, requestedUrl = url) {
    return retrieveArticleContent(
        { url: requestedUrl, title, publishedAt },
        {
            fetchDocument: async () => ({
                url: requestedUrl,
                html,
                contentType: 'text/html; charset=utf-8',
                receivedBytes: Buffer.byteLength(html),
            }),
        },
    );
}

function structuredArticle(articleBody: string) {
    return {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: title,
        datePublished: publishedAt,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        author: { '@type': 'Person', name: author },
        articleBody,
    };
}

test('selects the matching article on an infinite-scroll page instead of a longer unrelated story', async () => {
    const unrelated = Array.from(
        { length: 6 },
        (_, index) =>
            `Football match ${index + 1} took place at the national stadium last weekend. The visiting team scored twice during the closing minutes and qualified for the championship final.`,
    )
        .map(paragraph)
        .join('');
    const result = await retrieve(
        page(
            `<main><article><h1>${title}</h1>${body}</article><article><h1>Football team qualifies for championship final</h1>${unrelated}</article></main>`,
        ),
    );
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('rejects a body with a conflicting local headline even when the page metadata matches', async () => {
    const result = await retrieve(
        page(
            `<article><h1>Football team qualifies for championship final</h1>${body}</article>`,
        ),
    );
    assert.equal(result.candidate, null);
    assert.ok(result.reasons.includes('TITLE_MISMATCH'));
});

test('retains sibling article-body sections directly under the document body', async () => {
    const result = await retrieve(
        page(
            `<div class="article-body">${paragraph(paragraphs[0])}</div><div class="article-body">${paragraphs.slice(1).map(paragraph).join('')}</div>`,
        ),
    );
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('preserves an inline author mention even without publisher author metadata', async () => {
    const html = page(
        `<article>${paragraph(paragraphs[0])}<p>She thanked <a rel="author">Maria Smith</a>.</p>${paragraph(paragraphs[2])}</article>`,
    ).replace(/<meta name="author"[^>]*>/, '');
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        [paragraphs[0], 'She thanked Maria Smith.', paragraphs[2]].join('\n\n'),
    );
});

test('extracts the article paragraphs across interleaved recommendations and advertising in an Al Jazeera layout', async () => {
    const html = page(`<main id="main-content-area">
        <h1>${title}</h1>
        <p class="article-header__sub-title">A short introductory description that belongs to the page header.</p>
        <div class="byline byline--single-avatar">By ${author}</div>
        <div class="date-published"><time>${publishedAt}</time></div>
        <div class="wysiwyg wysiwyg--all-content">
            ${paragraph(paragraphs[0])}
            <section class="more-on"><h2>Recommended Stories</h2><ul><li><a href="/unrelated">A different report about local schools</a></li></ul></section>
            ${paragraph(paragraphs[1])}
            <div class="container--ads in-article-ads">Advertisement</div>
            ${paragraph(paragraphs[2])}
        </div>
        </main>`);
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('extracts BBC article blocks without the byline, timestamp or video caption', async () => {
    const html = page(`<article class="ssrcss-abc-ArticleWrapper e1nh2i2l0">
        <h1>${title}</h1>
        <div data-component="byline-block"><span class="byline-link-text">${author}</span><span>Environment correspondent</span></div>
        <time data-testid="timestamp">9 September 2026</time>
        <figure><img src="/river.jpg"><figcaption>Figure caption, Watch: How the river station was assembled.</figcaption></figure>
        ${paragraphs.map((text) => `<div data-component="text-block">${paragraph(text)}</div>`).join('')}
        </article>`);
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('keeps ProPublica-style article prose while excluding newsletter, image attribution and audio duration', async () => {
    const html = page(`<article class="wp-block-group p-grid-text-container">
        <h1>${title}</h1>
        <div class="wp-block-propublica-byline">by ${author}</div>
        <time>September 9, 2026, 10:00 am</time>
        <span class="wp-block-propublica-news-over-audio-listen-button__timestamp">14:16</span>
        <div class="wp-block-group article-body">
            <div class="newsletter"><p>Our nonprofit newsroom investigates abuses of power. Sign up for Dispatches to receive the next report.</p></div>
            ${paragraph(paragraphs[0])}
            <figure><img src="/station.jpg"><figcaption class="attribution"><span class="attribution__caption">The new station beside the bridge.</span><span class="attribution__credit">Photo: Regional News</span></figcaption></figure>
            ${paragraphs.slice(1).map(paragraph).join('')}
        </div>
        </article>`);
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('preserves genuine subheadings, ordered prose and list entries between article paragraphs', async () => {
    const heading = 'What volunteers will measure';
    const items = [
        'Temperature readings will help researchers compare conditions throughout the seasons.',
        'Turbidity measurements will reveal changes after rainstorms in the surrounding hills.',
    ];
    const html = page(`<article><h1>${title}</h1>
        ${paragraph(paragraphs[0])}<h2>${heading}</h2>
        <ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>
        ${paragraphs.slice(1).map(paragraph).join('')}</article>`);
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        [paragraphs[0], heading, ...items, ...paragraphs.slice(1)].join('\n\n'),
    );
    assert.equal(result.candidate.assessment.fullText, true);
});

test('preserves times, author names and words about advertising inside narrative sentences', async () => {
    const narrative =
        'Reporter Maya Chen met volunteers at 10:45 GMT to discuss advertising near the river. They said the advertisement on a nearby wall would remain until the council reviewed its permit.';
    const html = page(`<article><h1>${title}</h1>${paragraph(paragraphs[0])}
        <p>Reporter <a rel="author" href="/author/maya-chen">Maya Chen</a> met volunteers at <time datetime="2026-09-09T10:45:00Z">10:45 GMT</time> to discuss advertising near the river. They said the advertisement on a nearby wall would remain until the council reviewed its permit.</p>
        ${paragraph(paragraphs[2])}</article>`);
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        [paragraphs[0], narrative, paragraphs[2]].join('\n\n'),
    );
    assert.equal(result.candidate.assessment.fullText, true);
});

test('cleans JSON-LD body metadata without merging or reordering its article paragraphs', async () => {
    const structured = structuredArticle(
        [
            title,
            `By ${author}`,
            'Published on 9 September 2026, 10:00 GMT',
            '03:42',
            paragraphs[0],
            'Advertisement',
            paragraphs[1],
            paragraphs[2],
            'Source: Regional News Agency',
        ].join('\n\n'),
    );
    const result = await retrieve(page('<article></article>', { structured }));
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.method, 'JSON_LD');
    assert.equal(result.candidate.assessment.fullText, true);
});

test('removes a JSON-LD paywall message from saved prose while retaining its incomplete-content evidence', async () => {
    const structured = structuredArticle(
        `${expectedText}\n\nSubscribe to continue reading.`,
    );
    const result = await retrieve(page('<article></article>', { structured }));
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, false);
    assert.equal(result.candidate.assessment.signals.paywall, true);
});

test('removes a continuation link label while retaining JSON-LD truncation evidence', async () => {
    const structured = structuredArticle(`${expectedText}\n\nContinue reading`);
    const result = await retrieve(page('<article></article>', { structured }));
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, false);
    assert.equal(result.candidate.assessment.signals.truncated, true);
});

test('hidden subscription widgets do not make an otherwise complete article partial', async () => {
    for (const hidden of [
        'hidden',
        'aria-hidden="true"',
        'style="display: none"',
        'style="visibility: hidden"',
    ]) {
        const html = page(
            `<article>${body}<div ${hidden}><div class="paywall">Subscribe to continue reading.</div></div></article>`,
        );
        const result = await retrieve(html);
        assert.equal(result.candidate?.content, expectedText, hidden);
        assert.equal(result.candidate.assessment.fullText, true, hidden);
        assert.equal(
            result.candidate.assessment.signals.paywall,
            false,
            hidden,
        );
    }
});

test('a visible access wall keeps an article partial even after its message is removed from the body', async () => {
    const html = page(
        `<article>${body}<div class="paywall">Subscribe to continue reading.</div></article>`,
    );
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, false);
    assert.equal(result.candidate.assessment.signals.paywall, true);
});

test('BBC RSS campaign parameters do not conflict with the canonical article URL', async () => {
    const requestedUrl = `${url}?at_medium=RSS&at_campaign=rss`;
    const result = await retrieve(
        page(`<article>${body}</article>`),
        requestedUrl,
    );
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
    assert.equal(result.candidate.assessment.signals.identityMatched, true);
});

test('accepts a syndicated article whose structured mainEntityOfPage explicitly identifies the requested page', async () => {
    const html = page(`<article>${body}</article>`, {
        canonical: 'https://wire.example/reports/river-monitoring',
        structured: structuredArticle(expectedText),
    });
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
    assert.equal(result.candidate.assessment.signals.identityMatched, true);
});

test('rejects another publisher canonical without structured evidence tying the article to the requested page', async () => {
    const html = page(`<article>${body}</article>`, {
        canonical: 'https://unrelated.example/reports/river-monitoring',
    });
    const result = await retrieve(html);
    assert.equal(result.candidate, null);
    assert.ok(result.reasons.includes('ARTICLE_IDENTITY_UNCONFIRMED'));
});

test('rejects a different same-publisher canonical despite matching article text and structured page metadata', async () => {
    const html = page(`<article>${body}</article>`, {
        canonical: 'https://publisher.example/news/different-river-report',
        structured: structuredArticle(expectedText),
    });
    const result = await retrieve(html);
    assert.equal(result.candidate, null);
    assert.ok(result.reasons.includes('ARTICLE_IDENTITY_UNCONFIRMED'));
});

test('chooses the main article rather than a richer text container inside related-content recommendations', async () => {
    const unrelated = [
        'A touring orchestra announced plans for a summer concert in the central park. Musicians will perform beside the fountain while visitors can borrow folding chairs from the information desk.',
        'Ticket sales will open on Monday after organisers finish the accessibility review. The programme includes an afternoon rehearsal for students and an evening performance for families across the region.',
        'Several local businesses offered equipment for the concert after meeting with the festival committee. All remaining proceeds will support music lessons at schools that cannot afford to purchase instruments.',
    ];
    const html = page(
        `<main><article><h1>${title}</h1>${paragraphs.slice(0, 2).map(paragraph).join('')}</article>
        <aside class="related-content"><h2>Related stories</h2><div class="wysiwyg">${unrelated.map(paragraph).join('')}</div></aside></main>`,
    );
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        paragraphs.slice(0, 2).join('\n\n'),
    );
    assert.equal(result.candidate.assessment.fullText, true);
});

test('retains every sibling body section instead of selecting only the longest article-body container', async () => {
    const html = page(`<article><h1>${title}</h1>
        <section class="article-body">${paragraphs.slice(0, 2).map(paragraph).join('')}</section>
        <section class="article-body">${paragraph(paragraphs[2])}</section>
        </article>`);
    const result = await retrieve(html);
    assert.equal(result.candidate?.content, expectedText);
    assert.equal(result.candidate.assessment.fullText, true);
});

test('keeps semantic time and author links when they are part of short article sentences', async () => {
    const html = page(`<article>${paragraph(paragraphs[0])}
        <p>It began at <time datetime="2026-09-09T10:30:00Z">10:30</time>.</p>
        <p><a rel="author" href="/people/maria-smith">Maria Smith</a> spoke.</p>
        ${paragraph(paragraphs[2])}</article>`);
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        [
            paragraphs[0],
            'It began at 10:30.',
            'Maria Smith spoke.',
            paragraphs[2],
        ].join('\n\n'),
    );
    assert.equal(result.candidate.assessment.fullText, true);
});

test('keeps financial article prose whose share-price class is unrelated to social sharing', async () => {
    const financial =
        'The supplier announced a rise in its share price after investors reviewed the river monitoring contract. Analysts said the new equipment orders would support production at the local factory through winter.';
    const html = page(`<article>${paragraph(paragraphs[0])}
        <p class="share-price">${financial}</p>
        ${paragraph(paragraphs[2])}</article>`);
    const result = await retrieve(html);
    assert.equal(
        result.candidate?.content,
        [paragraphs[0], financial, paragraphs[2]].join('\n\n'),
    );
    assert.equal(result.candidate.assessment.fullText, true);
});

test('preserves reporting about subscribers without treating that sentence as an access wall', async () => {
    const narrative =
        'Subscribers only access to the report angered local residents.';
    const text = [paragraphs[0], narrative, paragraphs[2]].join('\n\n');
    const fixtures = [
        page(
            `<article>${paragraph(paragraphs[0])}${paragraph(narrative)}${paragraph(paragraphs[2])}</article>`,
        ),
        page('<article></article>', { structured: structuredArticle(text) }),
    ];
    for (const html of fixtures) {
        const result = await retrieve(html);
        assert.equal(result.candidate?.content, text);
        assert.equal(result.candidate.assessment.fullText, true);
        assert.equal(result.candidate.assessment.signals.paywall, false);
    }
});
