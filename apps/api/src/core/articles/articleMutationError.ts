export class ArticleMutationError extends Error {
    constructor(
        message: string,
        public readonly statusCode: 400 | 404 | 409,
    ) {
        super(message);
        this.name = 'ArticleMutationError';
    }
}

export function parseExpectedUpdatedAt(value: unknown): Date | undefined {
    if (value === undefined) return undefined;
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
            value,
        ) ||
        Number.isNaN(new Date(value).getTime())
    ) {
        throw new ArticleMutationError('Invalid article version.', 400);
    }
    return new Date(value);
}
