import { BlockType, OpinionStance } from '@prisma/client';
import type {
    AnalyzedNewsDraft,
    AnalyzedNewsDraftBlock,
} from './analyzedNews.types';

function extractJson(raw: string): string {
    const trimmed = raw.trim();

    if (trimmed.startsWith('```')) {
        return trimmed
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '')
            .trim();
    }

    return trimmed;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} is required`);
    }

    return value.trim();
}

function normalizeBlockType(value: unknown): BlockType {
    if (typeof value !== 'string') {
        throw new Error('Block type is required');
    }

    const normalized = value.toUpperCase();

    if (!Object.values(BlockType).includes(normalized as BlockType)) {
        throw new Error(`Invalid block type: ${value}`);
    }

    return normalized as BlockType;
}

function normalizeOpinionStance(
    value: unknown,
    blockType: BlockType,
): OpinionStance | null {
    if (blockType !== BlockType.OPINION) {
        return null;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
        return OpinionStance.NEUTRAL;
    }

    const normalized = value.toUpperCase();

    if (!Object.values(OpinionStance).includes(normalized as OpinionStance)) {
        throw new Error(`Invalid opinion stance: ${value}`);
    }

    return normalized as OpinionStance;
}

function normalizePosition(value: unknown, fallbackPosition: number): number {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        return value;
    }

    return fallbackPosition;
}

function parseBlock(
    value: unknown,
    fallbackPosition: number,
): AnalyzedNewsDraftBlock {
    if (!isObject(value)) {
        throw new Error('Invalid block item');
    }

    const type = normalizeBlockType(value.type);
    const title = normalizeNullableString(value.title);
    const content = normalizeRequiredString(value.content, 'Block content');
    const position = normalizePosition(value.position, fallbackPosition);
    const sourceName = normalizeNullableString(value.sourceName);
    const sourceUrl = normalizeNullableString(value.sourceUrl);
    const authorName = normalizeNullableString(value.authorName);
    const stance = normalizeOpinionStance(value.stance, type);

    return {
        type,
        title,
        content,
        position,
        sourceName,
        sourceUrl,
        authorName,
        stance,
    };
}

export function parseAnalyzedNewsResponse(raw: string): AnalyzedNewsDraft {
    const jsonText = extractJson(raw);

    let parsed: unknown;

    try {
        parsed = JSON.parse(jsonText);
    } catch {
        throw new Error('LLM response is not valid JSON');
    }

    if (!isObject(parsed)) {
        throw new Error('LLM response must be a JSON object');
    }

    const title = normalizeRequiredString(parsed.title, 'Draft title');
    const summary = normalizeRequiredString(parsed.summary, 'Draft summary');

    if (!Array.isArray(parsed.blocks)) {
        throw new Error('Draft blocks must be an array');
    }

    if (parsed.blocks.length === 0) {
        throw new Error('Draft must contain at least one block');
    }

    const blocks = parsed.blocks.map((block, index) =>
        parseBlock(block, index + 1),
    );

    const normalizedBlocks = blocks.map((block, index) => ({
        ...block,
        position: index + 1,
        stance: block.type === BlockType.OPINION ? block.stance : null,
    }));

    return {
        title,
        summary,
        blocks: normalizedBlocks,
    };
}
