import { Prisma } from '@prisma/client';

export function parseEmbedding(
    embedding: Prisma.JsonValue | null,
): number[] | null {
    if (!Array.isArray(embedding)) {
        return null;
    }

    if (!embedding.every((value) => typeof value === 'number')) {
        return null;
    }

    return embedding;
}
