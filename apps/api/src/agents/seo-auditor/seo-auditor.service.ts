import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { chat, AIModel, parseJsonResponse } from '../../infrastructure/openrouter';
import { SettingsService } from '../../features/settings/settings.service';

export interface SEOAuditResult {
  overallScore: number;
  passed: boolean;
  scoreAr: number;
  scoreEn: number;
  axes: {
    keywordOptimization: SEOAxis;
    contentStructure: SEOAxis;
    readability: SEOAxis;
    schemaMarkup: SEOAxis;
    internalLinks: SEOAxis;
    metaTags: SEOAxis;
    eeatSignals: SEOAxis;
    mobileFriendliness: SEOAxis;
  };
  issues: SEOIssue[];
  suggestions: string[];
}

export interface SEOAxis {
  score: number;
  maxScore: number;
  details: string;
}

export interface SEOIssue {
  axis: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  locale: 'ar' | 'en' | 'both';
}

@Injectable()
export class SEOAuditorService {
  private readonly logger = new Logger(SEOAuditorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async auditContent(content: {
    titleAr: string;
    titleEn: string;
    contentAr: string;
    contentEn: string;
    metaTitleAr?: string;
    metaTitleEn?: string;
    metaDescAr?: string;
    metaDescEn?: string;
    slug?: string;
  }): Promise<SEOAuditResult> {
    this.logger.log(`SEO Audit: "${content.titleEn}"`);

    const agentConfig = this.settingsService.getConfig('seo-auditor');
    if (agentConfig && !agentConfig.enabled) {
      this.logger.warn('SEO Auditor is disabled via settings');
      throw new Error('Agent disabled');
    }
    const model = (agentConfig?.model ?? 'anthropic/claude-haiku-3.5') as AIModel;
    const temperature = agentConfig?.temperature ?? 0.1;
    const maxTokens = agentConfig?.maxTokens ?? 1500;

    const result = await chat({
      model,
      jsonMode: true,
      maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content: `You are an SEO auditor for BabiesPicks (babiespicks.com), a Saudi baby product review platform.
Score the provided bilingual content (Arabic + English) on 8 SEO axes.

SCORING AXES (total 100 points):

1. Keyword Optimization (max 20 pts):
   - Primary keyword in H1 (5 pts)
   - Keyword density 1-2% (5 pts)
   - LSI keywords present (5 pts)
   - Keyword in first 100 words (5 pts)

2. Content Structure (max 15 pts):
   - Logical H2/H3 hierarchy (5 pts)
   - No heading level jumps (3 pts)
   - 3+ H2 sections (4 pts)
   - Proper nesting (3 pts)

3. Readability (max 15 pts):
   - Arabic: short sentences, clear فصحى بسيطة (8 pts)
   - English: clear, scannable (7 pts)

4. Schema Markup Readiness (max 15 pts):
   - Content supports Product schema (4 pts)
   - Content supports Review/Rating schema (4 pts)
   - FAQ section present for FAQPage schema (4 pts)
   - BreadcrumbList/ItemList hints (3 pts)

5. Internal/External Links (max 10 pts):
   - 3-5 internal link opportunities (4 pts)
   - Relevant external references (3 pts)
   - Good anchor text quality (3 pts)

6. Meta Tags (max 10 pts):
   - Title 50-60 chars per language (3 pts)
   - Description 140-160 chars per language (3 pts)
   - Keyword in meta title (2 pts)
   - Unique per language (2 pts)

7. E-E-A-T Signals (max 10 pts):
   - Methodology/testing mention (3 pts)
   - Source citations (3 pts)
   - Expertise indicators (2 pts)
   - Affiliate disclosure present (2 pts)

8. Mobile-Friendliness (max 5 pts):
   - No wide tables (1 pt)
   - Image alt text hints (1 pt)
   - Short paragraphs (2 pts)
   - No horizontal scroll triggers (1 pt)

Score EACH language separately, then average for overall.
Mark passed=true ONLY if overallScore >= 85.

Return JSON:
{
  "overallScore": number,
  "passed": boolean,
  "scoreAr": number,
  "scoreEn": number,
  "axes": {
    "keywordOptimization": { "score": number, "maxScore": 20, "details": "explanation" },
    "contentStructure": { "score": number, "maxScore": 15, "details": "explanation" },
    "readability": { "score": number, "maxScore": 15, "details": "explanation" },
    "schemaMarkup": { "score": number, "maxScore": 15, "details": "explanation" },
    "internalLinks": { "score": number, "maxScore": 10, "details": "explanation" },
    "metaTags": { "score": number, "maxScore": 10, "details": "explanation" },
    "eeatSignals": { "score": number, "maxScore": 10, "details": "explanation" },
    "mobileFriendliness": { "score": number, "maxScore": 5, "details": "explanation" }
  },
  "issues": [
    { "axis": "keywordOptimization", "severity": "critical|warning|info", "message": "description", "locale": "ar|en|both" }
  ],
  "suggestions": ["actionable suggestion 1", "suggestion 2"]
}`,
        },
        {
          role: 'user',
          content: `Audit this content:

Title AR: ${content.titleAr}
Title EN: ${content.titleEn}
Meta Title AR: ${content.metaTitleAr || 'not set'}
Meta Title EN: ${content.metaTitleEn || 'not set'}
Meta Desc AR: ${content.metaDescAr || 'not set'}
Meta Desc EN: ${content.metaDescEn || 'not set'}
Slug: ${content.slug || 'not set'}

Content AR (first 4000 chars):
${content.contentAr.substring(0, 4000)}

Content EN (first 4000 chars):
${content.contentEn.substring(0, 4000)}`,
        },
      ],
    });

    const parsed = parseJsonResponse<SEOAuditResult>(result.content);

    // Log agent job
    await this.prisma.agentJob.create({
      data: {
        agentName: 'seo-auditor',
        status: 'COMPLETED',
        output: {
          overallScore: parsed.overallScore,
          passed: parsed.passed,
          scoreAr: parsed.scoreAr,
          scoreEn: parsed.scoreEn,
          issueCount: parsed.issues.length,
        } as any,
        tokensUsed: result.cost.totalTokens,
        costUsd: result.cost.costUsd,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    this.logger.log(`SEO Audit: ${parsed.passed ? 'PASS' : 'FAIL'} (${parsed.overallScore}/100, AR: ${parsed.scoreAr}, EN: ${parsed.scoreEn}, ${parsed.issues.length} issues)`);
    return parsed;
  }
}
