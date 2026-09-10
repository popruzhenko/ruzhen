const reasons: Record<string, string> = {
    UNVERIFIED_ARTICLE_BODY: 'The article body could not be verified',
    INCOMPLETE_DOCUMENT: 'The retrieved document is incomplete',
    ARTICLE_IDENTITY_UNCONFIRMED:
        'The text could not be matched to the original article',
    TITLE_MISMATCH: 'The retrieved title does not match',
    PUBLICATION_DATE_MISMATCH: 'The publication date does not match',
    INVALID_PUBLICATION_DATE: 'The publication date could not be verified',
    PAYWALL_OR_ACCESS_NOTICE:
        'The text contains an access or subscription notice',
    INCOMPLETE_SENTENCE_OR_TRAILER:
        'The text appears to end before the article is complete',
    TOO_LITTLE_ARTICLE_TEXT: 'Too little article text was retrieved',
    SUMMARY_ONLY_TEXT: 'Only a summary was retrieved',
    NAVIGATION_OR_BOILERPLATE:
        'The text contains page navigation or unrelated material',
    REPEATED_OR_BOILERPLATE_TEXT:
        'The text contains repeated or unrelated material',
};

export function formatEnrichmentReason(value: string) {
    return value.replace(
        /\b[A-Z]+(?:_[A-Z]+)+\b/g,
        (code) => reasons[code] ?? code.toLowerCase().replaceAll('_', ' '),
    );
}
