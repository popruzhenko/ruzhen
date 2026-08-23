export function buildClusterTitleFromArticles(
    articles: Array<{ title: string }>,
): string {
    const firstTitle = articles[0]?.title?.trim();

    if (firstTitle && firstTitle.length >= 5) {
        return firstTitle.slice(0, 140);
    }

    return `Cluster ${new Date().toISOString().slice(0, 10)}`;
}
