import type { PrismaClient } from '@prisma/client';
import { fetchRssFeed } from './fetchRssFeed';
import { fetchText } from '../shared/fetchText';
import { parseRssXml } from './parseRssXml';
import { extractRssItems } from './extractRssItems';
import { extractSectionArticles } from './extractSectionArticles';
import { saveParsedArticles } from './saveParsedArticles';
import { isPoliticsArticle } from './politics.constants';
import {
  mapFeedItemToArticleInput,
  mapSectionItemToArticleInput,
} from './mapArticleCandidate';
import type { ParseSourceInput, RunParseResult } from './types';
import { normalizeArticleCandidate } from '../../normalize/article/normalizeArticleCandidate';
import { isBlockedArticleUrl } from './isBlockedArticleUrl';
import { isAllowedSourceArticleUrl } from './isAllowedSourceArticleUrl';

export async function runParseForSource(
  prisma: PrismaClient,
  source: ParseSourceInput,
): Promise<RunParseResult> {
  if (source.fetchMode === 'RSS') {
    const xml = await fetchRssFeed(source.baseUrl);
    const parsedXml = parseRssXml(xml);
    const items = extractRssItems(parsedXml);

    const filteredItems = (source.politicsOnly
      ? items.filter((item) =>
          isPoliticsArticle({
            title: item.title,
            summary: item.summary ?? item.description,
            url: item.link,
          }),
        )
      : items
    ).filter((item) => {
      const url = item.link ?? '';
      return (
        !isBlockedArticleUrl(url) &&
        isAllowedSourceArticleUrl({
          sourceName: source.name,
          url,
        })
      );
    });
    const candidates = filteredItems
      .map((item) => mapFeedItemToArticleInput(source, item))
      .map((candidate) => normalizeArticleCandidate(candidate));

    const result = await saveParsedArticles(prisma, candidates);

    await prisma.source.update({
      where: { id: source.id },
      data: { lastFetchedAt: new Date() },
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      fetchedItems: filteredItems.length,
      ...result,
    };
  }

  const html = await fetchText(source.baseUrl);
  const sectionItems = extractSectionArticles(html, source.baseUrl);

  const filteredItems = (source.politicsOnly
    ? sectionItems.filter((item) =>
        isPoliticsArticle({
          title: item.title,
          summary: item.summary,
          url: item.url,
        }),
      )
    : sectionItems
  ).filter((item) => {
    return (
      !isBlockedArticleUrl(item.url) &&
      isAllowedSourceArticleUrl({
        sourceName: source.name,
        url: item.url,
      })
    );
  });

  const candidates = filteredItems
    .map((item) => mapSectionItemToArticleInput(source, item))
    .map((candidate) => normalizeArticleCandidate(candidate));

  const result = await saveParsedArticles(prisma, candidates);

  await prisma.source.update({
    where: { id: source.id },
    data: { lastFetchedAt: new Date() },
  });

  return {
    sourceId: source.id,
    sourceName: source.name,
    fetchedItems: filteredItems.length,
    ...result,
  };
}