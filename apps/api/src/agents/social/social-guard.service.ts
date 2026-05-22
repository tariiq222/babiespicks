import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel, parseJsonResponse } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export interface SocialComplianceIssue {
  type: 'medical_claim' | 'missing_disclosure' | 'misleading_claim' | 'inappropriate_tone';
  severity: 'error' | 'warning';
  message: string;
}

export interface SocialComplianceResult {
  passed: boolean;
  score: number; // 0-100
  issues: SocialComplianceIssue[];
}

@Injectable()
export class SocialGuardService {
  private readonly logger = new Logger(SocialGuardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async checkCompliance(tweets: string[], hashtags: string[]): Promise<SocialComplianceResult> {
    this.logger.log(`Checking compliance for ${tweets.length} tweets`);

    const agentConfig = this.settingsService.getConfig('social-guard');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('Social guard is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-haiku-3.5') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.1;
    const maxTokens = agentConfig?.maxTokens ?? 800;

    const tweetText = tweets.map((t, i) => `[${i + 1}] ${t}`).join('\n');
    const hashtagText = hashtags.map((h) => `#${h}`).join(' ');

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You are a compliance checker for BabiesPicks, a Saudi baby product review platform.
Check social media content for:
1. Medical claims ("يعالج", "يشفي", "يقي من المرض", "treats", "cures", "prevents disease" are REJECTED)
2. Affiliate disclosure (warn if missing)
3. Misleading claims (exaggerated benefits without evidence)
4. Inappropriate tone (unprofessional, offensive)

FAIL (passed=false) if any "error" severity issues exist.

Return JSON:
{
  "passed": boolean,
  "score": number (0-100),
  "issues": [
    {"type": "medical_claim|missing_disclosure|misleading_claim|inappropriate_tone", "severity": "error|warning", "message": "description"}
  ]
}`,
        },
        {
          role: 'user',
          content: `Check this social media content:\n\nTweets:\n${tweetText}\n\nHashtags: ${hashtagText}`,
        },
      ],
    });

    const parsed = parseJsonResponse<SocialComplianceResult>(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'social-guard',
        status: 'COMPLETED',
        output: parsed as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(
      `Compliance: ${parsed.passed ? 'PASS' : 'FAIL'} (${parsed.score}/100, ${parsed.issues.length} issues)`,
    );
    return parsed;
  }
}
