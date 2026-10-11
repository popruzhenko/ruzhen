import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EnrichmentArticleSnapshot } from '../../../../../../../entities/article-enrichment/model/types';
import { EnrichmentContentComparison } from './EnrichmentContentComparison';

const snapshot = (
    overrides: Partial<EnrichmentArticleSnapshot> = {},
): EnrichmentArticleSnapshot => ({
    title: null,
    summary: null,
    content: null,
    cleanedAccessibleText: null,
    contentAvailability: null,
    ...overrides,
});

const section = (title: string) =>
    within(screen.getByRole('heading', { name: title }).closest('section')!);

describe('enrichment content comparison', () => {
    it('keeps saved and proposed text distinct and shows the verification status for each', () => {
        render(
            <EnrichmentContentComparison
                proposedLabel="Retrieved proposal"
                current={snapshot({
                    title: 'Saved title',
                    summary: 'Saved summary',
                    content: 'Saved body',
                    cleanedAccessibleText: 'Unused saved fallback',
                    contentAvailability: 'PARTIAL_TEXT',
                })}
                proposed={snapshot({
                    title: 'Retrieved title',
                    summary: 'Retrieved summary',
                    content: 'Verified full body',
                    contentAvailability: 'FULL_TEXT',
                    contentAssessment: {
                        version: 1,
                        textHash: 'hash',
                        fullText: true,
                        method: 'READABILITY',
                        reasons: [],
                    },
                })}
            />,
        );
        const saved = section('Current saved content');
        const proposed = section('Retrieved proposal');
        expect(saved.getByText('Saved body')).toBeInTheDocument();
        expect(saved.getByText('PARTIAL TEXT')).toBeInTheDocument();
        expect(saved.getByText('10 characters')).toBeInTheDocument();
        expect(
            saved.queryByText('Unused saved fallback'),
        ).not.toBeInTheDocument();
        expect(saved.queryByText('Retrieved summary')).not.toBeInTheDocument();
        expect(proposed.getByText('Verified full body')).toBeInTheDocument();
        expect(proposed.getByText('Full text verified')).toBeInTheDocument();
        expect(proposed.getByText('18 characters')).toBeInTheDocument();
        expect(proposed.queryByText('Saved summary')).not.toBeInTheDocument();
    });

    it('falls back to cleaned accessible text and distinguishes an empty saved document', () => {
        render(
            <EnrichmentContentComparison
                proposedLabel="Accessible proposal"
                current={snapshot()}
                proposed={snapshot({
                    content: '',
                    cleanedAccessibleText: 'Available text',
                })}
            />,
        );
        const saved = section('Current saved content');
        const proposed = section('Accessible proposal');
        expect(saved.getByText('Untitled article')).toBeInTheDocument();
        expect(
            saved.getByText('Completeness not verified'),
        ).toBeInTheDocument();
        expect(saved.getByText('No summary saved.')).toBeInTheDocument();
        expect(saved.getByText('No article text saved.')).toBeInTheDocument();
        expect(saved.getByText('0 characters')).toBeInTheDocument();
        expect(proposed.getByText('Available text')).toBeInTheDocument();
        expect(proposed.getByText('14 characters')).toBeInTheDocument();
        expect(
            proposed.queryByText('No article text saved.'),
        ).not.toBeInTheDocument();
    });
});
