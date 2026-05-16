import OpenRouter from '@openrouter/sdk';

export type AIModel =
  | 'anthropic/claude-sonnet-4'     // Verdict + Content (high quality)
  | 'google/gemini-2.5-flash'       // Reviews (cheap + Arabic support)
  | 'zhipu/glm-4.5-air';           // Data extraction (cheapest)

interface ChatOptions {
  model: AIModel;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
  maxTokens?: number;
}

interface CostInfo {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

let client: OpenRouter | null = null;

function getClient(): OpenRouter {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    client = new OpenRouter({
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
  const openrouter = getClient();

  const response = await openrouter.chat.send({
    model: opts.model,
    messages: opts.messages,
    ...(opts.jsonMode && { response_format: { type: 'json_object' } }),
    ...(opts.maxTokens && { max_tokens: opts.maxTokens }),
  });

  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';

  const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    content,
    cost: {
      model: opts.model,
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
      estimatedCostUsd: 0, // Will be calculated from model pricing
    },
  };
}

export { getClient };
