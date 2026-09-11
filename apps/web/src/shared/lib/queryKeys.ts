export const queryKeys = {
    clusterBulkJobs: {
        all: ['cluster-bulk-jobs'] as const,
        list: (action: string) =>
            ['cluster-bulk-jobs', 'list', action] as const,
        detail: (id: string | null, page: number) =>
            ['cluster-bulk-jobs', 'detail', id, page] as const,
    },
    articles: {
        all: ['articles'] as const,
    },

    clusters: {
        all: ['clusters'] as const,
        list: (params: object) => ['clusters', 'list', params] as const,
        detail: (clusterId: string) => ['clusters', clusterId] as const,
        candidates: (clusterId: string | null) =>
            ['clusters', clusterId, 'candidates'] as const,
        blocks: (clusterId: string) =>
            ['clusters', clusterId, 'blocks'] as const,
    },

    clusterCandidates: {
        all: ['cluster-candidates'] as const,
        list: () => ['cluster-candidates', 'list'] as const,
        detail: (candidateId: string) =>
            ['cluster-candidates', candidateId] as const,
    },

    publicClusters: {
        all: ['public-clusters'] as const,
        list: (params: object) => ['public-clusters', 'list', params] as const,
        detail: (humanId?: string) =>
            ['public-clusters', humanId ?? null] as const,
    },
} as const;
