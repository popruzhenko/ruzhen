import OpenAI from 'openai';
import type { EmbeddingProvider } from './embeddingProvider';

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
    private client: OpenAI;

    constructor(apiKey: string) {
        this.client = new OpenAI({
            apiKey,
        });
    }

    async createEmbedding(input: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: 'text-embedding-3-small',
            input,
        });

        return response.data[0].embedding;
    }
}
