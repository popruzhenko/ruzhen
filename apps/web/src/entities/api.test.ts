import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as articleCandidates from './article-cluster-candidate/api/articleClusterCandidates';
import * as enrichment from './article-enrichment/api/articleEnrichment';
import { acceptClusterCandidate } from './cluster-candidate/api/acceptClusterCandidate';
import { deleteClusterCandidate } from './cluster-candidate/api/deleteClusterCandidate';
import { generateClusterCandidates } from './cluster-candidate/api/generateClusterCandidates';
import { getClusterCandidates } from './cluster-candidate/api/getClusterCandidates';
import * as clusterBulk from './cluster/api/clusterBulk';
import { createCluster } from './cluster/api/createCluster';
import { createClusterFromArticles } from './cluster/api/createClusterFromArticles';
import { deleteCluster } from './cluster/api/deleteCluster';
import { getClusterById } from './cluster/api/getClusterById';
import { getClusters } from './cluster/api/getClusters';
import { updateClusterArticles } from './cluster/api/updateClusterArticles';
import { generateArticleEmbeddings } from './clustering/api/generateArticleEmbeddings';
import { getArticleClusterCandidates } from './clustering/api/getArticleClusterCandidates';
import { saveClusterArticles } from './clustering/api/saveClusterArticles';
import { generateAnalyzedNews } from './contextualization/api/generateAnalyzedNews';
import { saveContextDraft } from './contextualization/api/saveContextDraft';
import { getPublicClusterByHumanId } from './public-clusters/api/getPublicClusterByHumanId';
import { getPublicClusters } from './public-clusters/api/getPublicClusters';
import { createContactMessageRequest } from './public-contact/api/publicContactApi';
import { updateClusterStatus } from './publication/api/updateClusterStatus';
import { fetchNewArticles } from './raw-news/api/fetchNewArticles';
import { getArticles } from './raw-news/api/getArticles';
import {
    executeRawArticleBulk,
    getRawArticles,
    previewRawArticleBulk,
} from './raw-news/api/rawArticles';
import { reviewArticleContent } from './raw-news/api/reviewArticleContent';
import { updateArticle } from './raw-news/api/updateArticle';

interface RequestCase {
    name: string;
    request: (signal: AbortSignal) => Promise<unknown>;
    endpoint: string;
    method?: string;
    body?: unknown;
    signal?: boolean;
}

const version = '2026-10-04T12:00:00Z';
const unusualId = 'id/with spaces?';
const encodedId = 'id%2Fwith%20spaces%3F';
const scope = { type: 'SELECTED', ids: ['a1', 'a2'] } as const;
const selectedScope = { type: scope.type, ids: [...scope.ids] };
const clusterItem = {
    clusterId: 'c1',
    humanId: 'news-1',
    title: 'News',
    revision: version,
};
const contact = {
    name: null,
    email: 'reader@test.example',
    topic: 'CORRECTIONS',
    title: 'Correction',
    message: 'Please correct the date.',
} as const;

