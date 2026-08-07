const POLITICS_KEYWORDS = [
  'politics',
  'political',
  'government',
  'parliament',
  'president',
  'prime minister',
  'minister',
  'senate',
  'congress',
  'election',
  'campaign',
  'white house',
  'kremlin',
  'cabinet',
  'diplomacy',
  'foreign policy',
  'sanctions',
  'vote',
  'voting',
  'lawmakers',
  'policy',
  'geopolitics',
  'state department',
  'defence ministry',
  'opposition',
  'coalition',
  'referendum',
];

const POLITICS_URL_HINTS = [
  '/politics',
  '/politic',
  '/government',
  '/election',
  '/world/',
  '/news/',
  '/us/',
  '/middle-east/',
  '/europe/',
];

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isPoliticsArticle(input: {
  title?: string | null;
  summary?: string | null;
  url?: string | null;
}): boolean {
  const haystack = [
    normalizeText(input.title),
    normalizeText(input.summary),
    normalizeText(input.url),
  ].join(' ');

  const hasKeyword = POLITICS_KEYWORDS.some((keyword) => haystack.includes(keyword));
  const hasUrlHint = POLITICS_URL_HINTS.some((hint) =>
    normalizeText(input.url).includes(hint),
  );

  return hasKeyword || hasUrlHint;
}