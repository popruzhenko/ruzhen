import { removeTrackingParams } from '../shared/removeTrackingParams';

export function normalizeUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    url.hash = '';
    removeTrackingParams(url);

    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}