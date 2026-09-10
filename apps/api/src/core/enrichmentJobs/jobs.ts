import {
    EnrichmentItemStatus,
    EnrichmentJobStatus,
    Prisma,
    type PrismaClient,
} from '@prisma/client';
import { buildRawArticleFilterSql } from '../rawArticles';
import { jsonInput } from './contentVersions';
import {
    EnrichmentError,
    enrichmentArticleSelect,
    getEnrichmentEligibility,
    type EnrichmentScope,
    type EnrichmentClock,
} from './types';

function sortedJson(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(sortedJson);
    if (value && typeof value === 'object')
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, sortedJson(item)]),
        );
    return value;
}

export function canonicalEnrichmentScope(
    scope: EnrichmentScope,
): Prisma.InputJsonValue {
    const source =
        scope.type === 'SELECTED'
            ? { ...scope, ids: [...scope.ids].sort() }
            : scope;
    return jsonInput(sortedJson(source));
}

export async function lockEnrichmentJob(
    tx: Prisma.TransactionClient,
    jobId: string,
) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "EnrichmentJob" WHERE "id" = ${jobId} FOR UPDATE`,
    );
    if (!rows.length)
        throw new EnrichmentError('Enrichment job not found.', 404);
}

export async function finishEnrichmentJob(
    tx: Prisma.TransactionClient,
    jobId: string,
) {
    const outstanding = await tx.enrichmentJobItem.count({
        where: { jobId, status: { in: ['PENDING', 'RUNNING'] } },
    });
    if (!outstanding)
        await tx.enrichmentJob.updateMany({
            where: { id: jobId, status: { not: 'CANCELED' } },
            data: { status: 'COMPLETED' },
        });
}

async function jobSummary(tx: Prisma.TransactionClient, id: string) {
    const job = await tx.enrichmentJob.findUnique({ where: { id } });
    if (!job) throw new EnrichmentError('Enrichment job not found.', 404);
    const grouped = await tx.enrichmentJobItem.groupBy({
        by: ['status'],
        where: { jobId: id },
        _count: { _all: true },
    });
    const counts = Object.fromEntries(
        Object.values(EnrichmentItemStatus).map((status) => [status, 0]),
    ) as Record<EnrichmentItemStatus, number>;
    for (const row of grouped) counts[row.status] = row._count._all;
    const { scope: _scope, ...summary } = job;
    return { ...summary, counts };
}

export async function startEnrichmentJob({
    prisma,
    scope,
    createdByUserId,
    requestId,
    now = () => new Date(),
}: {
    prisma: PrismaClient;
    scope: EnrichmentScope;
    createdByUserId: string;
    requestId?: string;
    now?: EnrichmentClock;
}) {
    const canonicalScope = canonicalEnrichmentScope(scope);
    const checkExisting = (job: {
        createdByUserId: string;
        scope: Prisma.JsonValue;
    }) => {
        if (
            job.createdByUserId !== createdByUserId ||
            JSON.stringify(sortedJson(job.scope)) !==
                JSON.stringify(canonicalScope)
        ) {
            throw new EnrichmentError(
                'requestId was already used for a different selection.',
                409,
            );
        }
    };
    let jobId: string;
    try {
        jobId = await prisma.$transaction(
            async (tx) => {
                if (requestId) {
                    const existing = await tx.enrichmentJob.findUnique({
                        where: { requestId },
                    });
                    if (existing) {
                        checkExisting(existing);
                        return existing.id;
                    }
                }
                const ids = await tx.$queryRaw<Array<{ id: string }>>(
                    buildRawArticleFilterSql(
                        scope.type === 'FILTERED'
                            ? scope.filters
                            : { onlyProblematic: false },
                        scope.type === 'SELECTED' ? scope.ids : undefined,
                    ),
                );
                const job = await tx.enrichmentJob.create({
                    data: {
                        createdByUserId,
                        requestId,
                        scope: canonicalScope,
                        total:
                            scope.type === 'SELECTED'
                                ? scope.ids.length
                                : ids.length,
                    },
                });
                const foundIds = new Set<string>();
                for (let offset = 0; offset < ids.length; offset += 1000) {
                    const articles = await tx.article.findMany({
                        where: {
                            id: {
                                in: ids
                                    .slice(offset, offset + 1000)
                                    .map(({ id }) => id),
                            },
                        },
                        select: enrichmentArticleSelect,
                    });
                    const data = articles.map((article) => {
                        foundIds.add(article.id);
                        const eligibility = getEnrichmentEligibility(article);
                        return {
                            jobId: job.id,
                            articleId: article.id,
                            title: article.title,
                            expectedArticleUpdatedAt: article.updatedAt,
                            status: eligibility.eligible
                                ? EnrichmentItemStatus.PENDING
                                : EnrichmentItemStatus.SKIPPED,
                            reason: eligibility.reason ?? null,
                            createdAt: now(),
                        };
                    });
                    if (data.length)
                        await tx.enrichmentJobItem.createMany({ data });
                }
                if (scope.type === 'SELECTED') {
                    const missing = scope.ids.filter((id) => !foundIds.has(id));
                    for (
                        let offset = 0;
                        offset < missing.length;
                        offset += 1000
                    ) {
                        await tx.enrichmentJobItem.createMany({
                            data: missing
                                .slice(offset, offset + 1000)
                                .map((articleId) => ({
                                    jobId: job.id,
                                    articleId,
                                    title: articleId,
                                    status: 'SKIPPED',
                                    reason: 'Article no longer exists.',
                                })),
                        });
                    }
                }
                await finishEnrichmentJob(tx, job.id);
                return job.id;
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
                timeout: 30000,
            },
        );
    } catch (error) {
        if (
            !requestId ||
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== 'P2002'
        )
            throw error;
        const existing = await prisma.enrichmentJob.findUnique({
            where: { requestId },
        });
        if (!existing) throw error;
        checkExisting(existing);
        jobId = existing.id;
    }
    return prisma.$transaction(
        async (tx) => ({ job: await jobSummary(tx, jobId) }),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function listEnrichmentJobs({
    prisma,
    limit = 20,
}: {
    prisma: PrismaClient;
    limit?: number;
}) {
    return prisma.$transaction(
        async (tx) => {
            const needsAttention: Prisma.EnrichmentJobWhereInput = {
                OR: [
                    { status: { in: ['QUEUED', 'RUNNING'] } },
                    {
                        items: {
                            some: {
                                OR: [
                                    { status: { in: ['RUNNING', 'ERROR'] } },
                                    { proposalStatus: 'PENDING' },
                                ],
                            },
                        },
                    },
                ],
            };
            const active = await tx.enrichmentJob.findMany({
                where: needsAttention,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                select: { id: true },
            });
            const recent = await tx.enrichmentJob.findMany({
                where: { NOT: needsAttention },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                take: Math.min(100, Math.max(1, limit)),
                select: { id: true },
            });
            const jobs = [...active, ...recent];
            return {
                jobs: await Promise.all(
                    jobs.map(({ id }) => jobSummary(tx, id)),
                ),
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export function enrichmentItemSummary<
    T extends {
        proposal: Prisma.JsonValue | null;
        leaseToken: string | null;
        leaseExpiresAt: Date | null;
    },
>(item: T) {
    const {
        proposal,
        leaseToken: _leaseToken,
        leaseExpiresAt: _leaseExpiresAt,
        ...summary
    } = item;
    return { ...summary, hasProposal: proposal !== null };
}

export async function getEnrichmentJob({
    prisma,
    jobId,
    page = 1,
    limit = 50,
}: {
    prisma: PrismaClient;
    jobId: string;
    page?: number;
    limit?: number;
}) {
    return prisma.$transaction(
        async (tx) => {
            const job = await jobSummary(tx, jobId);
            const pageLimit = Math.min(100, Math.max(1, limit));
            const totalPages = Math.max(1, Math.ceil(job.total / pageLimit));
            const currentPage = Math.min(totalPages, Math.max(1, page));
            const items = await tx.enrichmentJobItem.findMany({
                where: { jobId },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                skip: (currentPage - 1) * pageLimit,
                take: pageLimit,
                select: {
                    id: true,
                    jobId: true,
                    articleId: true,
                    title: true,
                    expectedArticleUpdatedAt: true,
                    status: true,
                    reason: true,
                    attempts: true,
                    proposalStatus: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            return {
                job,
                items: items.map((item) => ({
                    ...item,
                    hasProposal: item.proposalStatus !== null,
                })),
                pagination: {
                    page: currentPage,
                    limit: pageLimit,
                    total: job.total,
                    totalPages,
                },
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function stopEnrichmentJob({
    prisma,
    jobId,
}: {
    prisma: PrismaClient;
    jobId: string;
}) {
    return prisma.$transaction(async (tx) => {
        await lockEnrichmentJob(tx, jobId);
        const current = await tx.enrichmentJob.findUniqueOrThrow({
            where: { id: jobId },
            select: { scope: true },
        });
        const automaticScope =
            current.scope !== null &&
            typeof current.scope === 'object' &&
            !Array.isArray(current.scope) &&
            current.scope.type === 'AUTOMATIC_FETCH'
                ? current.scope
                : null;
        await tx.enrichmentJob.updateMany({
            where: {
                id: jobId,
                status: {
                    in: automaticScope
                        ? ['QUEUED', 'RUNNING', 'COMPLETED']
                        : ['QUEUED', 'RUNNING'],
                },
            },
            data: {
                status: 'CANCELED',
                // Retrying errors can make this job active again. Keep the
                // user's stop request for articles arriving later in Fetch.
                ...(automaticScope
                    ? {
                          scope: jsonInput({
                              ...automaticScope,
                              stopRequested: true,
                          }),
                      }
                    : {}),
            },
        });
        await tx.enrichmentJobItem.updateMany({
            where: { jobId, status: 'PENDING' },
            data: { status: 'CANCELED', reason: 'Canceled before processing.' },
        });
        return { job: await jobSummary(tx, jobId) };
    });
}

export async function retryEnrichmentJobErrors({
    prisma,
    jobId,
}: {
    prisma: PrismaClient;
    jobId: string;
}) {
    return prisma.$transaction(async (tx) => {
        await lockEnrichmentJob(tx, jobId);
        const retried = await tx.enrichmentJobItem.updateMany({
            where: { jobId, status: 'ERROR' },
            data: {
                status: 'PENDING',
                reason: null,
                leaseToken: null,
                leaseExpiresAt: null,
            },
        });
        if (retried.count)
            await tx.enrichmentJob.update({
                where: { id: jobId },
                data: { status: EnrichmentJobStatus.QUEUED },
            });
        return { job: await jobSummary(tx, jobId) };
    });
}
