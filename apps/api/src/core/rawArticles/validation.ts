import { ArticleStatus, ContentAvailability } from '@prisma/client';

export const RAW_ARTICLE_ACTIONS = ['RECHECK', 'APPROVE', 'REJECT'] as const;
export type RawArticleAction = (typeof RAW_ARTICLE_ACTIONS)[number];

export interface RawArticleFilters {
    search?: string;
    status?: ArticleStatus;
    contentAvailability?: ContentAvailability;
    sourceName?: string;
    fetchedFrom?: Date;
    fetchedTo?: Date;
    onlyProblematic: boolean;
}

export interface RawArticlePagination {
    page: number;
    limit: number;
}

export function parseRawArticlePagination(
    value: unknown = {},
): RawArticlePagination {
    const input = object(value, 'Pagination');
    onlyKeys(input, ['page', 'limit']);
    const integer = (value: unknown, fallback: number, label: string) => {
        if (value === undefined) return fallback;
        if (
            (typeof value !== 'number' && typeof value !== 'string') ||
            (typeof value === 'string' && !/^[1-9]\d*$/.test(value))
        )
            throw new Error(`${label} must be a positive integer`);
        const result = Number(value);
        if (!Number.isSafeInteger(result) || result < 1)
            throw new Error(`${label} must be a positive safe integer`);
        return result;
    };
    const page = integer(input.page, 1, 'page');
    const limit = integer(input.limit, 50, 'limit');
    if (limit > 100) throw new Error('limit must be between 1 and 100');
    return { page, limit };
}

export function parseRawArticlesListQuery(value: unknown = {}) {
    const { page, limit, ...filters } = object(value, 'Query');
    return {
        filters: parseRawArticleFilters(filters),
        ...parseRawArticlePagination({ page, limit }),
    };
}

export interface RawArticlesPreviewInput {
    action: RawArticleAction;
    scope:
        | { type: 'FILTERED'; filters: RawArticleFilters }
        | { type: 'SELECTED'; ids: string[] };
}

export interface RawArticlesBatchInput {
    action: RawArticleAction;
    items: Array<{ id: string; updatedAt: Date }>;
}

function object(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: string[]) {
    if (Object.keys(value).some((key) => !keys.includes(key))) {
        throw new Error('Unknown request parameter');
    }
}

function optionalString(value: unknown, label: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`${label} must be a string`);
    return value.trim() || undefined;
}

function requiredString(value: unknown, label: string): string {
    const result = optionalString(value, label);
    if (!result) throw new Error(`${label} is required`);
    return result;
}

export function parseRawArticleTimestamp(value: unknown, label: string): Date {
    const text = requiredString(value, label);
    const match =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
            text,
        );
    if (!match)
        throw new Error(`${label} must be an ISO timestamp with timezone`);
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
        match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const result = new Date(text);
    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > days[month - 1] ||
        Number(hourText) > 23 ||
        Number(minuteText) > 59 ||
        Number(secondText) > 59 ||
        Number.isNaN(result.getTime())
    ) {
        throw new Error(`${label} is invalid`);
    }
    return result;
}

export function parseRawArticleFilters(value: unknown = {}): RawArticleFilters {
    const input = object(value, 'Filters');
    onlyKeys(input, [
        'search',
        'status',
        'contentAvailability',
        'sourceName',
        'fetchedFrom',
        'fetchedTo',
        'onlyProblematic',
    ]);
    const status = optionalString(input.status, 'status');
    const contentAvailability = optionalString(
        input.contentAvailability,
        'contentAvailability',
    );
    if (
        status &&
        !Object.values(ArticleStatus).includes(status as ArticleStatus)
    ) {
        throw new Error('Invalid article status');
    }
    if (
        contentAvailability &&
        !Object.values(ContentAvailability).includes(
            contentAvailability as ContentAvailability,
        )
    ) {
        throw new Error('Invalid content availability');
    }
    const flag = input.onlyProblematic;
    if (
        flag !== undefined &&
        flag !== true &&
        flag !== false &&
        flag !== 'true' &&
        flag !== 'false'
    ) {
        throw new Error('onlyProblematic must be a boolean');
    }
    const fetchedFrom =
        input.fetchedFrom === undefined
            ? undefined
            : parseRawArticleTimestamp(input.fetchedFrom, 'fetchedFrom');
    const fetchedTo =
        input.fetchedTo === undefined
            ? undefined
            : parseRawArticleTimestamp(input.fetchedTo, 'fetchedTo');
    if (fetchedFrom && fetchedTo && fetchedFrom >= fetchedTo) {
        throw new Error('fetchedFrom must be earlier than fetchedTo');
    }
    return {
        search: optionalString(input.search, 'search'),
        status: status as ArticleStatus | undefined,
        contentAvailability: contentAvailability as
            ContentAvailability | undefined,
        sourceName: optionalString(input.sourceName, 'sourceName'),
        fetchedFrom,
        fetchedTo,
        onlyProblematic: flag === true || flag === 'true',
    };
}

function action(value: unknown): RawArticleAction {
    if (
        typeof value !== 'string' ||
        !RAW_ARTICLE_ACTIONS.includes(value as RawArticleAction)
    ) {
        throw new Error('Invalid bulk action');
    }
    return value as RawArticleAction;
}

function uniqueIds(ids: string[]) {
    if (new Set(ids).size !== ids.length)
        throw new Error('Duplicate article IDs');
}

export function parseRawArticlesPreview(
    value: unknown,
): RawArticlesPreviewInput {
    const input = object(value, 'Preview');
    onlyKeys(input, ['action', 'scope']);
    const parsedAction = action(input.action);
    const scope = object(input.scope, 'scope');
    if (scope.type === 'FILTERED') {
        onlyKeys(scope, ['type', 'filters']);
        return {
            action: parsedAction,
            scope: {
                type: 'FILTERED',
                filters: parseRawArticleFilters(scope.filters),
            },
        };
    }
    if (scope.type === 'SELECTED') {
        onlyKeys(scope, ['type', 'ids']);
        if (!Array.isArray(scope.ids) || scope.ids.length === 0)
            throw new Error('Selected IDs are required');
        const ids = scope.ids.map((id) => requiredString(id, 'Article ID'));
        uniqueIds(ids);
        return { action: parsedAction, scope: { type: 'SELECTED', ids } };
    }
    throw new Error('Invalid selection scope');
}

export function parseRawArticlesBatch(value: unknown): RawArticlesBatchInput {
    const input = object(value, 'Batch');
    onlyKeys(input, ['action', 'items']);
    const parsedAction = action(input.action);
    if (
        !Array.isArray(input.items) ||
        input.items.length < 1 ||
        input.items.length > 100
    ) {
        throw new Error('Batch must contain between 1 and 100 articles');
    }
    const items = input.items.map((value) => {
        const item = object(value, 'Batch item');
        onlyKeys(item, ['id', 'updatedAt']);
        return {
            id: requiredString(item.id, 'Article ID'),
            updatedAt: parseRawArticleTimestamp(item.updatedAt, 'updatedAt'),
        };
    });
    uniqueIds(items.map((item) => item.id));
    return { action: parsedAction, items };
}
