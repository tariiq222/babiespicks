import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat } from '../../infrastructure/openrouter';

export interface QualityCheckResult {
  passed: boolean;
  score: number; // 0-100
  issues: QualityIssue[];
  suggestions: string[];
}

export interface QualityIssue {
  type: 'medical_claim' | 'missing_disclosure' | 'seo_issue' | 'duplicate_content' | 'low_quality';
  severity: 'error' | 'warning';
  message: string;
  location?: string;
}

@Injectable()
export class QualityGuardService {
  private readonly logger = new Logger(QualityGuardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkContent(content: {
    titleAr: string;
    titleEn: string;
    contentAr: string;
    contentEn: string;
  }): Promise<QualityCheckResult> {
    this.logger.log(`Quality check: "${content.titleEn}"`);

    const result = await chat({
      model: 'google/gemini-2.5-flash',
      jsonMode: true,
      maxTokens: 1000,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: `You are a quality checker for BabiesPicks, a Saudi baby product review platform.
Check content for:
1. Medical claims ("يعالج", "يشفي", "يقي من المرض" are REJECTED)
2. Affiliate disclosure present
3. SEO: H1 present, headings hierarchy, meta length
4. Content quality: minimum 500 words, no filler
5. Factual accuracy for baby products

Return JSON:
{
  "passed": boolean,
  "score": number (0-100),
  "issues": [
    {"type": "medical_claim|missing_disclosure|seo_issue|duplicate_content|low_quality", "severity": "error|warning", "message": "description", "location": "where in content"}
  ],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

FAIL (passed=false) if any "error" severity issues exist.`,
        },
        {
          role: 'user',
          content: `Check this content:\n\nTitle AR: ${content.titleAr}\nTitle EN: ${content.titleEn}\n\nContent AR:\n${content.contentAr.substring(0, 3000)}\n\nContent EN:\n${content.contentEn.substring(0, 3000)}`,
        },
      ],
    });

    const parsed: QualityCheckResult = JSON.parse(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'quality-guard',
        status: 'COMPLETED',
        output: parsed as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`Quality: ${parsed.passed ? 'PASS' : 'FAIL'} (${parsed.score}/100, ${parsed.issues.length} issues)`);
    return parsed;
  }
}
