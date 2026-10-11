import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDateInFetchedRange } from './DateHelper';

describe('dashboard date filters', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-29T12:00:00+02:00'));
    });

    it('includes missing and invalid dates when no date filter is active', () => {
        for (const value of [null, undefined, '', 'invalid']) {
            expect(isDateInFetchedRange(value, 'ALL')).toBe(true);
            expect(isDateInFetchedRange(value, 'TODAY')).toBe(false);
        }
    });

    it('uses the whole local calendar day across the spring DST transition', () => {
        expect(isDateInFetchedRange('2026-03-28T23:00:00Z', 'TODAY')).toBe(
            true,
        );
        expect(isDateInFetchedRange('2026-03-29T21:59:59.999Z', 'TODAY')).toBe(
            true,
        );
        expect(isDateInFetchedRange('2026-03-28T22:59:59.999Z', 'TODAY')).toBe(
            false,
        );
        expect(isDateInFetchedRange('2026-03-29T22:00:00Z', 'TODAY')).toBe(
            false,
        );
    });

    it('calculates yesterday as a calendar day across the autumn DST transition', () => {
        vi.setSystemTime(new Date('2026-10-26T12:00:00+01:00'));
        expect(isDateInFetchedRange('2026-10-24T22:00:00Z', 'YESTERDAY')).toBe(
            true,
        );
        expect(
            isDateInFetchedRange('2026-10-25T22:59:59.999Z', 'YESTERDAY'),
        ).toBe(true);
        expect(
            isDateInFetchedRange('2026-10-24T21:59:59.999Z', 'YESTERDAY'),
        ).toBe(false);
        expect(isDateInFetchedRange('2026-10-25T23:00:00Z', 'YESTERDAY')).toBe(
            false,
        );
    });

    it.each([
        ['LAST_7_DAYS', '2026-03-21T23:00:00Z'],
        ['LAST_30_DAYS', '2026-02-26T23:00:00Z'],
    ] as const)(
        'bounds %s between the first local midnight and now',
        (filter, start) => {
            expect(isDateInFetchedRange(start, filter)).toBe(true);
            expect(
                isDateInFetchedRange(
                    new Date(new Date(start).getTime() - 1).toISOString(),
                    filter,
                ),
            ).toBe(false);
            expect(isDateInFetchedRange('2026-03-29T10:00:00Z', filter)).toBe(
                true,
            );
            expect(
                isDateInFetchedRange('2026-03-29T10:00:00.001Z', filter),
            ).toBe(false);
        },
    );
});
