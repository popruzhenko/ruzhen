import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EnrichmentRetrievalDetails } from './EnrichmentRetrievalDetails';
import { EnrichmentContentComparison } from '../EnrichmentContentComparison/EnrichmentContentComparison';
import type {
    ArticleContentRetrieval,
    EnrichmentArticleSnapshot,
} from '../../../../../../../entities/article-enrichment/model/types';

const retrieval: ArticleContentRetrieval = {
    provider: 'ARCHIVE_TODAY',
    originalUrl: 'https://publisher.test/article',
    retrievedUrl: 'https://archive.ph/snapshot',
    retrievedAt: '2026-09-09T10:30:00.000Z',
    archiveCapturedAt: '2026-09-08T14:15:00.000Z',
    attempts: [
        {
            provider: 'PUBLISHER_HTTP',
            outcome: 'PARTIAL_TEXT',
            url: 'https://publisher.test/article',
            reasons: ['SUMMARY_ONLY_TEXT'],
        },
        {
            provider: 'PUBLISHER_BROWSER',
            outcome: 'ERROR',
            url: 'https://publisher.test/article',
            reasons: ['The page did not finish loading before the timeout.'],
        },
        {
            provider: 'ARCHIVE_TODAY',
            outcome: 'FULL_TEXT',
            url: 'https://archive.ph/snapshot',
            reasons: [],
        },
    ],
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT;
});

describe('article retrieval source details', () => {
    it('shows the original article, the archive snapshot and separate retrieval and archive capture times', async () => {
        await act(async () =>
            root.render(<EnrichmentRetrievalDetails retrieval={retrieval} />),
        );
        expect(container.textContent).toContain('archive.today / archive.ph');
        const original = container.querySelector<HTMLAnchorElement>(
            'dd a[href="https://publisher.test/article"]',
        )!;
        const archived = container.querySelector<HTMLAnchorElement>(
            'dd a[href="https://archive.ph/snapshot"]',
        )!;
        expect(original.textContent).toBe(retrieval.originalUrl);
        expect(archived.target).toBe('_blank');
        expect(archived.rel).toContain('noopener');
        const dates = [...container.querySelectorAll('dl > div')].filter(
            (row) => row.querySelector('time'),
        );
        expect(
            dates.map((row) => [
                row.querySelector('dt')!.textContent,
                row.querySelector('time')!.dateTime,
            ]),
        ).toEqual([
            ['Retrieved at', retrieval.retrievedAt],
            ['Archive captured at', retrieval.archiveCapturedAt],
        ]);
        expect(container.textContent).not.toContain('publication date');
    });

    it('preserves the ordered retrieval attempts and explains partial text and failed browser retrieval', async () => {
        await act(async () =>
            root.render(<EnrichmentRetrievalDetails retrieval={retrieval} />),
        );
        expect(container.querySelector('summary')!.textContent).toBe(
            'Retrieval attempts (3)',
        );
        const attempts = [...container.querySelectorAll('ol > li')];
        expect(attempts).toHaveLength(3);
        expect(attempts[0].textContent).toContain(
            'Publisher page — Partial text retrieved',
        );
        expect(attempts[0].textContent).toContain(
            'Only a summary was retrieved',
        );
        expect(attempts[0].textContent).not.toContain('SUMMARY_ONLY_TEXT');
        expect(attempts[1].textContent).toContain(
            'Publisher page (browser) — Retrieval failed',
        );
        expect(attempts[1].textContent).toContain(
            'did not finish loading before the timeout',
        );
        expect(attempts[2].textContent).toContain(
            'archive.today / archive.ph — Full text retrieved',
        );
    });

    it('does not invent archive dates and renders nothing for older versions without retrieval metadata', async () => {
        await act(async () =>
            root.render(
                <EnrichmentRetrievalDetails
                    retrieval={{ ...retrieval, archiveCapturedAt: null }}
                />,
            ),
        );
        expect(container.textContent).toContain(
            'Archive capture time unavailable',
        );
        expect(container.querySelectorAll('time')).toHaveLength(1);
        await act(async () =>
            root.render(
                <EnrichmentRetrievalDetails
                    retrieval={{
                        ...retrieval,
                        provider: 'PUBLISHER_HTTP',
                        archiveCapturedAt: null,
                        attempts: [],
                    }}
                />,
            ),
        );
        expect(container.textContent).not.toContain('Archive captured at');
        expect(container.querySelector('details')).toBeNull();
        await act(async () => root.render(<EnrichmentRetrievalDetails />));
        expect(container.innerHTML).toBe('');
    });

    it('places archived source metadata in the matching comparison column and keeps the legacy column unchanged', async () => {
        const current: EnrichmentArticleSnapshot = {
            title: 'Existing article',
            summary: 'A summary',
            content: 'Original saved text.',
            cleanedAccessibleText: null,
            contentAvailability: 'PARTIAL_TEXT',
        };
        const earlier: EnrichmentArticleSnapshot = {
            ...current,
            content: 'Text saved from an archive.',
            contentProvenance: {
                origin: 'ENRICHMENT',
                textHash: 'hash',
                retrieval,
            },
        };
        await act(async () =>
            root.render(
                <EnrichmentContentComparison
                    current={current}
                    proposed={earlier}
                    proposedLabel="Content before this change"
                />,
            ),
        );
        const columns = container.querySelectorAll(
            '.raw_enrichment__comparison > section',
        );
        expect(
            columns[0].querySelector('.enrichment_retrieval_details'),
        ).toBeNull();
        expect(columns[0].textContent).toContain('Original saved text.');
        expect(
            columns[1].querySelector(
                'dd a[href="https://archive.ph/snapshot"]',
            ),
        ).not.toBeNull();
        expect(columns[1].textContent).toContain('Text saved from an archive.');
    });
});
