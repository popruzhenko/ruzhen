import { CleaningMethod } from '@prisma/client';
import type { AccessibleTextCleaner } from './cleanAccessibleTextWithLlm';
import { cleanAccessibleTextWithLlm } from './cleanAccessibleTextWithLlm';
import type { AccessibleTextCleanerInput } from './cleanAccessibleTextPrompt';
import { postProcessCleanedText } from './postProcessCleanedText';

export interface CleanAccessibleTextInput extends AccessibleTextCleanerInput {}

export interface CleanAccessibleTextResult {
    cleanedText: string | null;
    cleaningMethod: CleaningMethod | null;
}

const BLOCKED_LINE_PATTERNS = [
    /^advertisement$/i,
    /^skip advertisement$/i,
    /^advertisementskip advertisement$/i,
    /^already a subscriber\? log in\.?$/i,
    /^want all of the times\? subscribe\.?$/i,
    /^thank you for your patience while we verify access\.?$/i,
    /^you have a preview view of this article while we are checking your access\.?$/i,
    /^if you are in reader mode please exit and log into your times account, or subscribe for all of the times\.?$/i,
    /^listen\s*·/i,
    /^credit\.\.\./i,
    /^by\s+[A-Z]/,
];

const BLOCKED_INLINE_PATTERNS = [
    /advertisement\s*skip advertisement/gi,
    /advertisement\s*skip/gi,
    /you have a preview view of this article while we are checking your access\.?/gi,
    /when we have confirmed access, the full article content will load\.?/gi,
    /thank you for your patience while we verify access\.?/gi,
    /if you are in reader mode please exit and log into your times account, or subscribe for all of the times\.?/gi,
    /already a subscriber\?\s*log in\.?/gi,
    /want all of the times\?\s*subscribe\.?/gi,
];

function normalizeWhitespace(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const normalized = value.replace(/\r/g, '\n').replace(/\t/g, ' ');
    const compact = normalized.replace(/[ ]{2,}/g, ' ').trim();

    return compact.length > 0 ? compact : null;
}

function splitIntoLines(value: string): string[] {
    return value
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
}

function isBlockedLine(line: string): boolean {
    return BLOCKED_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

function removeDuplicateAdjacentLines(lines: string[]): string[] {
    const result: string[] = [];

    for (const line of lines) {
        const previous = result[result.length - 1];

        if (previous?.toLowerCase() === line.toLowerCase()) {
            continue;
        }

        result.push(line);
    }

    return result;
}

function applyRuleBasedCleaning(rawText?: string | null): string | null {
    const normalized = normalizeWhitespace(rawText);

    if (!normalized) {
        return null;
    }

    let text = normalized;

    for (const pattern of BLOCKED_INLINE_PATTERNS) {
        text = text.replace(pattern, ' ');
    }

    const lines = splitIntoLines(text).filter((line) => !isBlockedLine(line));
    const deduped = removeDuplicateAdjacentLines(lines);

    const joined = deduped.join('\n');
    const compact = joined.replace(/\n{3,}/g, '\n\n').trim();

    return compact.length > 0 ? compact : null;
}

function looksNoisy(text?: string | null): boolean {
    if (!text) {
        return false;
    }

    const lower = text.toLowerCase();

    return (
        lower.includes('preview view of this article') ||
        lower.includes('thank you for your patience while we verify access') ||
        lower.includes('already a subscriber') ||
        lower.includes('want all of the times') ||
        lower.includes('advertisementskip advertisement') ||
        lower.includes('advertisementskip') ||
        lower.includes('credit...') ||
        lower.includes('listen ·') ||
        lower.includes('skip to content') ||
        lower.includes('more on this story') ||
        lower.includes('home news sport business technology') ||
        lower.startsWith('transcript') ||
        lower.startsWith('hello!')
    );
}

export async function cleanAccessibleText(
    input: CleanAccessibleTextInput,
    cleaner?: AccessibleTextCleaner,
): Promise<CleanAccessibleTextResult> {
    const rawAccessibleText = normalizeWhitespace(input.rawAccessibleText);

    if (!rawAccessibleText) {
        return {
            cleanedText: null,
            cleaningMethod: null,
        };
    }

    const ruleBasedText = applyRuleBasedCleaning(rawAccessibleText);

    if (!ruleBasedText) {
        return {
            cleanedText: null,
            cleaningMethod: null,
        };
    }

    const postRuleBasedText = postProcessCleanedText(ruleBasedText);

    if (!postRuleBasedText) {
        return {
            cleanedText: null,
            cleaningMethod: null,
        };
    }

    if (!looksNoisy(postRuleBasedText) || !cleaner) {
        return {
            cleanedText: postRuleBasedText,
            cleaningMethod: CleaningMethod.RULE_BASED,
        };
    }

    const llmCleanedText = await cleanAccessibleTextWithLlm(cleaner, {
        title: input.title ? postProcessCleanedText(input.title) : '',
        summary: input.summary ? postProcessCleanedText(input.summary) : '',
        rawAccessibleText: postRuleBasedText,
        sourceName: input.sourceName,
        url: input.url,
    });

    if (!llmCleanedText) {
        return {
            cleanedText: postRuleBasedText,
            cleaningMethod: CleaningMethod.RULE_BASED,
        };
    }

    const postLlmCleanedText = postProcessCleanedText(llmCleanedText);

    return {
        cleanedText: postLlmCleanedText || postRuleBasedText,
        cleaningMethod: CleaningMethod.LLM_ASSISTED,
    };
}
