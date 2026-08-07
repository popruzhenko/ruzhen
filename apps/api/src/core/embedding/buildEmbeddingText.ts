import { EmbeddingBasis } from '@prisma/client';

interface BuildEmbeddingTextInput {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  cleanedAccessibleText?: string | null;
}

interface BuildEmbeddingTextResult {
  text: string | null;
  embeddingBasis: EmbeddingBasis | null;
}

function normalizeText(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

export function buildEmbeddingText(
  input: BuildEmbeddingTextInput,
): BuildEmbeddingTextResult {
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const cleanedAccessibleText = normalizeText(input.cleanedAccessibleText);

  if (content.length > 0) {
    const trimmedContent = content.slice(0, 4000);

    const parts = [
      title ? `TITLE:\n${title}` : '',
      summary ? `SUMMARY:\n${summary}` : '',
      `CONTENT:\n${trimmedContent}`,
    ].filter(Boolean);

    const text = parts.join('\n\n').trim();

    return {
      text: text.length >= 40 ? text : null,
      embeddingBasis: text.length >= 40 ? EmbeddingBasis.FULL_TEXT : null,
    };
  }

  if (cleanedAccessibleText.length > 0) {
    const trimmedAccessibleText = cleanedAccessibleText.slice(0, 3000);

    const parts = [
      title ? `TITLE:\n${title}` : '',
      summary ? `SUMMARY:\n${summary}` : '',
      `ACCESSIBLE_TEXT:\n${trimmedAccessibleText}`,
    ].filter(Boolean);

    const text = parts.join('\n\n').trim();

    return {
      text: text.length >= 40 ? text : null,
      embeddingBasis:
        text.length >= 40 ? EmbeddingBasis.CLEANED_ACCESSIBLE_TEXT : null,
    };
  }

  if (summary.length > 0) {
    const parts = [
      title ? `TITLE:\n${title}` : '',
      `SUMMARY:\n${summary}`,
    ].filter(Boolean);

    const text = parts.join('\n\n').trim();

    return {
      text: text.length >= 20 ? text : null,
      embeddingBasis: text.length >= 20 ? EmbeddingBasis.SUMMARY_ONLY : null,
    };
  }

  if (title.length > 0) {
    return {
      text: title,
      embeddingBasis: EmbeddingBasis.TITLE_ONLY,
    };
  }

  return {
    text: null,
    embeddingBasis: null,
  };
}