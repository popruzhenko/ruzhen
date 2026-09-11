export interface AnalyzedNewsProvider {
    generateAnalyzedNews(prompt: string, signal?: AbortSignal): Promise<string>;
}
