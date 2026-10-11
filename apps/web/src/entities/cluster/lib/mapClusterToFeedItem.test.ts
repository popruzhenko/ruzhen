import { describe, expect, it } from 'vitest';

import type { ClusterApiItem } from '../model/types';
import { mapClusterToFeedItem } from './mapClusterToFeedItem';

const cluster = (overrides: Partial<ClusterApiItem> = {}): ClusterApiItem => ({
    id: 'c1',
    humanId: 'news-1',
    title: 'Cluster',
    summary: 'Summary',
    mainCountry: 'BE',
    status: 'PUBLISHED',
    createdAt: '2026-09-02T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    publishedAt: '2026-10-01T12:00:00Z',
    averageSimilarity: 0.9,
    clusterTags: [
        { id: 't1', name: 'Politics' },
        { id: 't2', name: 'Europe' },
    ],
    _count: { blocks: 3, articleLinks: 4 },
    ...overrides,
});

describe('mapClusterToFeedItem', () => {
    it('maps public feed metadata, publication date, tags and block badges', () => {
        expect(mapClusterToFeedItem(cluster())).toEqual({
            id: 'c1',
            title: 'Cluster',
            summary: 'Summary',
            country: 'BE',
            publishedAt: 'Oct 1, 2026',
            tags: ['Politics', 'Europe'],
            badges: ['fact', 'context', 'opinion'],
            imageUrl: undefined,
        });
    });

    it('falls back to creation date and default copy when metadata is absent', () => {
        expect(
            mapClusterToFeedItem(
                cluster({
                    summary: null,
                    mainCountry: null,
                    publishedAt: null,
                    clusterTags: [],
                    _count: { blocks: 0, articleLinks: 0 },
                }),
            ),
        ).toMatchObject({
            summary: 'No summary available yet.',
            country: 'Unknown',
            publishedAt: 'Sep 2, 2026',
            tags: [],
            badges: [],
        });
    });

    it('preserves intentional empty strings and leaves input metadata unchanged', () => {
        const input = cluster({ summary: '', mainCountry: '' });
        expect(mapClusterToFeedItem(input)).toMatchObject({
            summary: '',
            country: '',
        });
        expect(input.clusterTags).toEqual([
            { id: 't1', name: 'Politics' },
            { id: 't2', name: 'Europe' },
        ]);
    });
});
