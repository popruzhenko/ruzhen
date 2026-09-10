import { ArticleStatus, Prisma, type PrismaClient } from '@prisma/client';
import type { ArticleCreateCandidate } from './types';
import { detectContentAvailability } from '../../normalize/article/detectContentAvailability';
import {
    getArticleTextHash,
    assessArticleText,
} from '../enrich/articleContentQuality';
import {
    createArticleContentVersion,
    jsonInput,
    snapshotContent,
} from '../../enrichmentJobs/contentVersions';
import {
    enqueueAutomaticEnrichment,
    refreshAutomaticEnrichment,
    type AutomaticEnrichmentContext,
} from '../../enrichmentJobs/automaticEnrichment';

interface SaveParsedArticlesResult {
    created: number;
    updated: number;
    skippedDuplicates: number;
    skippedInvalid: number;
}

function machineTextIsCurrent(
    content: string | null,
    provenance: unknown,
): boolean {
    if (
        !provenance ||
        typeof provenance !== 'object' ||
        Array.isArray(provenance)
    )
        return false;
    const value = provenance as Record<string, unknown>;
    return (
        (value.origin === 'INGESTION' || value.origin === 'ENRICHMENT') &&
        value.textHash === getArticleTextHash(content ?? '')
    );
}

function isSafeExtension(current: string, next: string): boolean {
    const prefix = current
        .replace(/(?:\.{3}|\u2026)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
    const expanded = next.replace(/\s+/g, ' ').trim();
    const assessment = assessArticleText({ text: next });
    return (
        prefix.length > 0 &&
        expanded.startsWith(prefix) &&
        expanded.length > prefix.length &&
        !assessment.signals.paywall &&
        !assessment.reasons.includes('NAVIGATION_OR_BOILERPLATE') &&
        !assessment.reasons.includes('REPEATED_OR_BOILERPLATE_TEXT')
    );
}

export async function saveParsedArticles(
    prisma: PrismaClient,
    candidates: Array<ArticleCreateCandidate | null>,
    automaticEnrichment?: AutomaticEnrichmentContext,
): Promise<SaveParsedArticlesResult> {
    const results = {
        created: 0,
        updated: 0,
        skippedDuplicates: 0,
        skippedInvalid: 0,
    };
    for (const candidate of candidates) {
        if (!candidate) {
            results.skippedInvalid++;
            continue;
        }
        let creatingArticle = false;
        try {
            const outcome = await prisma.$transaction(async (tx) => {
                const existing = await tx.article.findUnique({
                    where: { url: candidate.url },
                    include: { _count: { select: { clusterLinks: true } } },
                });
                const provenance = (content: string | null) =>
                    jsonInput({
                        origin: 'INGESTION',
                        method: 'FEED',
                        textHash: getArticleTextHash(content ?? ''),
                        retrievedUrl: candidate.url,
                        recordedAt: new Date().toISOString(),
                    });
                if (!existing) {
                    creatingArticle = true;
                    const article = await tx.article.create({
                        data: {
                            sourceId: candidate.sourceId,
                            url: candidate.url,
                            title: candidate.title,
                            summary: candidate.summary,
                            content: candidate.content,
                            cleanedAccessibleText:
                                candidate.cleanedAccessibleText ?? null,
                            imageUrl: candidate.imageUrl,
                            publishedAt: candidate.publishedAt,
                            language: candidate.language,
                            country: candidate.country,
                            contentAssessment: candidate.contentAssessment
                                ? jsonInput(candidate.contentAssessment)
                                : Prisma.DbNull,
                            contentProvenance: provenance(candidate.content),
                            contentAvailability:
                                detectContentAvailability(candidate),
                        },
                    });
                    if (candidate.rawPayload) {
                        await tx.articleRaw.create({
                            data: {
                                articleId: article.id,
                                rawContent: JSON.stringify(
                                    candidate.rawPayload,
                                ),
                                parserVersion: 'politics-v4',
                            },
                        });
                    }
                    if (automaticEnrichment) {
                        await enqueueAutomaticEnrichment(
                            tx,
                            { ...article, _count: { clusterLinks: 0 } },
                            automaticEnrichment,
                        );
                    }
                    return 'created' as const;
                }
                if (
                    existing.status === ArticleStatus.REJECTED ||
                    existing.status === ArticleStatus.CLUSTERED ||
                    existing._count.clusterLinks > 0
                ) {
                    return 'skippedDuplicates' as const;
                }
                const knownMachineText = machineTextIsCurrent(
                    existing.content,
                    existing.contentProvenance,
                );
                const currentContent = existing.content?.trim() ?? '';
                const protectedText =
                    !knownMachineText &&
                    Boolean(
                        currentContent ||
                        (existing.cleanedAccessibleText?.trim() &&
                            existing.cleanedAccessibleText.trim() !==
                                existing.summary?.trim()),
                    );
                // Existing manual/unknown text is reviewed through enrichment proposals.
                if (protectedText) return 'skippedDuplicates' as const;
                const nextContent =
                    candidate.content &&
                    (!currentContent ||
                        (knownMachineText &&
                            isSafeExtension(currentContent, candidate.content)))
                        ? candidate.content
                        : existing.content;
                const nextSummary = existing.summary?.trim()
                    ? existing.summary
                    : candidate.summary;
                const nextImageUrl = existing.imageUrl || candidate.imageUrl;
                const nextPublishedAt =
                    existing.publishedAt ?? candidate.publishedAt;
                const contentChanged = nextContent !== existing.content;
                const textChanged =
                    contentChanged || nextSummary !== existing.summary;
                if (
                    !textChanged &&
                    nextImageUrl === existing.imageUrl &&
                    nextPublishedAt?.getTime() ===
                        existing.publishedAt?.getTime()
                ) {
                    return 'skippedDuplicates' as const;
                }
                const assessment = contentChanged
                    ? (candidate.contentAssessment ?? null)
                    : existing.contentAssessment;
                const next = {
                    ...existing,
                    content: nextContent,
                    summary: nextSummary,
                    imageUrl: nextImageUrl,
                    publishedAt: nextPublishedAt,
                    contentAssessment: assessment,
                    contentProvenance: contentChanged
                        ? provenance(nextContent)
                        : existing.contentProvenance,
                };
                const status =
                    textChanged &&
                    (existing.status === ArticleStatus.APPROVED ||
                        existing.status === ArticleStatus.EMBEDDED)
                        ? ArticleStatus.REVIEWED
                        : existing.status;
                const updatedAt = new Date(
                    Math.max(Date.now(), existing.updatedAt.getTime() + 1),
                );
                const contentAvailability = detectContentAvailability(next);
                if (automaticEnrichment) {
                    // Match the worker's lock order: job, then article. This
                    // run may see the same new URL in more than one feed.
                    await tx.$queryRaw(Prisma.sql`
                        SELECT "id" FROM "EnrichmentJob"
                        WHERE "id" = ${automaticEnrichment.jobId} FOR UPDATE
                    `);
                }
                const changed = await tx.article.updateMany({
                    where: {
                        id: existing.id,
                        updatedAt: existing.updatedAt,
                        status: existing.status,
                        clusterLinks: { none: {} },
                    },
                    data: {
                        content: nextContent,
                        summary: nextSummary,
                        imageUrl: nextImageUrl,
                        publishedAt: nextPublishedAt,
                        contentAvailability,
                        status,
                        updatedAt,
                        contentAssessment: assessment
                            ? jsonInput(assessment)
                            : Prisma.DbNull,
                        contentProvenance: next.contentProvenance
                            ? jsonInput(next.contentProvenance)
                            : Prisma.DbNull,
                        ...(textChanged
                            ? {
                                  embedding: Prisma.DbNull,
                                  embeddingBasis: null,
                                  embeddingModel: null,
                              }
                            : {}),
                    },
                });
                if (changed.count !== 1) return 'skippedDuplicates' as const;
                if (textChanged)
                    await createArticleContentVersion(tx, {
                        articleId: existing.id,
                        reason: 'INGESTION_UPDATE',
                        before: snapshotContent(existing),
                        after: snapshotContent({
                            ...next,
                            status,
                            contentAvailability,
                        }),
                        afterArticleUpdatedAt: updatedAt,
                    });
                if (automaticEnrichment) {
                    await refreshAutomaticEnrichment(
                        tx,
                        { ...next, status, updatedAt },
                        automaticEnrichment,
                        existing.updatedAt,
                    );
                }
                return 'updated' as const;
            });
            results[outcome]++;
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                creatingArticle &&
                (await prisma.article.findUnique({
                    where: { url: candidate.url },
                    select: { id: true },
                }))
            ) {
                results.skippedDuplicates++;
            } else throw error;
        }
    }
    return results;
}
