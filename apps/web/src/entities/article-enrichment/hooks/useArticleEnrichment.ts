import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
    getArticleContentVersions,
    getEnrichmentJob,
    getEnrichmentJobs,
    getEnrichmentProposal,
} from '../api/articleEnrichment';
import { isEnrichmentJobActive } from '../model/types';
import { invalidateRawArticleQueries } from '../../raw-news/hooks/invalidateRawArticleQueries';

export const enrichmentKeys = {
    all: ['article-enrichment'] as const,
    jobs: ['article-enrichment', 'jobs'] as const,
    job: (id: string | null, page: number) =>
        ['article-enrichment', 'job', id, page] as const,
    proposal: (id: string | null) =>
        ['article-enrichment', 'proposal', id] as const,
    versions: (id: string | null) =>
        ['article-enrichment', 'versions', id] as const,
};

export const useEnrichmentJobsQuery = () =>
    useQuery({
        queryKey: enrichmentKeys.jobs,
        queryFn: ({ signal }) => getEnrichmentJobs(signal),
        refetchInterval: 5000,
    });

export const useEnrichmentJobQuery = (id: string | null, page: number) =>
    useQuery({
        queryKey: enrichmentKeys.job(id, page),
        queryFn: ({ signal }) => getEnrichmentJob(id!, page, signal),
        enabled: Boolean(id),
        refetchInterval: (query) =>
            isEnrichmentJobActive(query.state.data?.job) ||
            (query.state.data?.job.counts.RUNNING ?? 0) > 0
                ? 2000
                : false,
    });

export const useEnrichmentProposalQuery = (id: string | null) =>
    useQuery({
        queryKey: enrichmentKeys.proposal(id),
        queryFn: ({ signal }) => getEnrichmentProposal(id!, signal),
        enabled: Boolean(id),
        refetchOnWindowFocus: false,
    });

export const useArticleContentVersionsQuery = (id: string | null) =>
    useQuery({
        queryKey: enrichmentKeys.versions(id),
        queryFn: ({ signal }) => getArticleContentVersions(id!, signal),
        enabled: Boolean(id),
        refetchOnWindowFocus: false,
    });

export async function refreshEnrichmentQueries(
    client: QueryClient,
    articlesChanged = false,
) {
    await Promise.allSettled([
        client.invalidateQueries({ queryKey: enrichmentKeys.all }),
        ...(articlesChanged ? [invalidateRawArticleQueries(client)] : []),
    ]);
}