const cases: RequestCase[] = [
    {
        name: 'list articles',
        request: () => getArticles(),
        endpoint: '/articles',
    },
    {
        name: 'fetch new articles',
        request: () => fetchNewArticles(),
        endpoint: '/admin/articles/fetch-new',
        method: 'POST',
    },
    {
        name: 'raw articles defaults',
        request: (signal) => getRawArticles({}, signal),
        endpoint: '/admin/articles/raw?page=1&limit=50',
        signal: true,
    },
    {
        name: 'raw article filters',
        request: (signal) =>
            getRawArticles(
                {
                    search: 'Новости & politics',
                    status: 'APPROVED',
                    contentAvailability: 'FULL_TEXT',
                    sourceName: 'News & Co',
                    fetchedFrom: '2026-10-01',
                    fetchedTo: undefined,
                    onlyProblematic: false,
                },
                signal,
                { page: 2, limit: 25 },
            ),
        endpoint:
            '/admin/articles/raw?search=%D0%9D%D0%BE%D0%B2%D0%BE%D1%81%D1%82%D0%B8+%26+politics&status=APPROVED&contentAvailability=FULL_TEXT&sourceName=News+%26+Co&fetchedFrom=2026-10-01&onlyProblematic=false&page=2&limit=25',
        signal: true,
    },
    {
        name: 'preview selected raw article bulk action',
        request: (signal) =>
            previewRawArticleBulk('RECHECK', selectedScope, signal),
        endpoint: '/admin/articles/bulk/preview',
        method: 'POST',
        body: { action: 'RECHECK', scope: selectedScope },
        signal: true,
    },
    {
        name: 'preview filtered raw article bulk action',
        request: (signal) =>
            previewRawArticleBulk(
                'APPROVE',
                { type: 'FILTERED', filters: { status: 'REVIEWED' } },
                signal,
            ),
        endpoint: '/admin/articles/bulk/preview',
        method: 'POST',
        body: {
            action: 'APPROVE',
            scope: { type: 'FILTERED', filters: { status: 'REVIEWED' } },
        },
        signal: true,
    },
    {
        name: 'execute raw article bulk with concurrency revisions',
        request: () =>
            executeRawArticleBulk('REJECT', [{ id: 'a1', updatedAt: version }]),
        endpoint: '/admin/articles/bulk',
        method: 'POST',
        body: { action: 'REJECT', items: [{ id: 'a1', updatedAt: version }] },
    },
    {
        name: 'partial article update encodes ID and omits undefined fields',
        request: () =>
            updateArticle({
                id: unusualId,
                expectedUpdatedAt: version,
                title: '',
                confirmFullText: false,
                status: 'APPROVED',
            }),
        endpoint: `/articles/${encodedId}`,
        method: 'PATCH',
        body: {
            expectedUpdatedAt: version,
            title: '',
            confirmFullText: false,
            status: 'APPROVED',
        },
    },
    {
        name: 'article content update preserves all editor fields',
        request: () =>
            updateArticle({
                id: 'a1',
                summary: 'Summary',
                content: 'Content',
                preview: 'Preview',
                cleanedAccessibleText: 'Clean',
                confirmFullText: true,
            }),
        endpoint: '/articles/a1',
        method: 'PATCH',
        body: {
            summary: 'Summary',
            content: 'Content',
            preview: 'Preview',
            cleanedAccessibleText: 'Clean',
            confirmFullText: true,
        },
    },
    {
        name: 'review article using legacy ID input',
        request: () => reviewArticleContent(unusualId),
        endpoint: `/articles/${encodedId}/review-content`,
        method: 'POST',
        body: {},
    },
    {
        name: 'review article with concurrency revision',
        request: () =>
            reviewArticleContent({ id: 'a1', expectedUpdatedAt: version }),
        endpoint: '/articles/a1/review-content',
        method: 'POST',
        body: { expectedUpdatedAt: version },
    },
    {
        name: 'cluster list defaults',
        request: () => getClusters(),
        endpoint: '/admin/clusters',
    },
    {
        name: 'cluster list pagination',
        request: () => getClusters({ page: 3, limit: 25 }),
        endpoint: '/admin/clusters?page=3&limit=25',
    },
    {
        name: 'cluster details',
        request: () => getClusterById('c1'),
        endpoint: '/admin/clusters/c1',
        method: 'GET',
    },
    {
        name: 'create cluster',
        request: () =>
            createCluster({
                title: 'News',
                summary: null,
                mainCountry: 'BE',
                startDate: null,
            }),
        endpoint: '/admin/clusters',
        method: 'POST',
        body: {
            title: 'News',
            summary: null,
            mainCountry: 'BE',
            startDate: null,
        },
    },
    {
        name: 'create cluster from selected articles',
        request: () =>
            createClusterFromArticles({
                articleIds: ['a1', 'a2'],
                title: 'News',
            }),
        endpoint: '/admin/clusters/from-articles',
        method: 'POST',
        body: { articleIds: ['a1', 'a2'], title: 'News' },
    },
    {
        name: 'delete cluster',
        request: () => deleteCluster('c1'),
        endpoint: '/admin/clusters/c1',
        method: 'DELETE',
    },
    {
        name: 'update cluster article confidences',
        request: () =>
            updateClusterArticles('c1', {
                articles: [
                    { articleId: 'a1', confidence: null, isPrimary: true },
                ],
            }),
        endpoint: '/admin/clusters/c1/articles',
        method: 'PATCH',
        body: {
            articles: [{ articleId: 'a1', confidence: null, isPrimary: true }],
        },
    },
    {
        name: 'save cluster article selection including empty selection',
        request: () => saveClusterArticles({ clusterId: 'c1', articleIds: [] }),
        endpoint: '/admin/clusters/c1/articles',
        method: 'PATCH',
        body: { articleIds: [] },
    },
    {
        name: 'get candidates for cluster',
        request: () => getArticleClusterCandidates('c1'),
        endpoint: '/admin/clusters/c1/candidates',
        method: 'GET',
    },
    {
        name: 'generate embeddings',
        request: () => generateArticleEmbeddings(),
        endpoint: '/admin/articles/generate-embeddings',
        method: 'POST',
        body: { limit: 999 },
    },
    {
        name: 'cluster candidates',
        request: () => getClusterCandidates(),
        endpoint: '/admin/cluster-candidates',
    },
    {
        name: 'generate cluster candidates',
        request: () => generateClusterCandidates(),
        endpoint: '/admin/cluster-candidates/generate',
        method: 'POST',
    },
    {
        name: 'accept cluster candidate',
        request: () => acceptClusterCandidate('candidate1'),
        endpoint: '/admin/cluster-candidates/candidate1/accept',
        method: 'POST',
    },
    {
        name: 'delete cluster candidate',
        request: () => deleteClusterCandidate('candidate1'),
        endpoint: '/admin/cluster-candidates/candidate1',
        method: 'DELETE',
    },
    {
        name: 'article cluster candidate pagination',
        request: (signal) =>
            articleCandidates.getArticleClusterCandidates(
                { page: 2, limit: 50 },
                signal,
            ),
        endpoint: '/admin/article-cluster-candidates?page=2&limit=50',
        signal: true,
    },
    {
        name: 'generate article cluster candidates',
        request: () => articleCandidates.generateArticleClusterCandidates(),
        endpoint: '/admin/article-cluster-candidates/generate',
        method: 'POST',
    },
    {
        name: 'accept article cluster candidate with encoded ID',
        request: () =>
            articleCandidates.acceptArticleClusterCandidate(unusualId),
        endpoint: `/admin/article-cluster-candidates/${encodedId}/accept`,
        method: 'POST',
    },
    {
        name: 'reject article cluster candidate with encoded ID',
        request: () =>
            articleCandidates.rejectArticleClusterCandidate(unusualId),
        endpoint: `/admin/article-cluster-candidates/${encodedId}/reject`,
        method: 'POST',
    },
    {
        name: 'generate cluster context',
        request: () => generateAnalyzedNews('c1'),
        endpoint: '/admin/clusters/c1/generate-analyzed-news',
        method: 'POST',
    },
    {
        name: 'save context draft',
        request: () =>
            saveContextDraft('c1', {
                title: 'News',
                summary: '',
                blocks: [
                    {
                        type: 'OPINION',
                        title: null,
                        content: 'Opinion',
                        position: 0,
                        sourceName: null,
                        sourceUrl: null,
                        authorName: null,
                        stance: 'NEUTRAL',
                    },
                ],
            }),
        endpoint: '/admin/clusters/c1/context-draft',
        method: 'PATCH',
        body: {
            title: 'News',
            summary: '',
            blocks: [
                {
                    type: 'OPINION',
                    title: null,
                    content: 'Opinion',
                    position: 0,
                    sourceName: null,
                    sourceUrl: null,
                    authorName: null,
                    stance: 'NEUTRAL',
                },
            ],
        },
    },
    {
        name: 'publish cluster',
        request: () => updateClusterStatus('c1', 'PUBLISHED'),
        endpoint: '/admin/clusters/c1/status',
        method: 'PATCH',
        body: { status: 'PUBLISHED' },
    },
    {
        name: 'public cluster filters preserve zero and encode search',
        request: (signal) =>
            getPublicClusters(
                {
                    page: 1,
                    limit: 10,
                    search: 'News & world',
                    minSources: 0,
                    publishedFrom: undefined,
                },
                signal,
            ),
        endpoint:
            '/public/clusters?page=1&limit=10&search=News+%26+world&minSources=0',
        signal: true,
    },
    {
        name: 'public cluster detail',
        request: () => getPublicClusterByHumanId('news-1'),
        endpoint: '/clusters/news-1',
    },
    {
        name: 'public contact message',
        request: () => createContactMessageRequest(contact),
        endpoint: '/public/contact',
        method: 'POST',
        body: contact,
    },
    {
        name: 'preview cluster bulk action',
        request: (signal) => clusterBulk.previewClusterBulk('PUBLISH', signal),
        endpoint: '/admin/clusters/bulk/preview',
        method: 'POST',
        body: { action: 'PUBLISH' },
        signal: true,
    },
    {
        name: 'list cluster bulk jobs by action',
        request: (signal) =>
            clusterBulk.getClusterBulkJobs('CONTEXTUALIZE', signal),
        endpoint: '/admin/clusters/bulk/jobs?action=CONTEXTUALIZE',
        signal: true,
    },
    {
        name: 'cluster bulk job default pagination and encoded ID',
        request: (signal) =>
            clusterBulk.getClusterBulkJob(unusualId, undefined, signal),
        endpoint: `/admin/clusters/bulk/jobs/${encodedId}?page=1&limit=50`,
        signal: true,
    },
    {
        name: 'cluster bulk job explicit pagination',
        request: (signal) => clusterBulk.getClusterBulkJob('job1', 3, signal),
        endpoint: '/admin/clusters/bulk/jobs/job1?page=3&limit=50',
        signal: true,
    },
    {
        name: 'start cluster bulk job with idempotency key',
        request: () => clusterBulk.startClusterBulkJob('PUBLISH', 'request1'),
        endpoint: '/admin/clusters/bulk/jobs',
        method: 'POST',
        body: { action: 'PUBLISH', requestId: 'request1' },
    },
    {
        name: 'cancel cluster bulk job',
        request: () => clusterBulk.cancelClusterBulkJob(unusualId),
        endpoint: `/admin/clusters/bulk/jobs/${encodedId}/cancel`,
        method: 'POST',
    },
    {
        name: 'retry cluster bulk job',
        request: () => clusterBulk.retryClusterBulkJob(unusualId, 'request2'),
        endpoint: `/admin/clusters/bulk/jobs/${encodedId}/retry`,
        method: 'POST',
        body: { requestId: 'request2' },
    },
    {
        name: 'execute cluster bulk action with revision',
        request: () =>
            clusterBulk.executeClusterBulk('CONTEXTUALIZE', clusterItem),
        endpoint: '/admin/clusters/bulk/execute',
        method: 'POST',
        body: { action: 'CONTEXTUALIZE', item: clusterItem },
    },
    {
        name: 'list enrichment jobs',
        request: (signal) => enrichment.getEnrichmentJobs(signal),
        endpoint: '/admin/articles/enrichment/jobs',
        signal: true,
    },
    {
        name: 'enrichment job pagination and encoded ID',
        request: (signal) => enrichment.getEnrichmentJob(unusualId, 2, signal),
        endpoint: `/admin/articles/enrichment/jobs/${encodedId}?page=2&limit=50`,
        signal: true,
    },
    {
        name: 'start enrichment with selected scope and idempotency key',
        request: () =>
            enrichment.startEnrichment({
                scope: selectedScope,
                requestId: 'request1',
            }),
        endpoint: '/admin/articles/enrichment/jobs',
        method: 'POST',
        body: { scope: selectedScope, requestId: 'request1' },
    },
    {
        name: 'stop enrichment job',
        request: () => enrichment.stopEnrichment(unusualId),
        endpoint: `/admin/articles/enrichment/jobs/${encodedId}/stop`,
        method: 'POST',
    },
    {
        name: 'retry enrichment errors',
        request: () => enrichment.retryEnrichmentErrors(unusualId),
        endpoint: `/admin/articles/enrichment/jobs/${encodedId}/retry-errors`,
        method: 'POST',
    },
    {
        name: 'get enrichment proposal',
        request: (signal) =>
            enrichment.getEnrichmentProposal(unusualId, signal),
        endpoint: `/admin/articles/enrichment/items/${encodedId}/proposal`,
        signal: true,
    },
    {
        name: 'apply enrichment proposal with concurrency revision',
        request: () =>
            enrichment.applyEnrichmentProposal({
                id: unusualId,
                expectedUpdatedAt: version,
            }),
        endpoint: `/admin/articles/enrichment/items/${encodedId}/apply`,
        method: 'POST',
        body: { expectedUpdatedAt: version },
    },
    {
        name: 'dismiss enrichment proposal',
        request: () => enrichment.dismissEnrichmentProposal(unusualId),
        endpoint: `/admin/articles/enrichment/items/${encodedId}/dismiss`,
        method: 'POST',
    },
    {
        name: 'get article content history',
        request: (signal) =>
            enrichment.getArticleContentVersions(unusualId, signal),
        endpoint: `/admin/articles/enrichment/articles/${encodedId}/versions`,
        signal: true,
    },
    {
        name: 'restore article content version with revision',
        request: () =>
            enrichment.restoreArticleContentVersion({
                id: unusualId,
                expectedUpdatedAt: version,
            }),
        endpoint: `/admin/articles/enrichment/versions/${encodedId}/restore`,
        method: 'POST',
        body: { expectedUpdatedAt: version },
    },
];

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockImplementation(
        async () =>
            new Response(JSON.stringify({ result: 'server response' }), {
                status: 200,
            }),
    );
});

