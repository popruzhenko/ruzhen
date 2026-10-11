import { describe, expect, it } from 'vitest';

import { calculateCentroid } from './calculateCentroid';

describe('calculateCentroid', () => {
    it('averages every coordinate without modifying input vectors', () => {
        const vectors = [
            [1, 2, -3],
            [3, 4, 0],
            [2, 9, 6],
        ];
        expect(calculateCentroid(vectors)).toEqual([2, 5, 1]);
        expect(vectors).toEqual([
            [1, 2, -3],
            [3, 4, 0],
            [2, 9, 6],
        ]);
    });

    it('returns a copy for a single vector', () => {
        const vector = [1, 2];
        expect(calculateCentroid([vector])).toEqual(vector);
        expect(calculateCentroid([vector])).not.toBe(vector);
    });

    it.each([
        { name: 'no vectors', vectors: [] },
        { name: 'inconsistent dimensions', vectors: [[1, 2], [3]] },
        { name: 'mixed empty and nonempty vectors', vectors: [[], [1]] },
    ])('rejects $name', ({ vectors }) =>
        expect(calculateCentroid(vectors)).toBeNull(),
    );

    it('handles zero dimensions and canceling coordinates', () => {
        expect(calculateCentroid([[], []])).toEqual([]);
        expect(
            calculateCentroid([
                [1, -2],
                [-1, 2],
            ]),
        ).toEqual([0, 0]);
    });
});
