import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import {
    assessArticleText,
    getArticleTextHash,
    isCurrentFullTextAssessment,
} from '../ingestionNews/enrich/articleContentQuality';
import { getNextReviewStatus } from '../rawArticles/policy';
import { detectContentAvailability } from '../normalize/article/detectContentAvailability';
import {
    createArticleContentVersion,
    jsonInput,
    snapshotContent,
} from './contentVersions';
import { enrichmentItemSummary, lockEnrichmentJob } from './jobs';
import {
    EnrichmentError,
    enrichmentArticleSelect,
    getEnrichmentEligibility,
    nextArticleTimestamp,
    type EnrichmentArticle,
    type EnrichmentCandidate,
    type EnrichmentClock,
} from './types';

const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

export function validateEnrichmentCandidate(
    value: unknown,
): EnrichmentCandidate {
    const candidate = object(value);
    const assessment = object(candidate?.assessment);
    if (
        !candidate ||
        typeof candidate.content !== 'string' ||
        !candidate.content.trim() ||
        typeof candidate.sourceUrl !== 'string' ||
        !assessment ||
        assessment.textHash !== getArticleTextHash(candidate.content) ||
        typeof assessment.qualityScore !== 'number' ||
        !Number.isFinite(assessment.qualityScore) ||
        !object(assessment.signals)
    ) {
        throw new EnrichmentError('The enrichment candidate is invalid.');
    }
    return value as EnrichmentCandidate;
}

export function candidateDecision(
    article: EnrichmentArticle,
    value: EnrichmentCandidate,
) {
    const candidate = validateEnrichmentCandidate(value);
    const full = isCurrentFullTextAssessment(
        candidate.content,
        candidate.assessment,
    );
    const sameContent = candidate.content === article.content;
    if (
        sameContent &&
        full &&
        !isCurrentFullTextAssessment(
            article.content ?? '',
            article.contentAssessment,
        )
    ) {
        return { type: 'APPLY' as const, candidate, metadataOnly: true };
    }
    if (sameContent)
        return {
            type: 'UNCHANGED' as const,
            reason: 'No better text was found.',
        };
    const currentText = article.content?.trim()
        ? article.content
        : (article.cleanedAccessibleText ?? '');
    const previous = object(article.contentAssessment);
    const currentQuality =
        previous?.textHash === getArticleTextHash(currentText) &&
        typeof previous.qualityScore === 'number'
            ? previous.qualityScore
            : assessArticleText({
                  text: currentText,
                  title: article.title,
                  summary: article.summary,
                  url: article.url,
                  publishedAt: article.publishedAt,
              }).qualityScore;
    if (
        !candidate.assessment.signals.identityMatched ||
        candidate.assessment.signals.dateMatched === false ||
        candidate.assessment.reasons.includes('NAVIGATION_OR_BOILERPLATE') ||
        candidate.assessment.reasons.includes('REPEATED_OR_BOILERPLATE_TEXT') ||
        candidate.assessment.reasons.includes('SUMMARY_ONLY_TEXT') ||
        (!full &&
            (candidate.assessment.qualityScore <= currentQuality ||
                candidate.content.trim().length <= currentText.trim().length))
    ) {
        return {
            type: 'UNCHANGED' as const,
            reason: `No better matching article text was found. ${candidate.assessment.reasons.join(', ')}`.trim(),
        };
    }
    const provenance = object(article.contentProvenance);
    const knownMachineText =
        (provenance?.origin === 'INGESTION' ||
            provenance?.origin === 'ENRICHMENT') &&
        provenance.textHash === getArticleTextHash(currentText);
    const hasProtectedText = Boolean(
        article.content?.trim() ||
        (article.cleanedAccessibleText?.trim() &&
            article.cleanedAccessibleText.trim() !== article.summary?.trim()),
    );
    return {
        type:
            hasProtectedText && !knownMachineText
                ? ('PROPOSE' as const)
                : ('APPLY' as const),
        candidate,
        metadataOnly: false,
    };
}

