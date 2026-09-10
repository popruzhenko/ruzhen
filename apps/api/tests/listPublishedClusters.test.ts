import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BlockType,
    ClusterStatus,
    OpinionStance,
    type Prisma,
    type PrismaClient,
} from '@prisma/client';

import {
    listPublishedClusters,
    parsePublishedClustersQuery,
} from '../src/core/publication/listPublishedClusters';

interface BlockFixture {
    id: string;
    type: BlockType;
    title: string | null;
    content: string;
    position: number;
    sourceName: string | null;
    sourceUrl: string | null;
    authorName: string | null;
    stance: OpinionStance | null;
}

interface ClusterFixture {
    id: string;
    humanId: string;
    title: string;
    summary: string | null;
    mainCountry: string | null;
    startDate: Date | null;
    status: ClusterStatus;
    publishedAt: Date | null;
    updatedAt: Date;
    blocks: BlockFixture[];
    _count: { articleLinks: number; blocks: number };
}

const makeBlock = (overrides: Partial<BlockFixture> = {}): BlockFixture => ({
    id: 'block-1',
    type: BlockType.FACT,
    title: null,
    content: 'Regular block content',
    position: 1,
    sourceName: null,
    sourceUrl: null,
    authorName: null,
    stance: null,
    ...overrides,
});

const makeCluster = (
    id: string,
    overrides: Partial<ClusterFixture> = {},
): ClusterFixture => ({
    id,
    humanId: `human-${id}`,
    title: `Title ${id}`,
    summary: null,
    mainCountry: null,
    startDate: null,
    status: ClusterStatus.PUBLISHED,
    publishedAt: new Date('2026-09-09T12:00:00Z'),
    updatedAt: new Date('2026-09-09T12:00:00Z'),
    blocks: [],
    _count: { articleLinks: 2, blocks: 0 },
    ...overrides,
});

const record = (value: unknown): Record<string, unknown> => {
    assert.ok(value !== null && typeof value === 'object');
    return value as Record<string, unknown>;
};

