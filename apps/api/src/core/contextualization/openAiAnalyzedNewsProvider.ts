import OpenAI from 'openai';
import type { AnalyzedNewsProvider } from './analyzedNewsProvider';

export class OpenAiAnalyzedNewsProvider implements AnalyzedNewsProvider {
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model = 'gpt-5.6-sol') {
        this.client = new OpenAI({
            apiKey,
        });

        this.model = model;
    }

    async generateAnalyzedNews(prompt: string): Promise<string> {
        const response = await this.client.chat.completions.create({
            model: this.model,
            response_format: {
                type: 'json_object',
            },
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a senior analytical news editor. You separate facts, context, and opinions strictly. You never invent facts. You return only valid JSON.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const content = response.choices[0]?.message?.content;

        if (!content) {
            throw new Error('OpenAI returned empty analyzed news response');
        }

        return content;
    }
}