function candidateUpdate(
    article: EnrichmentArticle,
    candidate: EnrichmentCandidate,
    metadataOnly: boolean,
    now: Date,
) {
    const content = metadataOnly ? article.content : candidate.content;
    const summary =
        metadataOnly || article.summary?.trim()
            ? article.summary
            : (candidate.summary ?? article.summary);
    const imageUrl = metadataOnly
        ? article.imageUrl
        : (article.imageUrl ?? candidate.imageUrl);
    const contentAssessment = jsonInput(candidate.assessment);
    const previousProvenance = object(article.contentProvenance);
    const contentProvenance = jsonInput({
        ...(metadataOnly && previousProvenance ? previousProvenance : {}),
        origin: metadataOnly
            ? (previousProvenance?.origin ?? 'UNKNOWN')
            : 'ENRICHMENT',
        textHash: getArticleTextHash(content ?? ''),
        method: candidate.method,
        retrievedUrl: candidate.sourceUrl,
        ...(candidate.retrieval ? { retrieval: candidate.retrieval } : {}),
        recordedAt: now.toISOString(),
    });
    const contentAvailability = detectContentAvailability({
        ...article,
        content,
        summary,
        contentAssessment,
    });
    const textChanged =
        content !== article.content || summary !== article.summary;
    const status = textChanged
        ? getNextReviewStatus({ ...article, content, summary })
        : article.status;
    const updatedAt = nextArticleTimestamp(article.updatedAt, now);
    const next = {
        ...article,
        content,
        summary,
        imageUrl,
        contentAssessment,
        contentProvenance,
        contentAvailability,
        status,
        updatedAt,
    };
    return {
        next,
        data: {
            content,
            summary,
            imageUrl,
            contentAssessment,
            contentProvenance,
            contentAvailability,
            status,
            updatedAt,
            ...(textChanged
                ? {
                      embedding: Prisma.DbNull,
                      embeddingModel: null,
                      embeddingBasis: null,
                  }
                : {}),
        } satisfies Prisma.ArticleUpdateManyMutationInput,
    };
}

export async function persistEnrichmentCandidate(
    tx: Prisma.TransactionClient,
    input: {
        article: EnrichmentArticle;
        candidate: EnrichmentCandidate;
        metadataOnly?: boolean;
        actorUserId?: string;
        jobItemId?: string;
        now: Date;
    },
) {
    const { article, candidate, now } = input;
    const eligibility = getEnrichmentEligibility(article);
    if (!eligibility.eligible)
        throw new EnrichmentError(eligibility.reason!, 409);
    validateEnrichmentCandidate(candidate);
    if (input.metadataOnly && candidate.content !== article.content)
        throw new EnrichmentError(
            'Verification must preserve the existing article text.',
        );
    const { next, data } = candidateUpdate(
        article,
        candidate,
        input.metadataOnly ?? false,
        now,
    );
    const changed = await tx.article.updateMany({
        where: {
            id: article.id,
            updatedAt: article.updatedAt,
            status: article.status,
            clusterLinks: { none: {} },
        },
        data,
    });
    if (changed.count !== 1)
        throw new EnrichmentError(
            'Article changed or was linked to a cluster. Reload it before applying text.',
            409,
        );
    const version = await createArticleContentVersion(tx, {
        articleId: article.id,
        actorUserId: input.actorUserId,
        jobItemId: input.jobItemId,
        reason: input.metadataOnly ? 'ENRICHMENT_VERIFICATION' : 'ENRICHMENT',
        before: snapshotContent(article),
        after: snapshotContent(next),
        afterArticleUpdatedAt: next.updatedAt,
    });
    return { article: next, version };
}

