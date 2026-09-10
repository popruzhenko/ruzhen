import {
    parseRawArticlesPreview,
    parseRawArticleTimestamp,
} from '../rawArticles';
import { EnrichmentError, type EnrichmentScope } from './types';

export function parseEnrichmentJobRequest(value: unknown): {
    scope: EnrichmentScope;
    requestId?: string;
} {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new EnrichmentError('Invalid enrichment job request.');
    const input = value as Record<string, unknown>;
    if (
        Object.keys(input).some((key) => key !== 'scope' && key !== 'requestId')
    )
        throw new EnrichmentError('Unknown enrichment job parameter.');
    const scope = parseRawArticlesPreview({
        action: 'RECHECK',
        scope: input.scope,
    }).scope;
    if (
        input.requestId !== undefined &&
        (typeof input.requestId !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                input.requestId,
            ))
    ) {
        throw new EnrichmentError('requestId must be a UUID.');
    }
    return { scope, requestId: input.requestId as string | undefined };
}

export function parseEnrichmentPagination(query: unknown = {}) {
    if (!query || typeof query !== 'object' || Array.isArray(query))
        throw new EnrichmentError('Invalid pagination.');
    const input = query as Record<string, unknown>;
    const number = (value: unknown, fallback: number, label: string) => {
        if (value === undefined) return fallback;
        if (
            typeof value !== 'number' &&
            (typeof value !== 'string' || !/^\d+$/.test(value))
        )
            throw new EnrichmentError(`Invalid ${label}.`);
        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < 1)
            throw new EnrichmentError(`Invalid ${label}.`);
        return parsed;
    };
    return {
        page: number(input.page, 1, 'page'),
        limit: Math.min(100, number(input.limit, 50, 'limit')),
    };
}

export function parseEnrichmentExpectedVersion(value: unknown): Date {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new EnrichmentError('Expected article version is required.');
    return parseRawArticleTimestamp(
        (value as Record<string, unknown>).expectedUpdatedAt,
        'expectedUpdatedAt',
    );
}