// Interpret only the query operations used by this endpoint. This evaluates
// filtering before pagination, but does not claim to exercise PostgreSQL.
const containsPattern = (pattern: string, insensitive: boolean) => {
    let expression = '';
    for (let index = 0; index < pattern.length; index += 1) {
        let character = pattern[index];
        if (character === '\\') {
            index += 1;
            assert.ok(index < pattern.length, 'Unescaped trailing backslash');
            character = pattern[index];
        } else if (character === '%') {
            expression += '.*';
            continue;
        } else if (character === '_') {
            expression += '.';
            continue;
        }
        expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(expression, insensitive ? 'isu' : 'su');
};

const matchesScalar = (actual: unknown, condition: unknown): boolean => {
    if (
        condition === null ||
        typeof condition !== 'object' ||
        condition instanceof Date
    ) {
        return actual === condition;
    }

    const filter = record(condition);
    return Object.entries(filter).every(([operator, expected]) => {
        if (operator === 'mode') return true;
        if (operator === 'equals') return actual === expected;
        if (operator === 'not') return !matchesScalar(actual, expected);
        if (operator === 'in') {
            assert.ok(Array.isArray(expected));
            return expected.includes(actual);
        }
        if (operator === 'contains') {
            assert.equal(typeof expected, 'string');
            return (
                typeof actual === 'string' &&
                containsPattern(
                    expected as string,
                    filter.mode === 'insensitive',
                ).test(actual)
            );
        }
        if (['gte', 'gt', 'lte', 'lt'].includes(operator)) {
            if (actual === null) return false;
            const value =
                actual instanceof Date ? actual.getTime() : Number(actual);
            const boundary =
                actual instanceof Date
                    ? new Date(expected as string | Date).getTime()
                    : Number(expected);
            if (operator === 'gte') return value >= boundary;
            if (operator === 'gt') return value > boundary;
            if (operator === 'lte') return value <= boundary;
            return value < boundary;
        }
        assert.fail(`Unsupported scalar operator: ${operator}`);
    });
};

const matchesWhere = (item: unknown, where: unknown): boolean => {
    const row = record(item);
    return Object.entries(record(where ?? {})).every(([field, condition]) => {
        if (condition === undefined) return true;
        if (field === 'AND') {
            const clauses = Array.isArray(condition) ? condition : [condition];
            return clauses.every((clause) => matchesWhere(row, clause));
        }
        if (field === 'OR') {
            assert.ok(Array.isArray(condition));
            return condition.some((clause) => matchesWhere(row, clause));
        }
        if (field === 'NOT') {
            const clauses = Array.isArray(condition) ? condition : [condition];
            return clauses.every((clause) => !matchesWhere(row, clause));
        }
        if (field === 'blocks') {
            const relation = record(condition);
            assert.deepEqual(Object.keys(relation), ['some']);
            assert.ok(Array.isArray(row.blocks));
            return row.blocks.some((block) =>
                matchesWhere(block, relation.some),
            );
        }
        assert.ok(field in row, `Unknown fixture field: ${field}`);
        return matchesScalar(row[field], condition);
    });
};

const compareClusters = (
    left: ClusterFixture,
    right: ClusterFixture,
    orderBy: unknown,
) => {
    for (const order of Array.isArray(orderBy) ? orderBy : [orderBy]) {
        const [[field, input]] = Object.entries(record(order));
        const sort =
            typeof input === 'string'
                ? input
                : record(input)[field === 'articleLinks' ? '_count' : 'sort'];
        const a =
            field === 'articleLinks'
                ? left._count.articleLinks
                : record(left)[field];
        const b =
            field === 'articleLinks'
                ? right._count.articleLinks
                : record(right)[field];
        if (a === b) continue;
        const value =
            a instanceof Date && b instanceof Date
                ? a.getTime() - b.getTime()
                : typeof a === 'number' && typeof b === 'number'
                  ? a - b
                  : String(a).localeCompare(String(b), 'en');
        if (value !== 0) return sort === 'desc' ? -value : value;
    }
    return 0;
};

const makePrismaDouble = (fixtures: ClusterFixture[]) => {
    const calls = {
        transactions: 0,
        groupBy: [] as Prisma.ClusterArticleGroupByArgs[],
        findMany: [] as Prisma.ClusterFindManyArgs[],
    };
    const outsideTransaction = async () => {
        assert.fail('Public feed reads must use the transaction client');
    };
    const prisma = {
        cluster: {
            findMany: outsideTransaction,
            count: outsideTransaction,
        },
        clusterArticle: { groupBy: outsideTransaction },
        $transaction: async <T>(
            run: (tx: Prisma.TransactionClient) => Promise<T>,
            options: { isolationLevel?: string },
        ): Promise<T> => {
            calls.transactions += 1;
            assert.equal(options.isolationLevel, 'RepeatableRead');
            const tx = {
                clusterArticle: {
                    groupBy: async (args: Prisma.ClusterArticleGroupByArgs) => {
                        calls.groupBy.push(args);
                        assert.deepEqual(args.by, ['clusterId']);
                        const minimum = record(
                            record(args.having).articleId,
                        )._count;
                        const clusterRelation = record(args.where?.cluster);
                        assert.ok(clusterRelation.is);
                        return fixtures
                            .filter(
                                (cluster) =>
                                    matchesWhere(cluster, clusterRelation.is) &&
                                    matchesScalar(
                                        cluster._count.articleLinks,
                                        minimum,
                                    ),
                            )
                            .map(({ id }) => ({ clusterId: id }));
                    },
                },
                cluster: {
                    count: async (args: Prisma.ClusterCountArgs) =>
                        fixtures.filter((item) =>
                            matchesWhere(item, args.where),
                        ).length,
                    findMany: async (args: Prisma.ClusterFindManyArgs) => {
                        calls.findMany.push(args);
                        assert.ok(
                            args.select,
                            'Keep the public field selection',
                        );
                        assert.equal(args.select.id, true);
                        assert.equal(args.select.blocks !== undefined, true);
                        assert.ok(Number.isInteger(args.skip));
                        assert.ok(Number.isInteger(args.take));
                        assert.ok(
                            (args.take ?? 0) > 0 && (args.take ?? 0) <= 50,
                        );
                        return fixtures
                            .filter((item) => matchesWhere(item, args.where))
                            .sort((a, b) => compareClusters(a, b, args.orderBy))
                            .slice(
                                args.skip ?? 0,
                                (args.skip ?? 0) + args.take!,
                            );
                    },
                },
            } as unknown as Prisma.TransactionClient;
            return run(tx);
        },
    } as unknown as PrismaClient;
    return { prisma, calls };
};

type RawQuery = Parameters<typeof parsePublishedClustersQuery>[0];

const loadFeed = (fixtures: ClusterFixture[], query: RawQuery = {}) => {
    const harness = makePrismaDouble(fixtures);
    return {
        ...harness,
        result: listPublishedClusters({
            prisma: harness.prisma,
            ...parsePublishedClustersQuery(query),
        }),
    };
};

test('normalizes pagination and ISO bounds without accepting malformed input', () => {
    const defaults = parsePublishedClustersQuery({});
    assert.equal(defaults.page, 1);
    assert.equal(defaults.limit, 10);
    const parsed = parsePublishedClustersQuery({
        page: '2.9',
        limit: '80.5',
        search: '  Mixed CASE  ',
        publishedFrom: '2024-02-29T00:00:00+02:00',
        publishedTo: '2024-03-01T00:00:00+02:00',
        minSources: '3',
        blockType: 'FACT',
        sort: 'TITLE_ASC',
    });
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, 50);
    assert.equal(parsed.search?.toLowerCase(), 'mixed case');
    assert.equal(parsed.publishedFrom, '2024-02-28T22:00:00.000Z');
    assert.equal(parsed.publishedTo, '2024-02-29T22:00:00.000Z');
    assert.equal(parsed.minSources, 3);
    assert.equal(parsed.blockType, 'FACT');
    assert.equal(parsed.sort, 'TITLE_ASC');
    assert.equal(parsePublishedClustersQuery({ page: 0 }).page, 1);
    assert.equal(parsePublishedClustersQuery({ limit: -1 }).limit, 10);
});

