import OpenAI from 'openai';
import type { AccessibleTextCleaner } from './cleanAccessibleTextWithLlm';
import {
    buildCleanAccessibleTextUserPrompt,
    CLEAN_ACCESSIBLE_TEXT_SYSTEM_PROMPT,
    type AccessibleTextCleanerInput,
} from './cleanAccessibleTextPrompt';

function normalizeText(value?: string | null): string | null {
    if (!value) {
        return null;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
}

interface OpenAiAccessibleTextCleanerOptions {
    apiKey: string;
    model?: string;
}

export class OpenAiAccessibleTextCleaner implements AccessibleTextCleaner {
    private client: OpenAI;
    private model: string;
    private tools: Array<{ type: 'web_search' }>;

    constructor(options: OpenAiAccessibleTextCleanerOptions) {
        this.client = new OpenAI({
            apiKey: options.apiKey,
        });

        this.model = options.model ?? 'gpt-4o-mini';
        this.tools = [{ type: 'web_search' }];
    }

    async clean(input: AccessibleTextCleanerInput): Promise<string | null> {
        const userPrompt = buildCleanAccessibleTextUserPrompt(input);

        if (!userPrompt) {
            return null;
        }

        const response = await this.client.chat.completions.create({
            model: this.model,
            temperature: 0,
            messages: [
                {
                    role: 'system',
                    content: CLEAN_ACCESSIBLE_TEXT_SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const content = response.choices[0]?.message?.content ?? null;
        return normalizeText(content);
    }
}
