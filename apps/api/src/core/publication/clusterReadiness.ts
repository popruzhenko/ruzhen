import type { BlockType } from '@prisma/client';

export function getClusterPublicationErrors(cluster: {
    title: string;
    summary: string | null;
    blocks: Array<{ type: BlockType; content: string }>;
}): string[] {
    const errors: string[] = [];
    if (!cluster.title.trim())
        errors.push('Title is required before publishing.');
    if (!cluster.summary?.trim())
        errors.push('Summary is required before publishing.');
    if (!cluster.blocks.some((block) => block.type === 'FACT'))
        errors.push('At least one fact block is required before publishing.');
    if (!cluster.blocks.some((block) => block.type === 'CONTEXT'))
        errors.push(
            'At least one context block is required before publishing.',
        );
    if (cluster.blocks.some((block) => !block.content.trim()))
        errors.push('All semantic blocks must have content before publishing.');
    return errors;
}
