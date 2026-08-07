const GARBAGE_START_PATTERNS = [
    /^skip to content/i,
    /^british broadcasting corporation/i,
    /^home news sport business technology/i,
];

const GARBAGE_INLINE_PATTERNS = [
    /skip to content/gi,
    /more on this story\.?/gi,
    /home\s+news\s+sport\s+business\s+technology\s+health\s+culture\s+arts\s+travel\s+earth\s+audio\s+video\s+live/gi,
    /watch:\s*/gi,
    /sign up/gi,
    /subscribe/gi,
];

function looksLikeNavigationGarbage(text: string): boolean {
    const lower = text.toLowerCase();

    return (
        lower.includes('skip to content') &&
        lower.includes('home') &&
        lower.includes('news') &&
        lower.includes('sport')
    );
}

export function postProcessCleanedText(text: string): string {
    let cleaned = text
        .replace(/^transcript\s*/i, '')
        .replace(/^hello!?[\s,]*/i, '')
        .replace(/^breaking\s*/i, '')
        .replace(/read more/gi, '')
        .replace(/advertisement\s*skip/gi, '')
        .replace(/listen\s*·?\s*\d+:\d+\s*min/gi, '')
        .replace(/credit\.\.\..*?(?=[A-Z])/g, '')
        .replace(
            /^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s+[AP]M\s+UTC/i,
            '',
        )
        .replace(/new video loaded:\s*/gi, '')
        .replace(/transcripttranscript/gi, '')
        .replace(/^transcript\s*/gi, '')
        .replace(/By\s+[A-Z][A-Za-z\s.'-]+April\s+\d{1,2},\s+\d{4}$/g, '')
        .trim();

    for (const pattern of GARBAGE_START_PATTERNS) {
        cleaned = cleaned.replace(pattern, '');
    }

    for (const pattern of GARBAGE_INLINE_PATTERNS) {
        cleaned = cleaned.replace(pattern, ' ');
    }

    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    if (looksLikeNavigationGarbage(cleaned)) {
        return '';
    }

    if (cleaned.length < 300) {
        return '';
    }

    return cleaned;
}
