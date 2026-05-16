import OpenAI from 'openai';

export type AIModel =
  | 'anthropic/claude-sonnet-4'
  | 'google/gemini-2.5-flash'
  | 'zhipu/glm-4.5-air';

interface ChatOptions {
  model: AIModel;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface CostInfo {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://babiespicks.com',
        'X-OpenRouter-Title': 'BabiesPicks',
      },
    });
  }
  return client;
}

export async function chat(opts: ChatOptions): Promise<{
  content: string;
  cost: CostInfo;
}> {
  const openai = getClient();

  const response = await openai.chat.completions.create({
    model: opts.model,
    messages: opts.messages,
    ...(opts.jsonMode && { response_format: { type: 'json_object' } }),
    ...(opts.maxTokens && { max_tokens: opts.maxTokens }),
  });

  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';
  const usage = response.usage;

  return {
    content,
    cost: {
      model: opts.model,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}

export { getClient };
