import type { AccessibleTextCleanerInput } from './cleanAccessibleTextPrompt';

export interface AccessibleTextCleaner {
    clean(input: AccessibleTextCleanerInput): Promise<string | null>;
}

function normalizeText(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

export async function cleanAccessibleTextWithLlm(
    cleaner: AccessibleTextCleaner,
    input: AccessibleTextCleanerInput,
): Promise<string | null> {
    const cleaned = await cleaner.clean(input);
    return normalizeText(cleaned);
}
