import { describe, expect, it } from 'vitest';

import {
    ARTICLE_STATUS,
    isClusteringArticleStatus,
} from '../model/articleConstants';
import type { ArticleApiItem } from '../model/types';
import { mapArticleToRawNewsItem } from './mapArticleToRawNewsItem';

const article = (overrides: Partial<ArticleApiItem> = {}): ArticleApiItem => ({
    id: 'a1',
    sourceId: 's1',
    url: 'https://publisher.test/article',
    title: 'Article title',
    summary: ' Summary ',
    content: 'Content',
    imageUrl: 'https://publisher.test/image.jpg',
    publishedAt: '2026-10-01T12:00:00Z',
    language: 'en',
    country: 'BE',
    status: 'EMBEDDED',
    createdAt: '2026-10-02T12:00:00Z',
    updatedAt: '2026-10-03T12:00:00Z',
    contentAvailability: 'FULL_TEXT',
    cleanedAccessibleText: 'Clean text',
    cleaningMethod: 'READABILITY',
    embeddingBasis: 'CONTENT',
    embeddingModel: 'model',
    embedding: [1, 2],
    fullTextVerified: true,
    source: { id: 's1', name: 'Publisher', baseUrl: 'https://publisher.test' },
    raw: { id: 'r1', fetchedAt: '2026-10-02T11:00:00Z', parserVersion: 'v1' },
    _count: { clusterLinks: 2, clusterCandidates: 3 },
    ...overrides,
});

describe('mapArticleToRawNewsItem', () => {
    it('maps article metadata and derives pipeline state', () => {
        const input = article();
        const result = mapArticleToRawNewsItem(input);
        expect(result).toMatchObject({
            id: 'a1',
            sourceId: 's1',
            url: input.url,
            title: input.title,
            summary: input.summary,
            content: input.content,
            preview: 'Summary',
            imageUrl: input.imageUrl,
            status: 'EMBEDDED',
            createdAt: input.createdAt,
            updatedAt: input.updatedAt,
            publishedAt: input.publishedAt,
            sourceName: 'Publisher',
            sourceBaseUrl: 'https://publisher.test',
            fetchedAt: input.raw?.fetchedAt,
            country: 'BE',
            language: 'en',
            embedding: [1, 2],
            contentAvailability: 'FULL_TEXT',
            embeddingBasis: 'CONTENT',
            cleaningMethod: 'READABILITY',
            embeddingModel: 'model',
            parserVersion: 'v1',
            fullTextVerified: true,
            clusterLinksCount: 2,
            clusterCandidatesCount: 3,
            pipeline: {
                fetched: true,
                cleaned: true,
                embedded: true,
                clustered: true,
            },
        });
        expect(input.summary).toBe(' Summary ');
    });

    it('handles nullable fields from legacy and incomplete articles', () => {
        const result = mapArticleToRawNewsItem(
            article({
                title: null,
                summary: null,
                content: null,
                raw: null,
                source: null,
                country: null,
                language: null,
                embedding: null,
                contentAvailability: null,
                embeddingBasis: null,
                cleaningMethod: null,
                embeddingModel: null,
                cleanedAccessibleText: null,
                fullTextVerified: undefined,
                status: 'NEW',
                _count: { clusterLinks: 0, clusterCandidates: 0 },
            }),
        );
        expect(result).toMatchObject({
            title: 'Untitled article',
            sourceName: 'Unknown source',
            country: 'Unknown',
            language: 'Unknown',
            fetchedAt: null,
            sourceBaseUrl: null,
            preview: 'No article text available.',
            fullTextVerified: false,
            pipeline: {
                fetched: false,
                cleaned: false,
                embedded: false,
                clustered: false,
            },
        });
        expect(result.embeddingBasis).toBe('—');
        expect(result.cleaningMethod).toBe('—');
        expect(result.embeddingModel).toBe('—');
        expect(result.parserVersion).toBe('—');
    });

    it.each([
        [{ summary: null }, 'Clean text'],
        [{ summary: '', cleanedAccessibleText: null }, 'Content'],
        [
            { summary: null, cleanedAccessibleText: '', content: '  ' },
            'No article text available.',
        ],
        [{ summary: 'x'.repeat(260) }, 'x'.repeat(260)],
        [{ summary: `  ${'x'.repeat(261)}  ` }, `${'x'.repeat(260)}...`],
    ])('selects and truncates preview text', (overrides, expected) => {
        expect(mapArticleToRawNewsItem(article(overrides)).preview).toBe(
            expected,
        );
    });

    it.each(Object.values(ARTICLE_STATUS))(
        'derives embedded and clustered stages for %s',
        (status) => {
            const result = mapArticleToRawNewsItem(
                article({
                    status,
                    _count: { clusterLinks: 0, clusterCandidates: 0 },
                }),
            );
            expect(result.pipeline.embedded).toBe(
                ['EMBEDDED', 'CLUSTERED'].includes(status),
            );
            expect(result.pipeline.clustered).toBe(status === 'CLUSTERED');
        },
    );

    it('preserves explicitly empty values instead of replacing them', () => {
        expect(
            mapArticleToRawNewsItem(
                article({
                    title: '',
                    summary: '',
                    country: '',
                    language: '',
                    embedding: [],
                }),
            ),
        ).toMatchObject({
            title: '',
            summary: '',
            country: '',
            language: '',
            embedding: [],
        });
    });
});

describe('isClusteringArticleStatus', () => {
    it.each(Object.values(ARTICLE_STATUS))(
        'allows only usable article statuses: %s',
        (status) => {
            expect(isClusteringArticleStatus(status)).toBe(
                ['APPROVED', 'EMBEDDED', 'CLUSTERED'].includes(status),
            );
        },
    );
});
