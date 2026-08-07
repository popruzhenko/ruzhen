export function calculateCentroid(embeddings: number[][]): number[] | null {
    if (embeddings.length === 0) {
        return null;
    }

    const vectorLength = embeddings[0].length;

    const hasInvalidVector = embeddings.some(
        (embedding) => embedding.length !== vectorLength,
    );

    if (hasInvalidVector) {
        return null;
    }

    const centroid = new Array(vectorLength).fill(0);

    for (const embedding of embeddings) {
        for (let i = 0; i < vectorLength; i += 1) {
            centroid[i] += embedding[i];
        }
    }

    for (let i = 0; i < vectorLength; i += 1) {
        centroid[i] /= embeddings.length;
    }

    return centroid;
}
