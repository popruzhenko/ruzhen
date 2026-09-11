export const CLUSTER_BULK_ACTIONS = ['CONTEXTUALIZE', 'PUBLISH'] as const;
export type ClusterBulkAction = (typeof CLUSTER_BULK_ACTIONS)[number];

export interface ClusterBulkItem {
    clusterId: string;
    humanId: string;
    title: string;
    revision: string;
}

export interface ClusterBulkResult {
    clusterId: string;
    outcome: 'succeeded' | 'skipped' | 'failed';
    message: string;
}

export class ClusterBulkInputError extends Error {}
export class ClusterBulkConflict extends Error {}

function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new ClusterBulkInputError('Invalid bulk cluster request.');
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !keys.includes(key)))
        throw new ClusterBulkInputError('Unknown bulk cluster parameter.');
    return input;
}

function action(value: unknown): ClusterBulkAction {
    if (!CLUSTER_BULK_ACTIONS.includes(value as ClusterBulkAction))
        throw new ClusterBulkInputError('Invalid bulk cluster action.');
    return value as ClusterBulkAction;
}

export function parseClusterBulkPreview(value: unknown) {
    const input = object(value, ['action']);
    return { action: action(input.action) };
}

export function parseClusterBulkExecution(value: unknown): {
    action: ClusterBulkAction;
    item: ClusterBulkItem;
} {
    const input = object(value, ['action', 'item']);
    const item = object(input.item, [
        'clusterId',
        'humanId',
        'title',
        'revision',
    ]);
    for (const key of ['clusterId', 'humanId', 'title', 'revision']) {
        if (
            typeof item[key] !== 'string' ||
            (key !== 'title' && !item[key].trim())
        )
            throw new ClusterBulkInputError(`Invalid cluster ${key}.`);
    }
    if (!/^[0-9a-f]{64}$/.test(item.revision as string))
        throw new ClusterBulkInputError('Invalid cluster revision.');
    return {
        action: action(input.action),
        item: item as unknown as ClusterBulkItem,
    };
}
