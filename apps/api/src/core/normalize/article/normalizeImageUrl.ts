export function normalizeImageUrl(
  value?: string | null,
  baseUrl?: string | null,
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    url.hash = '';

    return url.toString();
  } catch {
    return null;
  }
}   