import { describe, expect, it } from 'vitest';
import { getSimilarityThreshold } from './SimilarityThresholdHelper';
import { getSourceCountThreshold } from './SourceCountThresholdHelper';

describe('dashboard filter thresholds', () => {
    it.each([
        ['ALL', null],
        ['GT_070', 0.7],
        ['GT_075', 0.75],
        ['GT_080', 0.8],
        ['GT_085', 0.85],
    ] as const)('maps similarity filter %s to %s', (filter, expected) => {
        expect(getSimilarityThreshold(filter)).toBe(expected);
    });

    it.each([
        ['ALL', null],
        ['GTE_2', 2],
        ['GTE_3', 3],
        ['GTE_5', 5],
        ['GTE_10', 10],
    ] as const)('maps source count filter %s to %s', (filter, expected) => {
        expect(getSourceCountThreshold(filter)).toBe(expected);
    });
});
