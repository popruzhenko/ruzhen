import { Prisma } from '@prisma/client';

const snapshotFields = [
    'title',
    'summary',
    'content',
    'cleanedAccessibleText',
    'imageUrl',
    'cleaningMethod',
    'contentAvailability',
    'status',
    'contentProvenance',
    'contentAssessment',
] as const;

export function jsonInput(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function snapshotContent(
    article: Partial<Record<(typeof snapshotFields)[number], unknown>>,
): Prisma.InputJsonObject {
    return Object.fromEntries(
        snapshotFields.map((field) => [field, article[field] ?? null]),
    ) as Prisma.InputJsonObject;
}

export function createArticleContentVersion(
    tx: Prisma.TransactionClient,
    input: {
        articleId: string;
        actorUserId?: string | null;
        reason: string;
        before: Prisma.InputJsonObject;
        after: Prisma.InputJsonObject;
        afterArticleUpdatedAt: Date;
        jobItemId?: string;
        restoredFromVersionId?: string;
    },
) {
    return tx.articleContentVersion.create({ data: input });
}