describe('entity API requests through apiClient', () => {
    it.each(cases)(
        '$name',
        async ({ request, endpoint, method, body, signal }) => {
            const controller = new AbortController();
            await expect(request(controller.signal)).resolves.toEqual({
                result: 'server response',
            });

            expect(fetchMock).toHaveBeenCalledOnce();
            const [url, options] = fetchMock.mock.calls[0];
            expect(url).toBe(`https://api.test.invalid${endpoint}`);
            expect(options?.method).toBe(method);
            if (body === undefined) expect(options?.body).toBeUndefined();
            else expect(JSON.parse(options?.body as string)).toEqual(body);
            expect(new Headers(options?.headers).get('content-type')).toBe(
                'application/json',
            );
            if (signal) expect(options?.signal).toBe(controller.signal);
        },
    );

    it('propagates optimistic concurrency conflicts without altering the payload', async () => {
        fetchMock.mockResolvedValue(
            new Response('Article was modified by another editor', {
                status: 409,
            }),
        );
        await expect(
            updateArticle({
                id: 'a1',
                expectedUpdatedAt: version,
                title: 'Edited',
            }),
        ).rejects.toThrow('409: Article was modified by another editor');
        expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
            expectedUpdatedAt: version,
            title: 'Edited',
        });
    });

    it('propagates public contact validation failures to the caller', async () => {
        fetchMock.mockResolvedValue(
            new Response('Invalid email address', { status: 400 }),
        );
        await expect(createContactMessageRequest(contact)).rejects.toThrow(
            '400: Invalid email address',
        );
    });

    it('passes cancellation to fetch and preserves the abort rejection', async () => {
        const controller = new AbortController();
        const failure = new DOMException('Canceled', 'AbortError');
        controller.abort();
        fetchMock.mockImplementation(async (_url, options) => {
            expect(options?.signal?.aborted).toBe(true);
            throw failure;
        });
        await expect(getRawArticles({}, controller.signal)).rejects.toBe(
            failure,
        );
    });
});
