import { ContentAvailability } from '@prisma/client';
import {
    MIN_FULL_TEXT_CONTENT_LENGTH,
    MIN_SUMMARY_ONLY_LENGTH,
    MIN_PARTIAL_TEXT_CLEANED_LENGTH,
} from './contentAvailability.constants';

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

    if (content.length >= MIN_FULL_TEXT_CONTENT_LENGTH) {
        return ContentAvailability.FULL_TEXT;
    }

    if (cleanedAccessibleText.length >= MIN_PARTIAL_TEXT_CLEANED_LENGTH) {
        return ContentAvailability.PARTIAL_TEXT;
    }

    if (summary.length >= MIN_SUMMARY_ONLY_LENGTH) {
        return ContentAvailability.SUMMARY_ONLY;
    }
    if (title.length > 0) {
        return ContentAvailability.TITLE_ONLY;
    }

    return ContentAvailability.PREVIEW_ONLY;
}
