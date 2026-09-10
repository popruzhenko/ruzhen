// Callers supply extracted plain text. Preserve paragraphs, short articles and
// access/truncation notices so quality assessment can evaluate the actual text.
export function normalizeContent(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    return (
        value
            .replace(/\r\n?/g, '\n')
            .replace(/[^\S\n]+/g, ' ')
            .replace(/ *\n */g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim() || null
    );
}
