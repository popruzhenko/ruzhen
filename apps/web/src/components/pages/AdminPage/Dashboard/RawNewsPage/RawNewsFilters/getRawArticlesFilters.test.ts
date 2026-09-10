import { describe, expect, it } from 'vitest';
import {
    getRawArticlesFilters,
    initialRawNewsFilters,
} from './getRawArticlesFilters';

describe('raw article server filters', () => {
    it('omits inactive filters and preserves literal search/source values', () => {
        expect(getRawArticlesFilters(initialRawNewsFilters)).toEqual({});
        expect(
            getRawArticlesFilters({
                ...initialRawNewsFilters,
                search: '  50% _report  ',
                sourceName: 'Example & Co',
                status: 'REVIEWED',
                contentAvailability: 'FULL_TEXT',
                onlyProblematic: true,
            }),
        ).toEqual({
            search: '50% _report',
            sourceName: 'Example & Co',
            status: 'REVIEWED',
            contentAvailability: 'FULL_TEXT',
            onlyProblematic: true,
        });
    });

    it('uses local calendar days across both DST changes', () => {
        const spring = getRawArticlesFilters(
            { ...initialRawNewsFilters, fetchedDate: 'TODAY' },
            new Date('2026-03-29T12:00:00+02:00'),
        );
        expect(spring).toEqual({
            fetchedFrom: '2026-03-28T23:00:00.000Z',
            fetchedTo: '2026-03-29T22:00:00.000Z',
        });
        const autumn = getRawArticlesFilters(
            { ...initialRawNewsFilters, fetchedDate: 'YESTERDAY' },
            new Date('2026-10-26T12:00:00+01:00'),
        );
        expect(autumn).toEqual({
            fetchedFrom: '2026-10-24T22:00:00.000Z',
            fetchedTo: '2026-10-25T23:00:00.000Z',
        });
    });

    it('includes later articles fetched today in last 7/30 days', () => {
        const now = new Date('2026-04-01T12:00:00+02:00');
        expect(
            getRawArticlesFilters(
                { ...initialRawNewsFilters, fetchedDate: 'LAST_7_DAYS' },
                now,
            ),
        ).toEqual({
            fetchedFrom: '2026-03-24T23:00:00.000Z',
            fetchedTo: '2026-04-01T22:00:00.000Z',
        });
        expect(
            getRawArticlesFilters(
                { ...initialRawNewsFilters, fetchedDate: 'LAST_30_DAYS' },
                now,
            ),
        ).toEqual({
            fetchedFrom: '2026-03-01T23:00:00.000Z',
            fetchedTo: '2026-04-01T22:00:00.000Z',
        });
    });
});