test('rejects invalid query scalars, enums, minimum source counts and dates', () => {
    const invalid: Record<string, unknown>[] = [
        { page: 'abc' },
        { page: Number.NaN },
        { page: Infinity },
        { limit: 'Infinity' },
        { minSources: 0 },
        { minSources: -2 },
        { minSources: 1.5 },
        { minSources: '2garbage' },
        { minSources: Infinity },
        { blockType: 'ALL' },
        { sort: 'UNKNOWN' },
        { publishedFrom: '2026-09-01' },
        { publishedFrom: '2026-09-01T00:00:00' },
        { publishedFrom: '2026-02-29T00:00:00Z' },
        { publishedFrom: '2026-02-30T00:00:00Z' },
        { publishedFrom: '2026-09-01T00:00:00+25:00' },
        {
            publishedFrom: '2026-09-02T00:00:00Z',
            publishedTo: '2026-09-01T00:00:00Z',
        },
    ];
    for (const field of [
        'page',
        'limit',
        'search',
        'publishedFrom',
        'publishedTo',
        'minSources',
        'blockType',
        'sort',
    ]) {
        invalid.push({ [field]: ['1'] }, { [field]: { value: '1' } });
    }
    for (const query of invalid) {
        assert.throws(
            () => parsePublishedClustersQuery(query as RawQuery),
            `Should reject ${JSON.stringify(query)}`,
        );
    }
});

