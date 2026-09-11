import {
    CLUSTER_BULK_ACTIONS,
    type ClusterBulkAction,
} from '../clusterBulk/types';
import { ClusterBulkJobError } from './types';

function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new ClusterBulkJobError('Invalid cluster job request.');
    const input = value as Record<string, unknown>;
    if (Object.keys(input).some((key) => !keys.includes(key)))
        throw new ClusterBulkJobError('Unknown cluster job parameter.');
    return input;
}

export function parseClusterJobAction(value: unknown): ClusterBulkAction {
    if (!CLUSTER_BULK_ACTIONS.includes(value as ClusterBulkAction))
        throw new ClusterBulkJobError('Invalid cluster job action.');
    return value as ClusterBulkAction;
}

function requestId(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
        )
    )
        throw new ClusterBulkJobError('A valid request ID is required.');
    return value;
}

export function parseStartClusterJob(value: unknown) {
    const input = object(value, ['action', 'requestId']);
    return {
        action: parseClusterJobAction(input.action),
        requestId: requestId(input.requestId),
    };
}

export function parseRetryClusterJob(value: unknown) {
    const input = object(value, ['requestId']);
    return { requestId: requestId(input.requestId) };
}

export function parseClusterJobId(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > 128)
        throw new ClusterBulkJobError('Invalid cluster job ID.');
    return value;
}

export function parseClusterJobPagination(value: unknown) {
    const input = object(value, ['page', 'limit']);
    const integer = (raw: unknown, fallback: number, max: number) => {
        if (raw === undefined) return fallback;
        if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw))
            throw new ClusterBulkJobError('Invalid results pagination.');
        const number = Number(raw);
        if (!Number.isSafeInteger(number) || number > max)
            throw new ClusterBulkJobError('Invalid results pagination.');
        return number;
    };
    return {
        page: integer(input.page, 1, Number.MAX_SAFE_INTEGER),
        limit: integer(input.limit, 50, 100),
    };
}
