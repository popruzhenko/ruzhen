import { describe, expect, it } from 'vitest';

import { getPublicArticlesQueryParams } from './getPublicArticlesQueryParams';
import { getPublishedDateRange } from './publicArticlesFilterHelpers';
import { initialPublicArticlesFilters } from './publicArticlesFiltersConfig';

describe('public feed date boundaries in the reader timezone', () => {
    it('does not restrict dates for All dates', () => {
        expect(getPublishedDateRange('ALL')).toEqual({});
    });

    it('uses local midnight and an exclusive end for Today and Yesterday', () => {
        const now = new Date('2026-09-09T12:00:00Z');

        expect(getPublishedDateRange('TODAY', now)).toEqual({
            publishedFrom: '2026-09-08T22:00:00.000Z',
            publishedTo: '2026-09-09T22:00:00.000Z',
        });
        expect(getPublishedDateRange('YESTERDAY', now)).toEqual({
            publishedFrom: '2026-09-07T22:00:00.000Z',
            publishedTo: '2026-09-08T22:00:00.000Z',
        });
    });

    it('keeps the existing inclusive 7 and 30 day lower boundaries', () => {
        const now = new Date('2026-09-09T12:00:00Z');

        expect(getPublishedDateRange('LAST_7_DAYS', now)).toEqual({
            publishedFrom: '2026-09-01T22:00:00.000Z',
            publishedTo: '2026-09-09T22:00:00.000Z',
        });
        expect(getPublishedDateRange('LAST_30_DAYS', now)).toEqual({
            publishedFrom: '2026-08-09T22:00:00.000Z',
            publishedTo: '2026-09-09T22:00:00.000Z',
        });
    });

    it('includes all of yesterday when daylight saving makes it 23 or 25 hours', () => {
        expect(
            getPublishedDateRange(
                'YESTERDAY',
                new Date('2026-03-30T12:00:00Z'),
            ),
        ).toEqual({
            publishedFrom: '2026-03-28T23:00:00.000Z',
            publishedTo: '2026-03-29T22:00:00.000Z',
        });
        expect(
            getPublishedDateRange(
                'YESTERDAY',
                new Date('2026-10-26T12:00:00Z'),
            ),
        ).toEqual({
            publishedFrom: '2026-10-24T22:00:00.000Z',
            publishedTo: '2026-10-25T23:00:00.000Z',
        });
    });
});

describe('public feed query parameters', () => {
    it('omits inactive filters and trims search without changing its characters', () => {
        expect(
            getPublicArticlesQueryParams(initialPublicArticlesFilters, 2, 10),
        ).toEqual({
            page: 2,
            limit: 10,
            sort: 'NEWEST',
            search: undefined,
            minSources: undefined,
            blockType: undefined,
        });

        expect(
            getPublicArticlesQueryParams(
                {
                    ...initialPublicArticlesFilters,
                    search: '  50% & news_1  ',
                    sourceCount: 'GTE_5',
                    blockType: 'WITH_OPINIONS',
                    sort: 'MOST_SOURCES',
                },
                1,
                10,
            ),
        ).toEqual({
            page: 1,
            limit: 10,
            sort: 'MOST_SOURCES',
            search: '50% & news_1',
            minSources: 5,
            blockType: 'OPINION',
        });
    });
});
