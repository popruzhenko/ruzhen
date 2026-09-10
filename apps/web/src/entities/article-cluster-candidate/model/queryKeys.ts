import type { ArticleClusterCandidatesParams } from './types';

export const articleClusterCandidateKeys = {
    all: ['article-cluster-candidates'] as const,
    list: (params: ArticleClusterCandidatesParams, dataRevision: string) =>
        ['article-cluster-candidates', 'list', params, dataRevision] as const,
};
