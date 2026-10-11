import type {
    PublicClusterBlock,
    PublicClusterDetails,
    PublicClusterListItem,
    PublicClusterSource,
} from '../../entities/public-clusters';

export const makeBlock = (
    overrides: Partial<PublicClusterBlock> = {},
): PublicClusterBlock => ({
    id: 'fact-1',
    type: 'FACT',
    title: 'Confirmed fact',
    content: 'A verified event happened.',
    position: 1,
    sourceName: null,
    sourceUrl: null,
    authorName: null,
    stance: null,
    ...overrides,
});

export const makeSource = (
    overrides: Partial<PublicClusterSource> = {},
): PublicClusterSource => ({
    id: 'source-1',
    title: 'Original report',
    summary: null,
    url: 'https://news.example/report',
    publishedAt: '2026-09-30T10:00:00Z',
    isPrimary: true,
    confidence: 1,
    addedAt: '2026-09-30T10:00:00Z',
    source: {
        id: 'publisher-1',
        name: 'Reliable News',
        baseUrl: 'https://news.example',
    },
    ...overrides,
});

export const makeCluster = (
    overrides: Partial<PublicClusterDetails> = {},
): PublicClusterDetails => ({
    id: 'cluster-1',
    humanId: 'RZH-001',
    title: 'Published material',
    summary: 'A concise explanation.',
    mainCountry: 'Belgium',
    startDate: null,
    publishedAt: '2026-09-30T12:00:00Z',
    updatedAt: '2026-09-30T12:00:00Z',
    blocks: [makeBlock()],
    sources: [makeSource()],
    ...overrides,
});

export const makeListArticle = (
    overrides: Partial<PublicClusterListItem> = {},
): PublicClusterListItem => {
    const { sources, ...cluster } = makeCluster();
    return {
        ...cluster,
        _count: { articleLinks: sources.length, blocks: cluster.blocks.length },
        ...overrides,
    };
};