export async function getEnrichmentProposal({
    prisma,
    itemId,
}: {
    prisma: PrismaClient;
    itemId: string;
}) {
    return prisma.$transaction(
        async (tx) => {
            const item = await tx.enrichmentJobItem.findUnique({
                where: { id: itemId },
            });
            if (!item || item.proposal === null)
                throw new EnrichmentError(
                    'Enrichment proposal not found.',
                    404,
                );
            const currentArticle = await tx.article.findUnique({
                where: { id: item.articleId },
                select: enrichmentArticleSelect,
            });
            return {
                item: enrichmentItemSummary(item),
                currentArticle,
                proposal: item.proposal,
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function applyEnrichmentProposal({
    prisma,
    itemId,
    expectedUpdatedAt,
    actorUserId,
    now = () => new Date(),
}: {
    prisma: PrismaClient;
    itemId: string;
    expectedUpdatedAt: Date;
    actorUserId: string;
    now?: EnrichmentClock;
}) {
    return prisma.$transaction(async (tx) => {
        const reference = await tx.enrichmentJobItem.findUnique({
            where: { id: itemId },
            select: { jobId: true },
        });
        if (!reference)
            throw new EnrichmentError('Enrichment proposal not found.', 404);
        await lockEnrichmentJob(tx, reference.jobId);
        const claimed = await tx.enrichmentJobItem.updateMany({
            where: {
                id: itemId,
                status: 'PROPOSED',
                proposalStatus: 'PENDING',
            },
            data: { proposalStatus: 'APPLIED' },
        });
        if (claimed.count !== 1)
            throw new EnrichmentError(
                'This proposal was already reviewed.',
                409,
            );
        const item = await tx.enrichmentJobItem.findUniqueOrThrow({
            where: { id: itemId },
        });
        const article = await tx.article.findUnique({
            where: { id: item.articleId },
            select: enrichmentArticleSelect,
        });
        if (!article)
            throw new EnrichmentError('Article no longer exists.', 404);
        if (article.updatedAt.getTime() !== expectedUpdatedAt.getTime())
            throw new EnrichmentError(
                'Article changed. Reload the comparison before applying.',
                409,
            );
        const eligibility = getEnrichmentEligibility(article);
        if (!eligibility.eligible)
            throw new EnrichmentError(eligibility.reason!, 409);
        const candidate = validateEnrichmentCandidate(item.proposal);
        const saved = await persistEnrichmentCandidate(tx, {
            article,
            candidate,
            actorUserId,
            jobItemId: item.id,
            now: now(),
        });
        await tx.enrichmentJobItem.update({
            where: { id: item.id },
            data: {
                status: isCurrentFullTextAssessment(
                    candidate.content,
                    candidate.assessment,
                )
                    ? 'FULL_TEXT'
                    : 'PARTIAL_TEXT',
                reason: 'Proposed text was applied after review.',
            },
        });
        return saved;
    });
}

export async function dismissEnrichmentProposal({
    prisma,
    itemId,
}: {
    prisma: PrismaClient;
    itemId: string;
}) {
    return prisma.$transaction(async (tx) => {
        const reference = await tx.enrichmentJobItem.findUnique({
            where: { id: itemId },
            select: { jobId: true },
        });
        if (!reference)
            throw new EnrichmentError('Enrichment proposal not found.', 404);
        await lockEnrichmentJob(tx, reference.jobId);
        const changed = await tx.enrichmentJobItem.updateMany({
            where: {
                id: itemId,
                status: 'PROPOSED',
                proposalStatus: 'PENDING',
            },
            data: {
                proposalStatus: 'DISMISSED',
                reason: 'Proposed text was dismissed. Existing article text was kept.',
            },
        });
        if (!changed.count)
            throw new EnrichmentError(
                'This proposal was already reviewed.',
                409,
            );
        return {
            item: enrichmentItemSummary(
                await tx.enrichmentJobItem.findUniqueOrThrow({
                    where: { id: itemId },
                }),
            ),
        };
    });
}

export async function listArticleContentVersions({
    prisma,
    articleId,
}: {
    prisma: PrismaClient;
    articleId: string;
}) {
    return prisma.$transaction(
        async (tx) => {
            const currentArticle = await tx.article.findUnique({
                where: { id: articleId },
                select: enrichmentArticleSelect,
            });
            if (!currentArticle)
                throw new EnrichmentError('Article not found.', 404);
            const versions = await tx.articleContentVersion.findMany({
                where: { articleId },
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            });
            return { currentArticle, versions };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
}

export async function restoreArticleContentVersion({
    prisma,
    versionId,
    expectedUpdatedAt,
    actorUserId,
    now = () => new Date(),
}: {
    prisma: PrismaClient;
    versionId: string;
    expectedUpdatedAt: Date;
    actorUserId: string;
    now?: EnrichmentClock;
}) {
    return prisma.$transaction(async (tx) => {
        const original = await tx.articleContentVersion.findUnique({
            where: { id: versionId },
        });
        if (!original)
            throw new EnrichmentError('Content version not found.', 404);
        const article = await tx.article.findUnique({
            where: { id: original.articleId },
            select: enrichmentArticleSelect,
        });
        if (!article) throw new EnrichmentError('Article not found.', 404);
        if (article.updatedAt.getTime() !== expectedUpdatedAt.getTime())
            throw new EnrichmentError(
                'Article changed. Reload its history before restoring.',
                409,
            );
        if (
            article.status === ArticleStatus.REJECTED ||
            article.status === ArticleStatus.CLUSTERED ||
            article._count.clusterLinks > 0
        )
            throw new EnrichmentError(
                'Rejected articles and articles linked to clusters cannot be restored here.',
                409,
            );
        const before = object(original.before);
        if (!before || typeof before.title !== 'string')
            throw new EnrichmentError('Content version is invalid.');
        const nullableText = (key: string) =>
            typeof before[key] === 'string' ? (before[key] as string) : null;
        const title = before.title;
        const summary = nullableText('summary');
        const content = nullableText('content');
        const cleanedAccessibleText = nullableText('cleanedAccessibleText');
        const contentAvailability = detectContentAvailability({
            title,
            summary,
            content,
            cleanedAccessibleText,
            contentAssessment: before.contentAssessment,
        });
        const status = getNextReviewStatus({
            title,
            summary,
            content,
            cleanedAccessibleText,
        });
        const updatedAt = nextArticleTimestamp(article.updatedAt, now());
        const next = {
            ...article,
            title,
            summary,
            content,
            cleanedAccessibleText,
            imageUrl: nullableText('imageUrl'),
            cleaningMethod: nullableText(
                'cleaningMethod',
            ) as EnrichmentArticle['cleaningMethod'],
            contentAssessment: before.contentAssessment ?? null,
            contentProvenance: {
                origin: 'MANUAL',
                textHash: getArticleTextHash(
                    content ?? cleanedAccessibleText ?? '',
                ),
                method: 'RESTORE',
                recordedAt: now().toISOString(),
                restoredFromVersionId: versionId,
            },
            contentAvailability,
            status,
            updatedAt,
        };
        const changed = await tx.article.updateMany({
            where: {
                id: article.id,
                updatedAt: article.updatedAt,
                status: article.status,
                clusterLinks: { none: {} },
            },
            data: {
                title,
                summary,
                content,
                cleanedAccessibleText,
                imageUrl: next.imageUrl,
                cleaningMethod: next.cleaningMethod,
                contentAssessment:
                    next.contentAssessment === null
                        ? Prisma.DbNull
                        : jsonInput(next.contentAssessment),
                contentProvenance:
                    next.contentProvenance === null
                        ? Prisma.DbNull
                        : jsonInput(next.contentProvenance),
                contentAvailability,
                status,
                updatedAt,
                embedding: Prisma.DbNull,
                embeddingModel: null,
                embeddingBasis: null,
            },
        });
        if (changed.count !== 1)
            throw new EnrichmentError(
                'Article changed. Reload its history before restoring.',
                409,
            );
        const version = await createArticleContentVersion(tx, {
            articleId: article.id,
            actorUserId,
            reason: 'RESTORE',
            before: snapshotContent(article),
            after: snapshotContent(next),
            afterArticleUpdatedAt: updatedAt,
            restoredFromVersionId: versionId,
        });
        return { article: next, version };
    });
}
