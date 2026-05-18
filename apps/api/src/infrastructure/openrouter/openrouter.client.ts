import OpenAI from 'openai';

export type AIModel =
  | 'anthropic/claude-sonnet-4'
  | 'google/gemini-2.5-flash'
  | 'zhipu/glm-4.5-air'
  | 'openai/gpt-4o'
  | 'openai/gpt-4o-mini'
  | 'anthropic/claude-haiku-3.5'
  | 'google/gemini-2.5-pro';

interface ChatOptions {
  model: AIModel;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface CostInfo {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
  'google/gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'zhipu/glm-4.5-air': { input: 0.0001, output: 0.0004 },
  'openai/gpt-4o': { input: 0.0025, output: 0.01 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'anthropic/claude-haiku-3.5': { input: 0.0008, output: 0.004 },
  'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
};

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
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
  });

  const choice = response.choices?.[0];
  const content = choice?.message?.content ?? '';
  const usage = response.usage;

  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? 0;

  const rate = COST_PER_1K[opts.model] ?? { input: 0, output: 0 };
  const costUsd =
    (promptTokens / 1000) * rate.input +
    (completionTokens / 1000) * rate.output;

  return {
    content,
    cost: {
      model: opts.model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
    },
  };
}

export { getClient };
