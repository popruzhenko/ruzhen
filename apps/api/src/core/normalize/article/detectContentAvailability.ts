import { ContentAvailability } from '@prisma/client';

interface DetectContentAvailabilityInput {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    cleanedAccessibleText?: string | null;
}

export function detectContentAvailability(
    input: DetectContentAvailabilityInput,
): ContentAvailability {
    const title = input.title?.trim() ?? '';
    const summary = input.summary?.trim() ?? '';
    const content = input.content?.trim() ?? '';
    const cleanedAccessibleText = input.cleanedAccessibleText?.trim() ?? '';

    if (content.length >= 1200) {
        return ContentAvailability.FULL_TEXT;
    }

    if (cleanedAccessibleText.length >= 300) {
        return ContentAvailability.PARTIAL_TEXT;
    }

    if (summary.length >= 40) {
        return ContentAvailability.SUMMARY_ONLY;
    }
    if (title.length > 0) {
        return ContentAvailability.TITLE_ONLY;
    }

    return ContentAvailability.PREVIEW_ONLY;
}
