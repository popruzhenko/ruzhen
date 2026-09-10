import { ContentAvailability } from '@prisma/client';
import { isCurrentFullTextAssessment } from '../../ingestionNews/enrich/articleContentQuality';

interface DetectContentAvailabilityInput {
    title?: string | null;
    summary?: string | null;
    content?: string | null;
    cleanedAccessibleText?: string | null;
    contentAssessment?: unknown;
}

export function detectContentAvailability(
    input: DetectContentAvailabilityInput,
): ContentAvailability {
    const title = input.title?.trim() ?? '';
    const summary = input.summary?.trim() ?? '';
    const content = input.content?.trim() ?? '';
    const cleanedAccessibleText = input.cleanedAccessibleText?.trim() ?? '';

    if (
        isCurrentFullTextAssessment(
            input.content ?? '',
            input.contentAssessment,
        )
    ) {
        return ContentAvailability.FULL_TEXT;
    }

    if (
        (content && content !== summary) ||
        (cleanedAccessibleText && cleanedAccessibleText !== summary)
    ) {
        return ContentAvailability.PARTIAL_TEXT;
    }

    if (summary || content || cleanedAccessibleText) {
        return ContentAvailability.SUMMARY_ONLY;
    }
    if (title.length > 0) {
        return ContentAvailability.TITLE_ONLY;
    }

    return ContentAvailability.PREVIEW_ONLY;
}
