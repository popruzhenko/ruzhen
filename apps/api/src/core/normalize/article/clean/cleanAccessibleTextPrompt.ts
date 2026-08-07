export interface AccessibleTextCleanerInput {
  title?: string | null;
  summary?: string | null;
  rawAccessibleText?: string | null;
  sourceName?: string | null;
  url?: string | null;
}

export const CLEAN_ACCESSIBLE_TEXT_SYSTEM_PROMPT = `
You receive the article text.

Rules:
- Keep only information that is clearly present in the input data.
- Remove unnecessary interface elements, advertising labels, subscription requests, paywall notifications, authorization requests, duplicate strings, image information, author bylines, navigation fragments, and other boilerplate text not related to the article.
- Preserve the actual meaning of the accessible fragment.
- Do not add any facts.
- Do not draw conclusions.
- Extract the full text of an article from a new site based on the following metadata.
- Do not continue incomplete sentences with fictitious content.
- Do not summarize what is clearly present.
- Return only cleaned plain text.
`.trim();

function normalizeBlock(value?: string | null): string {
  return value?.trim() ?? '';
}

export function buildCleanAccessibleTextUserPrompt(
  input: AccessibleTextCleanerInput,
): string {
  const title = normalizeBlock(input.title);
  const summary = normalizeBlock(input.summary);
  const rawAccessibleText = normalizeBlock(input.rawAccessibleText);
  const sourceName = normalizeBlock(input.sourceName);
  const url = normalizeBlock(input.url);

  return [
    sourceName ? `SOURCE_NAME:\n${sourceName}` : '',
    url ? `URL:\n${url}` : '',
    title ? `TITLE:\n${title}` : '',
    summary ? `SUMMARY:\n${summary}` : '',
    rawAccessibleText ? `ACCESSIBLE_FRAGMENT:\n${rawAccessibleText}` : '',
    'Extract the full text of an article from a new site based on the following metadata:'
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}