test('finds a material beyond the first ten rows and counts the full published feed', async () => {
    const fixtures = Array.from({ length: 12 }, (_, index) =>
        makeCluster(`article-${index}`, {
            title: index === 11 ? 'Old UNIQUE match' : 'Ordinary headline',
            publishedAt: new Date(Date.UTC(2026, 8, 20 - index)),
        }),
    );
    fixtures.push(
        makeCluster('private-match', {
            title: 'UNIQUE unpublished match',
            status: ClusterStatus.DRAFT,
        }),
    );
    const { result, calls } = loadFeed(fixtures, { search: ' unique ' });
    const response = await result;
    assert.deepEqual(
        response.items.map(({ id }) => id),
        ['article-11'],
    );
    assert.equal(response.pagination.total, 1);
    assert.equal(response.pagination.totalPublished, 12);
    assert.equal(response.pagination.totalPages, 1);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.groupBy.length, 0);
});

test('search covers cluster fields, all block text fields, and partial enum stance', async () => {
    const fixtures = [
        makeCluster('needle-id', {
            humanId: 'plain-human-id',
            title: 'Plain title',
        }),
        ...['humanId', 'title', 'summary', 'mainCountry'].map((field) =>
            makeCluster(`cluster-${field}`, { [field]: 'NEEDLE value' }),
        ),
        ...['title', 'content', 'sourceName', 'sourceUrl', 'authorName'].map(
            (field) =>
                makeCluster(`block-${field}`, {
                    blocks: [makeBlock({ [field]: 'NEEDLE value' })],
                }),
        ),
        makeCluster('unrelated'),
    ];
    const response = await loadFeed(fixtures, {
        search: 'needle',
        limit: 50,
    }).result;
    assert.deepEqual(
        response.items.map(({ id }) => id).sort(),
        fixtures
            .slice(0, -1)
            .map(({ id }) => id)
            .sort(),
    );

    const stances = [
        { id: 'stance-a', stance: OpinionStance.PRO },
        { id: 'stance-b', stance: OpinionStance.CONTRA },
        { id: 'stance-c', stance: OpinionStance.NEUTRAL },
    ].map(({ id, stance }) =>
        makeCluster(id, { blocks: [makeBlock({ stance })] }),
    );
    const stanceResponse = await loadFeed(stances, { search: 'tra' }).result;
    assert.deepEqual(stanceResponse.items.map(({ id }) => id).sort(), [
        'stance-b',
        'stance-c',
    ]);
    const blockTypeResponse = await loadFeed(stances, { search: 'FACT' })
        .result;
    assert.equal(blockTypeResponse.pagination.total, 0);
});

test('search treats percent, underscore and backslash as literal characters', async () => {
    for (const [search, matching, other] of [
        ['50%', 'Yield 50% today', 'Yield 500 today'],
        ['under_score', 'An under_score value', 'An underXscore value'],
        ['a\\b', 'An a\\b value', 'An ab value'],
        ['\\_%', 'Literal \\_% token', 'Literal \\AX token'],
    ]) {
        const response = await loadFeed(
            [
                makeCluster('match', { title: matching }),
                makeCluster('other', { title: other }),
            ],
            { search },
        ).result;
        assert.deepEqual(
            response.items.map(({ id }) => id),
            ['match'],
            search,
        );
    }
});

