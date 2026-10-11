import type { ClusterDetailsApiItem } from '../../../../entities/cluster/model/types';

export type EditorialBlock = ClusterDetailsApiItem['blocks'][number];
export type EditorialStory = Pick<
    ClusterDetailsApiItem,
    | 'id'
    | 'humanId'
    | 'title'
    | 'summary'
    | 'status'
    | 'updatedAt'
    | 'publishedAt'
    | 'articles'
    | 'blocks'
> & { _count: { articleLinks: number; blocks: number } };

export const savedVersion = '2026-09-11T10:00:00.000Z';
export const nextVersion = '2026-09-11T11:00:00.000Z';

export function makeEditorialBlock(
    overrides: Partial<EditorialBlock> = {},
): EditorialBlock {
    return {
        id: 'fact-1',
        type: 'FACT',
        title: 'Verified fact',
        content: 'Verified fact content.',
        position: 1,
        sourceName: 'Source',
        sourceUrl: 'https://example.test/report',
        authorName: null,
        stance: null,
        createdAt: savedVersion,
        updatedAt: savedVersion,
        ...overrides,
    };
}

export function makeEditorialStory(
    overrides: Partial<EditorialStory> = {},
): EditorialStory {
    const blocks = overrides.blocks ?? [makeEditorialBlock()];
    return {
        id: 'event-1',
        humanId: 'E-1',
        title: 'Saved article',
        summary: 'Saved article summary.',
        status: 'DRAFT',
        updatedAt: savedVersion,
        publishedAt: null,
        articles: [],
        _count: { articleLinks: 2, blocks: blocks.length },
        ...overrides,
        blocks,
    };
}

export function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}
