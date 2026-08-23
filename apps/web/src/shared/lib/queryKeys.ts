export const queryKeys = {
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

    publicClusters: {
        all: ['public-clusters'] as const,
        list: (params: object) => ['public-clusters', 'list', params] as const,
        detail: (humanId?: string) =>
            ['public-clusters', humanId ?? null] as const,
    },
} as const;
