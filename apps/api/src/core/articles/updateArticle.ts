import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import { detectContentAvailability } from '../normalize/article/detectContentAvailability';
import { getRawArticleApprovalErrors } from '../rawArticles/policy';
import {
    getArticleTextHash,
    makeManualContentAssessment,
} from '../ingestionNews/enrich/articleContentQuality';
import {
    createArticleContentVersion,
    jsonInput,
    snapshotContent,
} from '../enrichmentJobs/contentVersions';
import {
    ArticleMutationError,
    parseExpectedUpdatedAt,
} from './articleMutationError';

export interface UpdateArticleInput {
    title?: string;
    summary?: string;
    content?: string;
    cleanedAccessibleText?: string;
    status?: ArticleStatus;
    expectedUpdatedAt?: string;
    confirmFullText?: boolean;
}

const textFields = [
    'title',
    'summary',
    'content',
    'cleanedAccessibleText',
] as const;
const editorialStatuses = new Set<ArticleStatus>([
    ArticleStatus.NEW,
    ArticleStatus.NEEDS_REVIEW,
    ArticleStatus.REVIEWED,
    ArticleStatus.APPROVED,
    ArticleStatus.REJECTED,
]);

function parseInput(value: unknown): UpdateArticleInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ArticleMutationError('Invalid article update.', 400);
    }
    const input = value as Record<string, unknown>;
    for (const key of textFields) {
        if (input[key] !== undefined && typeof input[key] !== 'string') {
            throw new ArticleMutationError(`Invalid ${key}.`, 400);
        }
    }
    if (
        input.status !== undefined &&
        !editorialStatuses.has(input.status as ArticleStatus)
    ) {
        throw new ArticleMutationError(
            'Invalid editorial article status.',
            400,
        );
    }
    parseExpectedUpdatedAt(input.expectedUpdatedAt);
    if (
        input.confirmFullText !== undefined &&
        typeof input.confirmFullText !== 'boolean'
    ) {
        throw new ArticleMutationError('Invalid full-text confirmation.', 400);
    }
    if (
        ![...textFields, 'status', 'confirmFullText'].some(
            (key) => input[key] !== undefined,
        )
    ) {
        throw new ArticleMutationError('No article changes supplied.', 400);
    }
    return input as UpdateArticleInput;
}

export async function updateArticleSafely(
    prisma: PrismaClient,
    articleId: string,
    value: unknown,
    actorUserId?: string,
) {
    const input = parseInput(value);
    const expectedUpdatedAt = parseExpectedUpdatedAt(input.expectedUpdatedAt);
    return prisma.$transaction(async (tx) => {
        const current = await tx.article.findUnique({
            where: { id: articleId },
            include: { _count: { select: { clusterLinks: true } } },
        });
        if (!current) throw new ArticleMutationError('Article not found.', 404);
        if (
            expectedUpdatedAt &&
            current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
        ) {
            throw new ArticleMutationError(
                'Article changed. Reload it before saving your changes.',
                409,
            );
        }
        if (
            current.status === ArticleStatus.CLUSTERED ||
            current._count.clusterLinks > 0
        ) {
            throw new ArticleMutationError(
                'This article belongs to a cluster. Review it from clustering.',
                409,
            );
        }
        const next = {
            ...current,
            ...Object.fromEntries(
                textFields
                    .filter((key) => input[key] !== undefined)
                    .map((key) => [key, input[key]]),
            ),
        };
        const textChanged = textFields.some(
            (key) => input[key] !== undefined && input[key] !== current[key],
        );
        const contentChanged =
            input.content !== undefined && input.content !== current.content;
        if (input.confirmFullText && !next.content?.trim()) {
            throw new ArticleMutationError(
                'Enter the complete article text before confirming it.',
                400,
            );
        }
        const contentAssessment = input.confirmFullText
            ? jsonInput(makeManualContentAssessment(next.content ?? ''))
            : contentChanged
              ? null
              : current.contentAssessment;
        const contentProvenance =
            textChanged || input.confirmFullText
                ? jsonInput({
                      origin: 'MANUAL',
                      textHash: getArticleTextHash(next.content ?? ''),
                      recordedAt: new Date().toISOString(),
                      actorUserId: actorUserId ?? null,
                  })
                : current.contentProvenance;
        next.contentAssessment = contentAssessment as Prisma.JsonValue;
        next.contentProvenance = contentProvenance as Prisma.JsonValue;
        const contentAvailability = detectContentAvailability(next);
        if (input.status === ArticleStatus.APPROVED) {
            const errors = getRawArticleApprovalErrors(next);
            if (errors.length)
                throw new ArticleMutationError(errors.join(' '), 400);
        }
        const status =
            input.status ??
            (textChanged &&
            (current.status === ArticleStatus.APPROVED ||
                current.status === ArticleStatus.EMBEDDED)
                ? ArticleStatus.REVIEWED
                : current.status);
        const clearEmbedding = textChanged || status !== current.status;
        const updated = await tx.article.updateMany({
            where: {
                id: articleId,
                updatedAt: current.updatedAt,
                status: current.status,
                clusterLinks: { none: {} },
            },
            data: {
                title: input.title,
                summary: input.summary,
                content: input.content,
                cleanedAccessibleText: input.cleanedAccessibleText,
                contentAvailability,
                contentAssessment: contentAssessment ?? Prisma.DbNull,
                contentProvenance: contentProvenance ?? Prisma.DbNull,
                status,
                updatedAt: new Date(
                    Math.max(Date.now(), current.updatedAt.getTime() + 1),
                ),
                ...(clearEmbedding
                    ? {
                          embedding: Prisma.DbNull,
                          embeddingBasis: null,
                          embeddingModel: null,
                      }
                    : {}),
            },
        });
        if (updated.count !== 1) {
            throw new ArticleMutationError(
                'Article changed. Reload it before saving your changes.',
                409,
            );
        }
        const saved = await tx.article.findUniqueOrThrow({
            where: { id: articleId },
            include: {
                source: true,
                raw: true,
                _count: {
                    select: {
                        clusterLinks: true,
                        articleClusterCandidates: true,
                        clusterCandidateLinks: true,
                    },
                },
            },
        });
        if (textChanged || input.confirmFullText) {
            await createArticleContentVersion(tx, {
                articleId,
                actorUserId,
                reason: input.confirmFullText
                    ? 'MANUAL_VERIFICATION'
                    : 'MANUAL_EDIT',
                before: snapshotContent(current),
                after: snapshotContent(saved),
                afterArticleUpdatedAt: saved.updatedAt,
            });
        }
        return saved;
    });
}
