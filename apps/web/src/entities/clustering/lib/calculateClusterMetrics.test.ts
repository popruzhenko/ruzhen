import { describe, expect, it } from 'vitest';

import type { ClusterArticleItem, EmbeddedArticleItem } from '../model/types';
import {
    recalculateCandidates,
    recalculateClusterArticles,
} from './calculateClusterMetrics';

const article = (
    id: string,
    embedding: number[] | null,
): ClusterArticleItem => ({
    id,
    title: id,
    summary: null,
    sourceName: null,
    country: null,
    publishedAt: null,
    status: 'EMBEDDED',
    embedding,
    similarityToCentroid: 0.99,
    isPrimary: id === 'a',
    confidence: 0.75,
});

describe('recalculateClusterArticles', () => {
    it('computes centroid and mean similarity using only embedded articles', () => {
        const input = [
            article('a', [1, 0]),
            article('b', [0, 1]),
            article('c', null),
        ];
        const result = recalculateClusterArticles(input);

        expect(result.centroid).toEqual([0.5, 0.5]);
        expect(result.averageSimilarity).toBeCloseTo(Math.SQRT1_2);
        expect(result.articles[0]).toEqual({
            ...input[0],
            similarityToCentroid: expect.closeTo(Math.SQRT1_2),
        });
        expect(result.articles[1].similarityToCentroid).toBeCloseTo(
            Math.SQRT1_2,
        );
        expect(result.articles[2].similarityToCentroid).toBeNull();
        expect(input.every((item) => item.similarityToCentroid === 0.99)).toBe(
            true,
        );
        expect(result.articles[0]).not.toBe(input[0]);
    });

    it.each([
        { name: 'empty cluster', input: [] },
        { name: 'absent embeddings', input: [article('a', null)] },
        {
            name: 'inconsistent dimensions',
            input: [article('a', [1, 2]), article('b', [1])],
        },
    ])('clears obsolete similarities for $name', ({ input }) => {
        const result = recalculateClusterArticles(input);
        expect(result.centroid).toBeNull();
        expect(result.averageSimilarity).toBe(0);
        expect(result.articles).toEqual(
            input.map((item) => ({ ...item, similarityToCentroid: null })),
        );
    });

    it('produces finite zero similarities for a zero centroid', () => {
        const result = recalculateClusterArticles([
            article('a', [1, 0]),
            article('b', [-1, 0]),
        ]);
        expect(result.centroid).toEqual([0, 0]);
        expect(
            result.articles.map((item) => item.similarityToCentroid),
        ).toEqual([0, 0]);
        expect(result.averageSimilarity).toBe(0);
    });
});

describe('recalculateCandidates', () => {
    it('sorts candidates by similarity and keeps metadata and missing embeddings', () => {
        const candidates: EmbeddedArticleItem[] = [
            article('missing', null),
            article('orthogonal', [0, 1]),
            article('match', [2, 0]),
            article('opposite', [-1, 0]),
        ];
        const result = recalculateCandidates(candidates, [1, 0]);

        expect(result.map((item) => item.id)).toEqual([
            'match',
            'orthogonal',
            'missing',
            'opposite',
        ]);
        expect(result.map((item) => item.similarityToCluster)).toEqual([
            1,
            0,
            null,
            -1,
        ]);
        expect(result[0]).toMatchObject({ title: 'match', status: 'EMBEDDED' });
        expect(candidates.map((item) => item.id)).toEqual([
            'missing',
            'orthogonal',
            'match',
            'opposite',
        ]);
    });

    it('preserves order and clears similarities when centroid is absent', () => {
        const input = [article('a', [1, 2]), article('b', [2, 1])];
        expect(recalculateCandidates(input, null)).toEqual(
            input.map((item) => ({ ...item, similarityToCluster: null })),
        );
        expect(recalculateCandidates([], [1, 0])).toEqual([]);
    });

    it('uses zero for mismatched embedding dimensions and stable order for ties', () => {
        const input = [
            article('a', [1]),
            article('b', [0, 1]),
            article('c', [0, 2]),
        ];
        const result = recalculateCandidates(input, [1, 0]);
        expect(result.map((item) => item.id)).toEqual(['a', 'b', 'c']);
        expect(result.every((item) => item.similarityToCluster === 0)).toBe(
            true,
        );
    });
});
