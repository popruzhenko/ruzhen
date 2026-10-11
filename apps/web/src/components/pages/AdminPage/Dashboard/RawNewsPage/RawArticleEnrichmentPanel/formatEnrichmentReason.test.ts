import { describe, expect, it } from 'vitest';
import { formatEnrichmentReason } from './formatEnrichmentReason';

describe('enrichment explanation formatting', () => {
    it.each([
        ['TITLE_MISMATCH', 'The retrieved title does not match'],
        ['UNVERIFIED_ARTICLE_BODY', 'The article body could not be verified'],
        [
            'ARTICLE_IDENTITY_UNCONFIRMED',
            'The text could not be matched to the original article',
        ],
        ['INCOMPLETE_DOCUMENT', 'The retrieved document is incomplete'],
        ['PUBLICATION_DATE_MISMATCH', 'The publication date does not match'],
        [
            'INVALID_PUBLICATION_DATE',
            'The publication date could not be verified',
        ],
        [
            'PAYWALL_OR_ACCESS_NOTICE',
            'The text contains an access or subscription notice',
        ],
        [
            'INCOMPLETE_SENTENCE_OR_TRAILER',
            'The text appears to end before the article is complete',
        ],
        ['TOO_LITTLE_ARTICLE_TEXT', 'Too little article text was retrieved'],
        ['SUMMARY_ONLY_TEXT', 'Only a summary was retrieved'],
        [
            'NAVIGATION_OR_BOILERPLATE',
            'The text contains page navigation or unrelated material',
        ],
        [
            'REPEATED_OR_BOILERPLATE_TEXT',
            'The text contains repeated or unrelated material',
        ],
    ])('explains %s in readable text', (code, text) => {
        expect(formatEnrichmentReason(code)).toBe(text);
    });

    it('formats multiple codes in an explanation and handles new server codes', () => {
        expect(
            formatEnrichmentReason(
                'Rejected: TITLE_MISMATCH; NEW_CHECK_FAILED.',
            ),
        ).toBe(
            'Rejected: The retrieved title does not match; new check failed.',
        );
    });

    it('preserves ordinary text and partial matches', () => {
        const text =
            'HTTP 403: Publisher Title_Mismatch, wordTITLE_MISMATCHword.';
        expect(formatEnrichmentReason(text)).toBe(text);
        expect(formatEnrichmentReason('')).toBe('');
    });
});
