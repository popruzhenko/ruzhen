import { collapseWhitespace } from '../shared/collapseWhitespace';
import { stripHtml } from '../shared/stripHtml';

function removeSummaryNoise(value: string): string {
  return value
    .replace(/\bRead more\b/gi, ' ')
    .replace(/\bClick here\b/gi, ' ')
    .replace(/\bAdvertisement\b/gi, ' ')
    .replace(/\bSign up\b/gi, ' ');
}

export function normalizeSummary(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const withoutHtml = stripHtml(value);
  const withoutNoise = removeSummaryNoise(withoutHtml);
  const normalized = collapseWhitespace(withoutNoise);

  if (normalized.length < 20) {
    return null;
  }

  return normalized;
}