import { describe, expect, it } from 'vitest';

import { cosineSimilarity } from './cosineSimilarity';

describe('cosineSimilarity', () => {
    it.each([
        [[1, 2], [2, 4], 1],
        [[1, 0], [0, 1], 0],
        [[1, 2], [-1, -2], -1],
        [[0, 0], [1, 2], 0],
        [[1, 2], [0, 0], 0],
        [[], [], 0],
        [[1], [1, 2], 0],
    ])('compares %j and %j', (a, b, expected) => {
        expect(cosineSimilarity(a, b)).toBeCloseTo(expected);
    });

    it('is symmetric, ignores positive scaling, and preserves input vectors', () => {
        const a = [1, 3, -2];
        const b = [4, -1, 2];
        const expected = -3 / Math.sqrt(14 * 21);

        expect(cosineSimilarity(a, b)).toBeCloseTo(expected);
        expect(cosineSimilarity(b, a)).toBeCloseTo(expected);
        expect(
            cosineSimilarity(
                a.map((n) => n * 5),
                b,
            ),
        ).toBeCloseTo(expected);
        expect(a).toEqual([1, 3, -2]);
        expect(b).toEqual([4, -1, 2]);
    });
});
