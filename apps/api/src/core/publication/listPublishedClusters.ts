import {
    BlockType,
    ClusterStatus,
    OpinionStance,
    Prisma,
    type PrismaClient,
} from '@prisma/client';

const publishedClusterSorts = [
    'NEWEST',
    'OLDEST',
    'MOST_SOURCES',
    'TITLE_ASC',
] as const;

type PublishedClusterSort = (typeof publishedClusterSorts)[number];

export interface PublishedClustersQuery {
    page?: unknown;
    limit?: unknown;
    search?: unknown;
    publishedFrom?: unknown;
    publishedTo?: unknown;
    minSources?: unknown;
    blockType?: unknown;
    sort?: unknown;
}

export interface ListPublishedClustersInput {
    page: number;
    limit: number;
    search?: string;
    publishedFrom?: string;
    publishedTo?: string;
    minSources?: number;
    blockType?: BlockType;
    sort: PublishedClusterSort;
}

function optionalString(value: unknown, name: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') {
        throw new Error(`${name} must be a string`);
    }
    return value.trim();
}

function optionalNumber(value: unknown, name: string): number | undefined {
    if (value === undefined) return undefined;
    if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && value.trim() === '')
    ) {
        throw new Error(`${name} must be a number`);
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error(`${name} must be a finite number`);
    }
    return number;
}

function optionalDate(value: unknown, name: string): string | undefined {
    const text = optionalString(value, name);
    if (text === undefined) return undefined;
    const isoTimestamp =
        /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
    const date = new Date(text);
    const calendarDate = new Date(`${text.slice(0, 10)}T00:00:00Z`);
    if (
        !isoTimestamp.test(text) ||
        !Number.isFinite(date.getTime()) ||
        !Number.isFinite(calendarDate.getTime()) ||
        calendarDate.toISOString().slice(0, 10) !== text.slice(0, 10)
    ) {
        throw new Error(
            `${name} must be a valid ISO timestamp with a timezone`,
        );
    }
    return date.toISOString();
}

export function parsePublishedClustersQuery(
    query: PublishedClustersQuery = {},
): ListPublishedClustersInput {
    const page = optionalNumber(query.page, 'page') ?? 1;
    const limit = optionalNumber(query.limit, 'limit') ?? 10;
    const search = optionalString(query.search, 'search');
    const publishedFrom = optionalDate(query.publishedFrom, 'publishedFrom');
    const publishedTo = optionalDate(query.publishedTo, 'publishedTo');
    const minSources = optionalNumber(query.minSources, 'minSources');
    const blockType = optionalString(query.blockType, 'blockType');
    const sort = optionalString(query.sort, 'sort') ?? 'NEWEST';

    if (
        minSources !== undefined &&
        (!Number.isSafeInteger(minSources) || minSources <= 0)
    ) {
        throw new Error('minSources must be a positive integer');
    }
    if (
        blockType !== undefined &&
        !Object.values(BlockType).includes(blockType as BlockType)
    ) {
        throw new Error('blockType must be FACT, CONTEXT or OPINION');
    }
    if (!publishedClusterSorts.includes(sort as PublishedClusterSort)) {
        throw new Error(
            'sort must be NEWEST, OLDEST, MOST_SOURCES or TITLE_ASC',
        );
    }
    if (
        publishedFrom &&
        publishedTo &&
        new Date(publishedFrom).getTime() >= new Date(publishedTo).getTime()
    ) {
        throw new Error('publishedFrom must be earlier than publishedTo');
    }

    return {
        page:
            page > 0
                ? Math.max(
                      1,
                      Math.min(Math.floor(page), Number.MAX_SAFE_INTEGER),
                  )
                : 1,
        limit: limit > 0 ? Math.max(1, Math.min(Math.floor(limit), 50)) : 10,
        search: search || undefined,
        publishedFrom,
        publishedTo,
        minSources,
        blockType: blockType as BlockType | undefined,
        sort: sort as PublishedClusterSort,
    };
}

