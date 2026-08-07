import { collapseWhitespace } from '../shared/collapseWhitespace';

function removeSourceSuffixes(value: string): string {
  return value
    .replace(/\s+\|\s+Reuters$/i, '')
    .replace(/\s+\|\s+BBC News$/i, '')
    .replace(/\s+\|\s+AP News$/i, '')
    .replace(/\s+\|\s+Associated Press$/i, '')
    .replace(/\s+\|\s+Bloomberg$/i, '')
    .replace(/\s+\|\s+Financial Times$/i, '')
    .replace(/\s+\|\s+The New York Times$/i, '')
    .replace(/\s+\-\s+Reuters$/i, '')
    .replace(/\s+\-\s+BBC News$/i, '')
    .replace(/\s+\-\s+AP News$/i, '')
    .replace(/\s+\-\s+Bloomberg$/i, '')
    .replace(/\s+\-\s+WSJ$/i, '')
    .replace(/\s+\-\s+Financial Times$/i, '')
    .replace(/\s+\-\s+The New York Times$/i, '');
}

export function normalizeTitle(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const cleaned = collapseWhitespace(removeSourceSuffixes(value));

  return cleaned.length > 0 ? cleaned : null;
}