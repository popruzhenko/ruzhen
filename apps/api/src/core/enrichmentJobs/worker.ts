import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { isCurrentFullTextAssessment } from '../ingestionNews/enrich/articleContentQuality';
import { formatArticleRetrievalAttempts } from '../ingestionNews/enrich/formatArticleRetrieval';
import { jsonInput } from './contentVersions';
import { finishEnrichmentJob, lockEnrichmentJob } from './jobs';
import { candidateDecision, persistEnrichmentCandidate } from './persistence';
import {
    enrichmentArticleSelect,
    getEnrichmentEligibility,
    type EnrichmentCandidate,
    type EnrichmentClock,
    type EnrichmentRetriever,
} from './types';

const DEFAULT_LEASE_MS = 120000;
export interface EnrichmentClaim {
    id: string;
    jobId: string;
    articleId: string;
    expectedArticleUpdatedAt: Date | null;
    leaseToken: string;
    createdByUserId: string;
}

export async function claimEnrichmentItem({
    prisma,
    now = () => new Date(),
    leaseMs = DEFAULT_LEASE_MS,
}: {
    prisma: PrismaClient;
    now?: EnrichmentClock;
    leaseMs?: number;
}): Promise<EnrichmentClaim | null> {
    return prisma.$transaction(async (tx) => {
        const currentTime = now();
        // A canceled job cannot strand an expired in-flight item after restart.
        await tx.enrichmentJobItem.updateMany({
            where: {
                status: 'RUNNING',
                leaseExpiresAt: { lte: currentTime },
                job: { status: 'CANCELED' },
            },
            data: {
                status: 'CANCELED',
                leaseToken: null,
                leaseExpiresAt: null,
                reason: 'Canceled job recovered after its worker stopped.',
            },
        });
        const jobs = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT j."id" FROM "EnrichmentJob" j
            WHERE j."status" IN ('QUEUED', 'RUNNING') AND EXISTS (
                SELECT 1 FROM "EnrichmentJobItem" i WHERE i."jobId" = j."id"
                AND (i."status" = 'PENDING' OR (i."status" = 'RUNNING' AND i."leaseExpiresAt" <= ${currentTime}))
            ) ORDER BY j."createdAt" ASC, j."id" ASC LIMIT 1
            FOR UPDATE OF j SKIP LOCKED
        `);
        if (!jobs.length) return null;
        const jobId = jobs[0].id;
        const item = await tx.enrichmentJobItem.findFirst({
            where: {
                jobId,
                OR: [
                    { status: 'PENDING' },
                    { status: 'RUNNING', leaseExpiresAt: { lte: currentTime } },
                ],
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (!item) return null;
        const leaseToken = randomUUID();
        const claimed = await tx.enrichmentJobItem.updateMany({
            where: {
                id: item.id,
                status: item.status,
                leaseToken: item.leaseToken,
            },
            data: {
                status: 'RUNNING',
                leaseToken,
                leaseExpiresAt: new Date(currentTime.getTime() + leaseMs),
                attempts: { increment: 1 },
                reason: null,
            },
        });
        if (claimed.count !== 1) return null;
        const job = await tx.enrichmentJob.update({
            where: { id: jobId },
            data: { status: 'RUNNING' },
        });
        return {
            id: item.id,
            jobId,
            articleId: item.articleId,
            expectedArticleUpdatedAt: item.expectedArticleUpdatedAt,
            leaseToken,
            createdByUserId: job.createdByUserId,
        };
    });
}

export async function renewEnrichmentLease({
    prisma,
    claim,
    now = () => new Date(),
    leaseMs = DEFAULT_LEASE_MS,
}: {
    prisma: PrismaClient;
    claim: EnrichmentClaim;
    now?: EnrichmentClock;
    leaseMs?: number;
}) {
    const currentTime = now();
    const updated = await prisma.enrichmentJobItem.updateMany({
        where: {
            id: claim.id,
            status: 'RUNNING',
            leaseToken: claim.leaseToken,
            leaseExpiresAt: { gt: currentTime },
        },
        data: { leaseExpiresAt: new Date(currentTime.getTime() + leaseMs) },
    });
    return updated.count === 1;
}

export async function settleEnrichmentClaim({
    prisma,
    claim,
    candidate,
    reason,
    failed = false,
    now = () => new Date(),
}: {
    prisma: PrismaClient;
    claim: EnrichmentClaim;
    candidate?: EnrichmentCandidate | null;
    reason?: string;
    failed?: boolean;
    now?: EnrichmentClock;
}) {
    return prisma.$transaction(async (tx) => {
        await lockEnrichmentJob(tx, claim.jobId);
        const currentTime = now();
        const held = await tx.enrichmentJobItem.updateMany({
            where: {
                id: claim.id,
                status: 'RUNNING',
                leaseToken: claim.leaseToken,
                leaseExpiresAt: { gt: currentTime },
            },
            data: {
                leaseExpiresAt: new Date(
                    currentTime.getTime() + DEFAULT_LEASE_MS,
                ),
            },
        });
        if (held.count !== 1) return false;
        const article = await tx.article.findUnique({
            where: { id: claim.articleId },
            select: enrichmentArticleSelect,
        });
        let data: Prisma.EnrichmentJobItemUpdateInput;
        if (
            !article ||
            !claim.expectedArticleUpdatedAt ||
            article.updatedAt.getTime() !==
                claim.expectedArticleUpdatedAt.getTime()
        ) {
            data = {
                status: 'SKIPPED',
                reason: article
                    ? 'Article changed after this job was created.'
                    : 'Article no longer exists.',
            };
        } else {
            const eligibility = getEnrichmentEligibility(article);
            if (!eligibility.eligible) {
                data = { status: 'SKIPPED', reason: eligibility.reason };
            } else if (failed) {
                data = {
                    status: 'ERROR',
                    reason: reason ?? 'Article retrieval failed.',
                };
            } else if (!candidate) {
                data = {
                    status: 'UNCHANGED',
                    reason: reason ?? 'No usable article text was found.',
                };
            } else {
                const decision = candidateDecision(article, candidate);
                if (decision.type === 'UNCHANGED') {
                    data = {
                        status: 'UNCHANGED',
                        reason: [
                            decision.reason,
                            candidate.retrieval
                                ? formatArticleRetrievalAttempts(
                                      candidate.retrieval.attempts,
                                  )
                                : '',
                        ]
                            .filter(Boolean)
                            .join(' '),
                    };
                } else if (decision.type === 'PROPOSE') {
                    data = {
                        status: 'PROPOSED',
                        proposal: jsonInput(decision.candidate),
                        proposalStatus: 'PENDING',
                        reason: [
                            'New text is available. Review it before replacing existing content.',
                            candidate.retrieval
                                ? formatArticleRetrievalAttempts(
                                      candidate.retrieval.attempts,
                                  )
                                : '',
                        ]
                            .filter(Boolean)
                            .join(' '),
                    };
                } else {
                    await persistEnrichmentCandidate(tx, {
                        article,
                        candidate: decision.candidate,
                        metadataOnly: decision.metadataOnly,
                        actorUserId: claim.createdByUserId,
                        jobItemId: claim.id,
                        now: currentTime,
                    });
                    const full = isCurrentFullTextAssessment(
                        decision.candidate.content,
                        decision.candidate.assessment,
                    );
                    data = {
                        status: full ? 'FULL_TEXT' : 'PARTIAL_TEXT',
                        reason: [
                            full
                                ? 'Verified full article text is available.'
                                : `Article text improved but is still incomplete. ${decision.candidate.assessment.reasons.join(', ')}`.trim(),
                            candidate.retrieval
                                ? formatArticleRetrievalAttempts(
                                      candidate.retrieval.attempts,
                                  )
                                : '',
                        ]
                            .filter(Boolean)
                            .join(' '),
                    };
                }
            }
        }
        await tx.enrichmentJobItem.update({
            where: { id: claim.id },
            data: { ...data, leaseToken: null, leaseExpiresAt: null },
        });
        await finishEnrichmentJob(tx, claim.jobId);
        return true;
    });
}

export async function runEnrichmentWorkerOnce({
    prisma,
    retrieve,
    now = () => new Date(),
    leaseMs = DEFAULT_LEASE_MS,
    heartbeatMs = 30000,
}: {
    prisma: PrismaClient;
    retrieve: EnrichmentRetriever;
    now?: EnrichmentClock;
    leaseMs?: number;
    heartbeatMs?: number;
}) {
    const claim = await claimEnrichmentItem({ prisma, now, leaseMs });
    if (!claim) return false;
    const controller = new AbortController();
    let renewing = false;
    const heartbeat =
        heartbeatMs > 0
            ? setInterval(
                  () => {
                      if (renewing) return;
                      renewing = true;
                      void renewEnrichmentLease({ prisma, claim, now, leaseMs })
                          .then((held) => {
                              if (!held) controller.abort();
                          })
                          .catch(() => controller.abort())
                          .finally(() => {
                              renewing = false;
                          });
                  },
                  Math.min(heartbeatMs, Math.max(1, Math.floor(leaseMs / 3))),
              )
            : undefined;
    heartbeat?.unref();
    try {
        const article = await prisma.article.findUnique({
            where: { id: claim.articleId },
            select: enrichmentArticleSelect,
        });
        if (
            !article ||
            article.updatedAt.getTime() !==
                claim.expectedArticleUpdatedAt?.getTime() ||
            !getEnrichmentEligibility(article).eligible
        ) {
            await settleEnrichmentClaim({ prisma, claim, now });
        } else {
            const result = await retrieve(
                {
                    url: article.url,
                    title: article.title,
                    publishedAt: article.publishedAt,
                    summary: article.summary,
                    content: article.content,
                },
                controller.signal,
            );
            await settleEnrichmentClaim({
                prisma,
                claim,
                candidate: result.candidate,
                reason: result.attempts
                    ? formatArticleRetrievalAttempts(result.attempts)
                    : result.reasons.join(', '),
                now,
            });
        }
    } catch (error) {
        await settleEnrichmentClaim({
            prisma,
            claim,
            failed: true,
            reason:
                error instanceof Error
                    ? error.message
                    : 'Article retrieval failed.',
            now,
        });
    } finally {
        if (heartbeat) clearInterval(heartbeat);
    }
    return true;
}

export function startEnrichmentWorker({
    prisma,
    retrieve,
    pollIntervalMs = 2000,
    onError = (error) => console.error('Enrichment worker paused:', error),
}: {
    prisma: PrismaClient;
    retrieve: EnrichmentRetriever;
    pollIntervalMs?: number;
    onError?: (error: unknown) => void;
}) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> | undefined;
    let failed = false;
    const tick = async () => {
        if (stopped) return;
        let delay = pollIntervalMs;
        try {
            const processed = await runEnrichmentWorkerOnce({
                prisma,
                retrieve,
            });
            failed = false;
            if (processed) delay = 100;
        } catch (error) {
            if (!failed) onError(error);
            failed = true;
            delay = 30000;
        } finally {
            if (!stopped) {
                timer = setTimeout(() => {
                    active = tick();
                }, delay);
                timer.unref();
            }
        }
    };
    timer = setTimeout(() => {
        active = tick();
    }, 0);
    timer.unref();
    return async () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        await active;
    };
}