function buildWhere(
    input: ListPublishedClustersInput,
): Prisma.ClusterWhereInput {
    const where: Prisma.ClusterWhereInput = { status: ClusterStatus.PUBLISHED };
    if (input.publishedFrom || input.publishedTo) {
        where.publishedAt = {
            ...(input.publishedFrom
                ? { gte: new Date(input.publishedFrom) }
                : {}),
            ...(input.publishedTo ? { lt: new Date(input.publishedTo) } : {}),
        };
    }
    if (input.blockType) {
        where.blocks = { some: { type: input.blockType } };
    }
    if (input.search) {
        // PostgreSQL LIKE treats these characters specially; search is literal.
        const contains = input.search.replace(/[\\%_]/g, '\\$&');
        const textFilter = { contains, mode: Prisma.QueryMode.insensitive };
        const stances = Object.values(OpinionStance).filter((stance) =>
            stance.toLowerCase().includes(input.search!.toLowerCase()),
        );
        where.OR = [
            { id: textFilter },
            { humanId: textFilter },
            { title: textFilter },
            { summary: textFilter },
            { mainCountry: textFilter },
            {
                blocks: {
                    some: {
                        OR: [
                            { title: textFilter },
                            { content: textFilter },
                            { sourceName: textFilter },
                            { sourceUrl: textFilter },
                            { authorName: textFilter },
                            ...(stances.length > 0
                                ? [{ stance: { in: stances } }]
                                : []),
                        ],
                    },
                },
            },
        ];
    }
    return where;
}

function buildOrderBy(
    sort: PublishedClusterSort,
): Prisma.ClusterOrderByWithRelationInput[] {
    const newest: Prisma.ClusterOrderByWithRelationInput[] = [
        { publishedAt: 'desc' },
        { updatedAt: 'desc' },
        { id: 'asc' },
    ];
    if (sort === 'OLDEST') {
        return [{ publishedAt: 'asc' }, { updatedAt: 'asc' }, { id: 'asc' }];
    }
    if (sort === 'MOST_SOURCES') {
        return [{ articleLinks: { _count: 'desc' } }, ...newest];
    }
    if (sort === 'TITLE_ASC') {
        return [{ title: 'asc' }, ...newest];
    }
    return newest;
}

export async function listPublishedClusters({
    prisma,
    ...query
}: PublishedClustersQuery & { prisma: PrismaClient }) {
    const input = parsePublishedClustersQuery(query);

    return prisma.$transaction(
        async (tx) => {
            const baseWhere = buildWhere(input);
            let where = baseWhere;
            if (input.minSources !== undefined) {
                const qualifyingClusters = await tx.clusterArticle.groupBy({
                    by: ['clusterId'],
                    where: { cluster: { is: baseWhere } },
                    having: {
                        articleId: { _count: { gte: input.minSources } },
                    },
                });
                where = {
                    ...baseWhere,
                    id: {
                        in: qualifyingClusters.map(
                            (cluster) => cluster.clusterId,
                        ),
                    },
                };
            }

            const total = await tx.cluster.count({ where });
            const totalPublished = await tx.cluster.count({
                where: { status: ClusterStatus.PUBLISHED },
            });
            const totalPages = Math.max(1, Math.ceil(total / input.limit));
            const page = Math.min(input.page, totalPages);
            const items = await tx.cluster.findMany({
                where,
                orderBy: buildOrderBy(input.sort),
                skip: (page - 1) * input.limit,
                take: input.limit,
                select: {
                    id: true,
                    humanId: true,
                    title: true,
                    summary: true,
                    mainCountry: true,
                    startDate: true,
                    publishedAt: true,
                    updatedAt: true,
                    blocks: {
                        orderBy: { position: 'asc' },
                        select: {
                            id: true,
                            type: true,
                            title: true,
                            content: true,
                            position: true,
                            sourceName: true,
                            sourceUrl: true,
                            authorName: true,
                            stance: true,
                        },
                    },
                    _count: { select: { articleLinks: true, blocks: true } },
                },
            });

            return {
                items,
                pagination: {
                    page,
                    limit: input.limit,
                    total,
                    totalPublished,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}
