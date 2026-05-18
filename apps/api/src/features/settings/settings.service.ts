import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const DEFAULT_CONFIGS = [
  {
    agentName: 'verdict-engine',
    model: 'anthropic/claude-sonnet-4',
    temperature: 0.3,
    maxTokens: 2000,
    description: 'تقييم المنتجات وإصدار الأحكام',
  },
  {
    agentName: 'content-writer',
    model: 'anthropic/claude-sonnet-4',
    temperature: 0.7,
    maxTokens: 4000,
    description: 'كتابة المراجعات والمحتوى',
  },
  {
    agentName: 'review-analyzer',
    model: 'google/gemini-2.5-flash',
    temperature: 0.2,
    maxTokens: 1500,
    description: 'تحليل مراجعات المستخدمين',
  },
  {
    agentName: 'quality-guard',
    model: 'google/gemini-2.5-flash',
    temperature: 0.1,
    maxTokens: 1000,
    description: 'فحص جودة المحتوى',
  },
  {
    agentName: 'ai-extraction',
    model: 'google/gemini-2.5-flash',
    temperature: 0.1,
    maxTokens: 1000,
    description: 'استخراج بيانات المنتج من HTML',
  },
  {
    agentName: 'smart-scorer',
    model: 'google/gemini-2.5-flash',
    temperature: 0.2,
    maxTokens: 2000,
    description: 'تقييم ذكي للمنتجات المرشحة',
  },
  {
    agentName: 'google-trends',
    model: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 2000,
    description: 'اكتشاف المنتجات الرائجة',
  },
  {
    agentName: 'competitor-scan',
    model: 'google/gemini-2.5-flash',
    temperature: 0.3,
    maxTokens: 2000,
    description: 'تحليل فجوات المنافسين',
  },
  {
    agentName: 'seo-planner',
    model: 'anthropic/claude-haiku-3.5',
    temperature: 0.3,
    maxTokens: 2000,
    description: 'تخطيط SEO وبحث الكلمات المفتاحية',
  },
  {
    agentName: 'seo-auditor',
    model: 'anthropic/claude-haiku-3.5',
    temperature: 0.1,
    maxTokens: 1500,
    description: 'تدقيق SEO وتقييم المحتوى',
  },
  {
    agentName: 'tweet-crafter',
    model: 'anthropic/claude-sonnet-4',
    temperature: 0.7,
    maxTokens: 2000,
    description: 'كتابة تغريدات وثريدات',
  },
  {
    agentName: 'hashtag-miner',
    model: 'anthropic/claude-haiku-3.5',
    temperature: 0.3,
    maxTokens: 500,
    description: 'تحسين الهاشتاقات',
  },
  {
    agentName: 'social-guard',
    model: 'anthropic/claude-haiku-3.5',
    temperature: 0.1,
    maxTokens: 800,
    description: 'فحص امتثال المحتوى الاجتماعي',
  },
];

export const AVAILABLE_MODELS = [
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    tier: 'premium',
    costInput: 0.003,
    costOutput: 0.015,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    tier: 'fast',
    costInput: 0.00015,
    costOutput: 0.0006,
  },
  {
    id: 'zhipu/glm-4.5-air',
    name: 'GLM 4.5 Air',
    provider: 'Zhipu',
    tier: 'budget',
    costInput: 0.0001,
    costOutput: 0.0004,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    tier: 'premium',
    costInput: 0.0025,
    costOutput: 0.01,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    tier: 'fast',
    costInput: 0.00015,
    costOutput: 0.0006,
  },
  {
    id: 'anthropic/claude-haiku-3.5',
    name: 'Claude Haiku 3.5',
    provider: 'Anthropic',
    tier: 'fast',
    costInput: 0.0008,
    costOutput: 0.004,
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    tier: 'premium',
    costInput: 0.00125,
    costOutput: 0.005,
  },
];

export interface AgentConfigEntry {
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
}

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private configCache = new Map<string, AgentConfigEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.refreshCache();
  }

  private async seedDefaults() {
    for (const config of DEFAULT_CONFIGS) {
      await this.prisma.agentConfig.upsert({
        where: { agentName: config.agentName },
        create: config,
        update: {}, // don't overwrite user changes
      });
    }
    this.logger.log(`Seeded ${DEFAULT_CONFIGS.length} agent configs`);
  }

  async refreshCache() {
    const configs = await this.prisma.agentConfig.findMany();
    this.configCache.clear();
    for (const c of configs) {
      this.configCache.set(c.agentName, {
        model: c.model,
        temperature: c.temperature,
        maxTokens: c.maxTokens,
        enabled: c.enabled,
      });
    }
  }

  getConfig(agentName: string): AgentConfigEntry | null {
    return this.configCache.get(agentName) ?? null;
  }

  async getAllConfigs() {
    return this.prisma.agentConfig.findMany({ orderBy: { agentName: 'asc' } });
  }

  async updateConfig(
    agentName: string,
    data: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      enabled?: boolean;
    },
  ) {
    const updated = await this.prisma.agentConfig.update({
      where: { agentName },
      data,
    });
    await this.refreshCache();
    return updated;
  }

  getAvailableModels() {
    return AVAILABLE_MODELS;
  }
}
