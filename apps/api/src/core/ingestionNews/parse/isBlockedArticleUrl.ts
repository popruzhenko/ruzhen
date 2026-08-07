const BLOCKED_URL_PATTERNS = [
  /\/legal\/?$/i,
  /\/advertising\/?$/i,
  /\/privacy\/?$/i,
  /\/about\/?$/i,
  /\/contact\/?$/i,
  /\/donate\/?$/i,
  /\/jobs\/?$/i,
  /\/careers\/?$/i,
  /\/events\/?$/i,
  /\/newsletters\/?$/i,
  /\/store\/?$/i,
];

export function isBlockedArticleUrl(url?: string | null): boolean {
  if (!url) {
    return true;
  }

  return BLOCKED_URL_PATTERNS.some((pattern) => pattern.test(url));
}