import { JSDOM } from 'jsdom';
import type { SectionArticleCandidate } from './types';

function normalizeUrl(baseUrl: string, href?: string | null): string | null {
  if (!href) return null;

  try {
    const url = new URL(href, baseUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value?: string | null): string | null {
  const text = value?.replace(/\s+/g, ' ').trim() ?? '';
  return text.length > 0 ? text : null;
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function extractSectionArticles(
  html: string,
  baseUrl: string,
): SectionArticleCandidate[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const { document } = dom.window;

  const articleNodes = Array.from(document.querySelectorAll('article'));
  const linkOnlyNodes =
    articleNodes.length > 0
      ? []
      : Array.from(document.querySelectorAll('a[href]')).slice(0, 300);

  const rawNodes = articleNodes.length > 0 ? articleNodes : linkOnlyNodes;
  const seen = new Set<string>();
  const items: SectionArticleCandidate[] = [];

  for (const node of rawNodes) {
    const linkEl =
      node.querySelector?.('a[href]') ??
      (node instanceof dom.window.HTMLAnchorElement ? node : null);

    const href = linkEl?.getAttribute('href');
    const url = normalizeUrl(baseUrl, href);

    if (!url || seen.has(url)) {
      continue;
    }

    const title =
      cleanText(
        node.querySelector?.('h1, h2, h3, [data-testid="Heading"], [role="heading"]')
          ?.textContent,
      ) ??
      cleanText(linkEl?.textContent);

    if (!title || title.length < 12) {
      continue;
    }

    const summary = cleanText(
      node.querySelector?.('p, [data-testid="Body"], .summary, .description')?.textContent,
    );

    const imageUrl = normalizeUrl(
      baseUrl,
      node.querySelector?.('img')?.getAttribute('src') ??
        node.querySelector?.('img')?.getAttribute('data-src'),
    );

    const publishedAt = parseDate(
      node.querySelector?.('time')?.getAttribute('datetime') ??
        node.querySelector?.('time')?.textContent,
    );

    seen.add(url);

    items.push({
      title,
      url,
      summary,
      publishedAt,
      imageUrl,
      raw: {
        url,
        title,
        summary,
      },
    });
  }

  return items;
}