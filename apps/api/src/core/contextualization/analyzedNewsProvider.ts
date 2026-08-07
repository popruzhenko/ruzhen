export interface AnalyzedNewsProvider {
    generateAnalyzedNews(prompt: string): Promise<string>;
}