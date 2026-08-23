interface IsAllowedSourceArticleUrlInput {
    sourceName: string;
    url: string;
}

export function isAllowedSourceArticleUrl(
    input: IsAllowedSourceArticleUrlInput,
): boolean {
    const { sourceName, url } = input;

    if (sourceName === 'ProPublica Politics') {
        return /\/article\//i.test(url);
    }

    return true;
}
