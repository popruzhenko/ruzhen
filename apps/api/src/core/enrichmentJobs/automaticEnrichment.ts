import { Prisma } from '@prisma/client';
import { finishEnrichmentJob, lockEnrichmentJob } from './jobs';
import { EnrichmentError, getEnrichmentEligibility } from './types';

export interface AutomaticEnrichmentContext {
    jobId: string;
    createdByUserId: string;
}

export type AutomaticEnrichmentArticle = Parameters<
    typeof getEnrichmentEligibility
>[0] & {
    id: string;
    title: string;
    updatedAt: Date;
};

function checkAutomaticJob(
    job: {
        requestId: string | null;
        createdByUserId: string;
        scope: Prisma.JsonValue;
    },
    context: AutomaticEnrichmentContext,
) {
    if (
        job.requestId !== `fetch:${context.jobId}` ||
        job.createdByUserId !== context.createdByUserId ||
        !job.scope ||
        typeof job.scope !== 'object' ||
        Array.isArray(job.scope) ||
        job.scope.type !== 'AUTOMATIC_FETCH'
    ) {
        throw new EnrichmentError(
            'Automatic enrichment job belongs to a different fetch.',
            409,
        );
    }
    return job.scope;
}

// The caller saves the article and its queue item in the same transaction.
// Nothing is cached in the context: a rolled-back first article must not leave
// the next article referring to a job that was never committed.
export async function enqueueAutomaticEnrichment(
    tx: Prisma.TransactionClient,
    article: AutomaticEnrichmentArticle,
    context: AutomaticEnrichmentContext,
): Promise<void> {
    if (!getEnrichmentEligibility(article).eligible) return;
    await tx.enrichmentJob.upsert({
        where: { id: context.jobId },
        create: {
            id: context.jobId,
            requestId: `fetch:${context.jobId}`,
            createdByUserId: context.createdByUserId,
            scope: { type: 'AUTOMATIC_FETCH' },
            total: 0,
        },
        update: {},
    });
    await lockEnrichmentJob(tx, context.jobId);
    const job = await tx.enrichmentJob.findUniqueOrThrow({
        where: { id: context.jobId },
    });
    const scope = checkAutomaticJob(job, context);
    const canceled = job.status === 'CANCELED' || scope.stopRequested === true;
    const inserted = await tx.enrichmentJobItem.createMany({
        data: [
            {
                jobId: context.jobId,
                articleId: article.id,
                title: article.title,
                expectedArticleUpdatedAt: article.updatedAt,
                status: canceled ? 'CANCELED' : 'PENDING',
                reason: canceled ? 'Canceled before processing.' : null,
            },
        ],
        skipDuplicates: true,
    });
    if (!inserted.count) return;
    await tx.enrichmentJob.update({
        where: { id: context.jobId },
        data: {
            total: { increment: inserted.count },
            // Workers can finish the first source while Fetch is reading the
            // next one. New articles must wake that same durable job again.
            ...(!canceled && job.status === 'COMPLETED'
                ? { status: 'QUEUED' }
                : {}),
        },
    });
}

// A duplicate URL from another feed may improve the article during this Fetch.
// Follow only the exact version that this job owns; manual edits and unrelated
// jobs must never become new automatic work through this refresh.
export async function refreshAutomaticEnrichment(
    tx: Prisma.TransactionClient,
    article: AutomaticEnrichmentArticle,
    context: AutomaticEnrichmentContext,
    previousUpdatedAt: Date,
): Promise<void> {
    const existing = await tx.enrichmentJob.findUnique({
        where: { id: context.jobId },
        select: { id: true },
    });
    if (!existing) return;
    await lockEnrichmentJob(tx, context.jobId);
    const job = await tx.enrichmentJob.findUniqueOrThrow({
        where: { id: context.jobId },
    });
    const scope = checkAutomaticJob(job, context);
    const eligibility = getEnrichmentEligibility(article);
    const status =
        job.status === 'CANCELED' || scope.stopRequested === true
            ? 'CANCELED'
            : eligibility.eligible
              ? 'PENDING'
              : 'SKIPPED';
    const refreshed = await tx.enrichmentJobItem.updateMany({
        where: {
            jobId: context.jobId,
            articleId: article.id,
            expectedArticleUpdatedAt: previousUpdatedAt,
        },
        data: {
            title: article.title,
            expectedArticleUpdatedAt: article.updatedAt,
            status,
            reason:
                status === 'CANCELED'
                    ? 'Canceled before processing.'
                    : (eligibility.reason ?? null),
            leaseToken: null,
            leaseExpiresAt: null,
            proposal: Prisma.DbNull,
            proposalStatus: null,
        },
    });
    if (!refreshed.count) return;
    if (status === 'PENDING') {
        await tx.enrichmentJob.updateMany({
            where: { id: context.jobId, status: 'COMPLETED' },
            data: { status: 'QUEUED' },
        });
    } else {
        await finishEnrichmentJob(tx, context.jobId);
    }
}