test('combines date bounds, source counts and independent block predicates before pagination', async () => {
    const from = '2026-09-01T00:00:00.000Z';
    const to = '2026-09-02T00:00:00.000Z';
    const matching = makeCluster('match', {
        publishedAt: new Date(from),
        blocks: [
            makeBlock({
                type: BlockType.OPINION,
                content: 'Rare search token',
            }),
            makeBlock({ id: 'fact', type: BlockType.FACT, position: 2 }),
        ],
        _count: { articleLinks: 3, blocks: 2 },
    });
    const fixtures = [
        matching,
        {
            ...matching,
            id: 'before',
            publishedAt: new Date(Date.parse(from) - 1),
        },
        { ...matching, id: 'at-end', publishedAt: new Date(to) },
        { ...matching, id: 'null-date', publishedAt: null },
        {
            ...matching,
            id: 'few-sources',
            _count: { articleLinks: 2, blocks: 2 },
        },
        { ...matching, id: 'no-facts', blocks: [matching.blocks[0]] },
        { ...matching, id: 'private', status: ClusterStatus.ARCHIVED },
    ];
    const { result, calls } = loadFeed(fixtures, {
        search: 'rare search',
        publishedFrom: from,
        publishedTo: to,
        minSources: 3,
        blockType: 'FACT',
        limit: 1,
    });
    const response = await result;
    assert.deepEqual(
        response.items.map(({ id }) => id),
        ['match'],
    );
    assert.equal(response.pagination.total, 1);
    assert.equal(response.pagination.totalPublished, 6);
    assert.equal(calls.groupBy.length, 1);
    assert.equal(calls.findMany[0].take, 1);
});

test('a source threshold with no qualifying clusters returns an empty filtered feed', async () => {
    const response = await loadFeed([makeCluster('few-sources')], {
        minSources: 10,
        page: 7,
    }).result;
    assert.deepEqual(response.items, []);
    assert.equal(response.pagination.total, 0);
    assert.equal(response.pagination.totalPublished, 1);
    assert.equal(response.pagination.page, 1);
    assert.equal(response.pagination.totalPages, 1);
    assert.equal(response.pagination.hasNextPage, false);
    assert.equal(response.pagination.hasPreviousPage, false);
});

test('all sort choices order the full result with deterministic date and ID tie breakers', async () => {
    const fixtures = [
        makeCluster('b', {
            title: 'Beta',
            _count: { articleLinks: 1, blocks: 0 },
        }),
        makeCluster('a', { title: 'Alpha' }),
        makeCluster('c', {
            title: 'Alpha',
            updatedAt: new Date('2026-09-08T12:00:00Z'),
        }),
        makeCluster('d', {
            title: 'Delta',
            publishedAt: new Date('2026-09-08T12:00:00Z'),
            updatedAt: new Date('2026-09-10T12:00:00Z'),
            _count: { articleLinks: 5, blocks: 0 },
        }),
    ];
    const expectations = {
        NEWEST: ['a', 'b', 'c', 'd'],
        OLDEST: ['d', 'c', 'a', 'b'],
        MOST_SOURCES: ['d', 'a', 'c', 'b'],
        TITLE_ASC: ['a', 'c', 'b', 'd'],
    };
    for (const [sort, ids] of Object.entries(expectations)) {
        const first = await loadFeed(fixtures, { sort, limit: 2 }).result;
        const second = await loadFeed(fixtures, { sort, limit: 2, page: 2 })
            .result;
        assert.deepEqual(
            [...first.items, ...second.items].map(({ id }) => id),
            ids,
            sort,
        );
        assert.equal(first.pagination.hasNextPage, true);
        assert.equal(second.pagination.hasPreviousPage, true);
    }
});

test('clamps out of range pages and handles an entirely empty feed', async () => {
    const fixtures = Array.from({ length: 12 }, (_, index) =>
        makeCluster(`row-${String(index).padStart(2, '0')}`),
    );
    const response = await loadFeed(fixtures, { page: 99, limit: 5 }).result;
    assert.deepEqual(
        response.items.map(({ id }) => id),
        ['row-10', 'row-11'],
    );
    assert.equal(response.pagination.page, 3);
    assert.equal(response.pagination.totalPages, 3);
    assert.equal(response.pagination.total, 12);
    assert.equal(response.pagination.totalPublished, 12);
    assert.equal(response.pagination.hasNextPage, false);
    assert.equal(response.pagination.hasPreviousPage, true);

    const empty = await loadFeed([], { page: 99 }).result;
    assert.deepEqual(empty.items, []);
    assert.equal(empty.pagination.page, 1);
    assert.equal(empty.pagination.totalPages, 1);
    assert.equal(empty.pagination.total, 0);
    assert.equal(empty.pagination.totalPublished, 0);
});
