'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/shared/lib/admin-fetch';

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

interface AgentConfig {
  id: string;
  agentName: string;
  model: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  tier: 'premium' | 'fast' | 'budget';
  costInput: number;
  costOutput: number;
}

interface SettingsData {
  configs: AgentConfig[];
  models: ModelInfo[];
}

interface CostStats {
  totalTokens: number;
  totalCostUsd: number;
  byAgent: { agentName: string; tokens: number; costUsd: number; jobCount: number }[];
  last7Days: { date: string; tokens: number; costUsd: number }[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
}

interface AffiliateStats {
  totalClicks: number;
  byStore: { store: string; clicks: number; lastClick?: string }[];
  daily: { date: string; clicks: number }[];
}

interface TopProduct {
  productId: string;
  productName?: string;
  slug?: string;
  clicks: number;
  store?: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                             */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const AGENT_LABELS: Record<string, { ar: string; icon: string }> = {
  'verdict-engine': { ar: 'محرك الأحكام', icon: 'ti-scale' },
  'content-writer': { ar: 'كاتب المحتوى', icon: 'ti-pencil' },
  'review-analyzer': { ar: 'محلل المراجعات', icon: 'ti-analyze' },
  'quality-guard': { ar: 'حارس الجودة', icon: 'ti-shield-check' },
  'ai-extraction': { ar: 'استخراج البيانات', icon: 'ti-database-import' },
  'smart-scorer': { ar: 'المقيّم الذكي', icon: 'ti-brain' },
  'google-trends': { ar: 'جوجل ترندز', icon: 'ti-trending-up' },
  'competitor-scan': { ar: 'مسح المنافسين', icon: 'ti-radar-2' },
  'seo-planner': { ar: 'مخطط SEO', icon: 'ti-search' },
  'seo-auditor': { ar: 'مدقق SEO', icon: 'ti-checkup' },
  'tweet-crafter': { ar: 'كاتب التغريدات', icon: 'ti-brand-twitter' },
  'hashtag-miner': { ar: 'الهاشتاقات', icon: 'ti-hash' },
  'social-guard': { ar: 'حارس السوشال', icon: 'ti-shield-lock' },
};

/* ------------------------------------------------------------------ */
/* Pipeline Nodes — Full Architecture                                    */
/* ------------------------------------------------------------------ */

type NodeType = 'ai' | 'manual' | 'system' | 'verify' | 'breaker';
type PhaseLabel =
  | 'P1'
  | 'Verify1'
  | 'P2'
  | 'Verify2'
  | 'Gate1'
  | 'P3'
  | 'Verify3'
  | 'P4'
  | 'Verify4'
  | 'Gate2'
  | 'P5';

interface PipelineNode {
  id: string;
  label: string;
  subtitle: string;
  phase: PhaseLabel;
  phaseLabelAr: string;
  type: NodeType;
  configAgentName?: string;
  icon: string;
  details: string[];
  /** Human-readable trigger: cron, after-approve, after-publish, etc. */
  trigger?: string;
  /** Approximate cost per call, shown as text */
  costHint?: string;
  /** Failure / retry behaviour */
  failureBehavior?: string;
}

const PIPELINE_NODES: PipelineNode[] = [
  // ── P1 — Discovery & Curation ─────────────────────────────────────
  {
    id: 'trend-discovery',
    label: 'Trend Discovery',
    subtitle: 'AI — اكتشاف الترندات',
    phase: 'P1',
    phaseLabelAr: 'P1 — الاكتشاف والمنهج',
    type: 'ai',
    configAgentName: 'google-trends',
    icon: 'ti-trending-up',
    trigger: 'cron (يومي)',
    costHint: '~$0.002/استدعاء',
    failureBehavior: 'يتخطى المنتج ويعيد المحاولة في الدورة التالية',
    details: [
      'يحلل ترندات جوجل البحثية لاكتشاف الفرص الجديدة في السوق السعودي.',
      'يستخدم بيانات موسمانية وتاريخية لتقييم حجم الطلب.',
      'يُقيّم حجم السوق ونمو البحث العضوي لكل فئة.',
    ],
  },
  {
    id: 'keyword-research',
    label: 'Keyword Research',
    subtitle: 'AI/System — بحث الكلمات المفتاحية',
    phase: 'P1',
    phaseLabelAr: 'P1 — الاكتشاف والمنهج',
    type: 'ai',
    configAgentName: 'google-trends',
    icon: 'ti-search',
    trigger: 'بعد trend-discovery',
    costHint: '~$0.003/استدعاء',
    failureBehavior: 'يستخدم كلمات احتياطية من الذاكرة',
    details: [
      'بحث معمّق عن الكلمات المفتاحية لكل فرصة مكتشفة.',
      'يستهدف السوق السعودي واللغة العربية.',
      'يُنتج قائمة أولويات من 5–15 كلمة مفتاحية لكل منتج.',
    ],
  },
  {
    id: 'product-search',
    label: 'Product Search',
    subtitle: 'System — البحث عن المنتجات',
    phase: 'P1',
    phaseLabelAr: 'P1 — الاكتشاف والمنهج',
    type: 'system',
    icon: 'ti-shopping-cart',
    trigger: 'بعد keyword-research',
    failureBehavior: 'يُعلم المسؤول يدوياً',
    details: [
      'يبحث في متاجر الأطفال الكبرى عن المنتجات المطابقة.',
      'يستخرج الروابط والصور والأسعار مبدئياً.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'opportunity-scoring',
    label: 'Opportunity Scoring',
    subtitle: 'AI — تقييم الفرصة',
    phase: 'P1',
    phaseLabelAr: 'P1 — الاكتشاف والمنهج',
    type: 'ai',
    configAgentName: 'smart-scorer',
    icon: 'ti-brain',
    trigger: 'بعد product-search',
    costHint: '~$0.005/استدعاء',
    failureBehavior: 'يعطي درجة افتراضية 50 ولا يوقف المسار',
    details: [
      'يُقيّم كل فرصة بناءً على: حجم الطلب، المنافسة، الهامش، الموسمية.',
      'يعين درجة فرصة من 0–100.',
      'يُرشح أفضل الفرص للمرحلة التالية (P2).',
    ],
  },
  {
    id: 'deduplication',
    label: 'Deduplication',
    subtitle: 'System — إزالة التكرار',
    phase: 'P1',
    phaseLabelAr: 'P1 — الاكتشاف والمنهج',
    type: 'system',
    icon: 'ti-copy',
    trigger: 'بعد opportunity-scoring',
    failureBehavior: 'يتخطى التكرار ويستمر',
    details: [
      'يتحقق من عدم وجود المنتج مسبقاً في قاعدة البيانات.',
      'يقارن الاسم والسعر والمتجر الأساسي.',
      'يُوقف المنتجات المكررة.',
    ],
  },

  // ── Verify 1 — Opportunity ─────────────────────────────────────────
  {
    id: 'verify-opportunity',
    label: 'Verify 1 — Opportunity',
    subtitle: 'AI Verify — التحقق من الفرصة',
    phase: 'Verify1',
    phaseLabelAr: '✓ التحقق ١ — الفرصة',
    type: 'verify',
    icon: 'ti-shield-check',
    trigger: 'بعد deduplication',
    costHint: '~$0.004/استدعاء',
    failureBehavior: 'يحول للمراجعة اليدوية (لا يوقف تلقائياً)',
    details: [
      'يتحقق: درجة Opportunity ≥ 60.',
      'يتأكد: المنتج غير مكرر في النظام.',
      'يتحقق: حجم السوق كافي للكتب.',
    ],
  },

  // ── P2 — Content Production ─────────────────────────────────────────
  {
    id: 'data-acquisition',
    label: '2.1 Data Acquisition',
    subtitle: 'AI — استخراج بيانات المنتج',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'ai-extraction',
    icon: 'ti-database-import',
    trigger: 'بعد Verify 1',
    costHint: '~$0.015/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف المنتج',
    details: [
      'يستخرج بيانات كاملة من صفحات المنتج: السعر، المواصفات، التقييمات، الصور.',
      'يُنشئ ملف منتج موحّد للتحليل.',
      'يتعامل مع متاجر متعددة في آنٍ واحد.',
    ],
  },
  {
    id: 'review-analyzer',
    label: '2.2 Review Analyzer',
    subtitle: 'AI — تحليل المراجعات',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'review-analyzer',
    icon: 'ti-analyze',
    trigger: 'بعد data-acquisition',
    costHint: '~$0.020/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف المنتج',
    details: [
      'يحلل جميع مراجعات العملاء لكل منتج.',
      'يستخرج الميزات المُكررة، المشكلات، نقاط القوة.',
      'يُنتج ملخص مراجعة منظومي يستخدمة محرّك الأحكام.',
    ],
  },
  {
    id: 'verdict-engine',
    label: '2.3 Verdict Engine',
    subtitle: 'AI — محرك الأحكام',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'verdict-engine',
    icon: 'ti-scale',
    trigger: 'بعد review-analyzer',
    costHint: '~$0.012/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف المنتج',
    details: [
      'يُقيّم المنتج على 5 محاور: السلامة 25%، الجودة 25%، المراجعات 20%، السعر 15%، القيمة طويلة المدى 15%.',
      'يُنتج درجة حكم 0–10.',
      'يُحدد نوع الحكم: WORTH_IT (≥7.5) / WORTH_IT_WITH (6–7.4) / WAIT (4.5–5.9) / NOT_WORTH_IT (<4.5).',
    ],
  },
  {
    id: 'seo-planner',
    label: '2.4 SEO Planner',
    subtitle: 'AI — مخطط SEO',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'seo-planner',
    icon: 'ti-search',
    trigger: 'بعد verdict-engine',
    costHint: '~$0.008/استدعاء',
    failureBehavior: 'يستخدم خطة SEO افتراضية',
    details: [
      'يُخطط استراتيجية الكلمات المفتاحية لكل منتج.',
      'يُحدد الاستهداف السعودي والعربي.',
      'يُنشئ هيكل المحتوى وعناوين H1–H4 المقترحة.',
    ],
  },
  {
    id: 'content-writer',
    label: '2.5 Content Writer',
    subtitle: 'AI — كاتب المحتوى',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'content-writer',
    icon: 'ti-pencil',
    trigger: 'بعد seo-planner',
    costHint: '~$0.45/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف المنتج',
    details: [
      'يكتب مراجعة المنتج الكاملة بالعربية والإنجليزية.',
      'يُنتج محتوى SEO مُحسّن قابل للنشر مباشرة.',
      'يتضمن: ملخص الحكم، المقارنة، نصائح الشراء، السعر بالريال.',
    ],
  },
  {
    id: 'schema-builder',
    label: '2.6 Schema Builder',
    subtitle: 'System — بناء السكيما',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'system',
    icon: 'ti-code',
    trigger: 'بعد content-writer',
    failureBehavior: 'يتخطى السكيما ويكمل',
    details: [
      'يبني structured data (JSON-LD) للمنتج: Price, Rating, Availability.',
      'يُدرج السكيما تلقائياً في صفحة المنتج.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'seo-auditor',
    label: '2.7 SEO Auditor',
    subtitle: 'AI — مدقق SEO',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'ai',
    configAgentName: 'seo-auditor',
    icon: 'ti-checkup',
    trigger: 'بعد schema-builder',
    costHint: '~$0.008/استدعاء',
    failureBehavior: 'يُنبه المسؤول ولا يوقف المسار (max 2 retry)',
    details: [
      'يراجع المحتوى الجاهز ويقترح تحسينات SEO نهائية.',
      'يتحقق من: كثافة الكلمات المفتاحية، الـ metadata، الـ alt text، سرعة التحميل.',
      'يُعطي نقاط تحسين قابلة للتنفيذ قبل الاعتماد.',
    ],
  },
  {
    id: 'quality-guard',
    label: '2.8 Quality Guard',
    subtitle: 'AI Verify — حارس الجودة',
    phase: 'P2',
    phaseLabelAr: 'P2 — إنتاج المحتوى',
    type: 'verify',
    configAgentName: 'quality-guard',
    icon: 'ti-shield-check',
    trigger: 'بعد seo-auditor',
    costHint: '~$0.010/استدعاء',
    failureBehavior: 'يحول للمراجعة اليدوية',
    details: [
      'يتحقق من جودة المحتوى النهائي قبل النشر.',
      'يُفحص: الدقة، الاتساق، وضوح العربية،Links سليمة.',
      'يعتمد أو يُعيد المحتوى مع ملاحظات.',
    ],
  },

  // ── Verify 2 — Auto Quality Checks ─────────────────────────────────
  {
    id: 'verify-quality',
    label: 'Verify 2 — Auto Quality',
    subtitle: 'AI Verify — الفحص الآلي',
    phase: 'Verify2',
    phaseLabelAr: '✓ التحقق ٢ — الجودة',
    type: 'verify',
    icon: 'ti-shield-check',
    trigger: 'بعد quality-guard',
    costHint: '~$0.003/استدعاء',
    failureBehavior: 'يحول للمراجعة البشرية',
    details: [
      'يتحقق: درجة SEO ≥ 85.',
      'يتحقق: QualityGuard = PASS.',
      'يتحقق: الحكم من verdict-engine صالح.',
    ],
  },

  // ── Gate 1 — Website Approval ───────────────────────────────────────
  {
    id: 'website-approval',
    label: 'Gate 1 — Website Approval',
    subtitle: 'Human — موافقة الموقع',
    phase: 'Gate1',
    phaseLabelAr: '⛩ البوابة ١ — موافقة الموقع',
    type: 'manual',
    icon: 'ti-user-check',
    trigger: 'بعد Verify 2',
    failureBehavior: 'لا يكمل إلا بعد موافقة بشرية',
    details: [
      'مراجعة بشرية للمحتوى قبل نشره على الموقع.',
      'تتيح تعديل الأخطاء والملاحظات.',
      'خطوة إلزامية حسب الإعدادات.',
    ],
  },

  // ── P3 — Website Publishing ────────────────────────────────────────
  {
    id: 'db-commit',
    label: 'DB Commit',
    subtitle: 'System — حفظ قاعدة البيانات',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-database',
    trigger: 'بعد website-approval',
    failureBehavior: 'يوقف المسار كلياً ويبلغ المسؤول',
    details: [
      'يُنشئ/يُحدّث سجل المنتج في قاعدة البيانات.',
      'يُسجّل الحكم والبيانات الوصفية.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'sitemap-regen',
    label: 'Sitemap Regen',
    subtitle: 'System — تجديد الخريطة',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-sitemap',
    trigger: 'بعد db-commit',
    failureBehavior: 'يتخطى ويعيد في المحاولة التالية',
    details: [
      'يُحدّث sitemap الموقع تلقائياً.',
      'يُضيف الصفحة الجديدة للمنتج.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'cache-purge',
    label: 'Cache Purge',
    subtitle: 'System/Placeholder — مسح الكاش',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-refresh',
    trigger: 'بعد sitemap-regen',
    failureBehavior: 'يتخطى (placeholder)',
    details: [
      'يمسح CDN cache لضمان ظهور المحتوى الجديد.',
      'placeholder —尚未 реализован.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'gsc-indexing',
    label: 'GSC Indexing',
    subtitle: 'System — فهرسة GSC',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-world',
    trigger: 'بعد cache-purge',
    failureBehavior: 'يتخطى ويعيد في المحاولة التالية',
    details: [
      'يُرسل إشارات الصفحات الجديدة إلى Google Search Console.',
      'يُطلب فهرسة الصفحة والمنافذ ذات الصلة.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'indexnow-ping',
    label: 'IndexNow Ping',
    subtitle: 'System — IndexNow',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-bolt',
    trigger: 'بعد gsc-indexing',
    failureBehavior: 'يتخطى (غير حرج)',
    details: [
      'يُطلق IndexNow لإخطار محركات البحث فورياً.',
      'يدعم Bing وYandex和其他.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'trigger-social',
    label: 'Trigger P4',
    subtitle: 'System — تشغيل السوشيال',
    phase: 'P3',
    phaseLabelAr: 'P3 — نشر الموقع',
    type: 'system',
    icon: 'ti-share',
    trigger: 'بعد indexnow-ping',
    failureBehavior: 'يُنبه المسؤول يدوياً',
    details: [
      'يُطلق مرحلة P4 (Social Adaptation) تلقائياً.',
      'يُرسل بيانات الحكم والبطاقة البصرية إلى P4.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },

  // ── Verify 3 — Live Page Health ────────────────────────────────────
  {
    id: 'verify-live-page',
    label: 'Verify 3 — Live Page Health',
    subtitle: 'AI Verify — صحة الصفحة',
    phase: 'Verify3',
    phaseLabelAr: '✓ التحقق ٣ — صحة الصفحة',
    type: 'verify',
    icon: 'ti-shield-check',
    trigger: 'بعد trigger-social',
    costHint: '~$0.005/استدعاء',
    failureBehavior: 'يُنبه المسؤول ولا يوقف المسار',
    details: [
      'يتحقق: الصفحة ترد بـ HTTP 200.',
      'يتحقق: Schema markup صالح.',
      'يتحقق: الصفحة مفهرسة في Google.',
    ],
  },

  // ── P4 — Social Adaptation ─────────────────────────────────────────
  {
    id: 'social-strategy',
    label: 'Format Strategy',
    subtitle: 'System/AI — استراتيجية المحتوى',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'ai',
    icon: 'ti-strategy',
    trigger: 'بعد trigger-social',
    costHint: '~$0.003/استدعاء',
    failureBehavior: 'يستخدم استراتيجية افتراضية',
    details: [
      'يحدد أفضل تنسيق تغريدة لكل منتج (مقارنة، نصيحة، حكم).',
      'يُحدد عدد التغريدات والوقت المثالي.',
      'يتخذ قرار AR vs EN أولوية.',
    ],
  },
  {
    id: 'tweet-crafter-ar',
    label: 'Tweet Writer AR',
    subtitle: 'AI — كاتب التغريدات عربي',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'ai',
    configAgentName: 'tweet-crafter',
    icon: 'ti-brand-twitter',
    trigger: 'بعد social-strategy',
    costHint: '~$0.010/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف',
    details: [
      'يكتب تغريدة جذابة بالعربية عن المنتج.',
      'يتضمن: الحكم، السعر بالريال، رابط المنتج.',
      'يُراعي أسلوب السوشيال السعودي.',
    ],
  },
  {
    id: 'tweet-crafter-en',
    label: 'Tweet Writer EN',
    subtitle: 'AI — كاتب التغريدات إنجليزي',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'ai',
    configAgentName: 'tweet-crafter',
    icon: 'ti-brand-twitter',
    trigger: 'بعد tweet-crafter-ar',
    costHint: '~$0.010/استدعاء',
    failureBehavior: 'يعيد المحاولة مرتين ثم يوقف',
    details: [
      'يكتب تغريدة بالإنجليزية عن المنتج.',
      'محتوى مختلف عن النسخة العربية (ليس مجرد ترجمة).',
      'يستهدف جمهوراً عالميأ.',
    ],
  },
  {
    id: 'visual-maker',
    label: 'Visual Generator',
    subtitle: 'System — بطاقة الحكم البصرية',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'system',
    icon: 'ti-photo',
    trigger: 'بعد tweet-crafter-en',
    failureBehavior: 'ينشر بدون بطاقة بصرية',
    details: [
      'يُنشئ بطاقة بصرية (card) لعرض الحكم.',
      'يتضمن: درجة الحكم، اللون، أيقونة/صورة المنتج.',
      'يُستخدم في التغريدات.',
    ],
  },
  {
    id: 'hashtag-miner',
    label: 'Hashtag Optimizer',
    subtitle: 'AI — مُحسّن الهاشتاقات',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'ai',
    configAgentName: 'hashtag-miner',
    icon: 'ti-hash',
    trigger: 'بعد visual-maker',
    costHint: '~$0.003/استدعاء',
    failureBehavior: 'يستخدم هاشتاقات افتراضية',
    details: [
      'يقترح هاشتاقات مناسبة لكل تغريدة.',
      'يستخدم هاشتاقات سعودية وعربية وعالمية.',
      'يُراعي الأداء والبحث.',
    ],
  },
  {
    id: 'social-guard',
    label: 'SocialGuard Compliance',
    subtitle: 'AI Verify — فحص السوشيال',
    phase: 'P4',
    phaseLabelAr: 'P4 — التكيف السوشيال',
    type: 'verify',
    configAgentName: 'social-guard',
    icon: 'ti-shield-lock',
    trigger: 'بعد hashtag-miner',
    costHint: '~$0.006/استدعاء',
    failureBehavior: 'يحول للمراجعة اليدوية',
    details: [
      'يتحقق من سلامة التغريدات قبل النشر.',
      'يفحص: لا ادعاءات طبية، الإفصاح موجود، لا مخالفات منصة.',
      'يعتمد أو يقترح تعديلات.',
    ],
  },

  // ── Verify 4 — SocialGuard Compliance ───────────────────────────────
  {
    id: 'verify-social',
    label: 'Verify 4 — Social Compliance',
    subtitle: 'AI Verify — مطابقة السوشيال',
    phase: 'Verify4',
    phaseLabelAr: '✓ التحقق ٤ — مطابقة السوشيال',
    type: 'verify',
    icon: 'ti-shield-check',
    trigger: 'بعد social-guard',
    costHint: '~$0.003/استدعاء',
    failureBehavior: 'يحول للمراجعة اليدوية',
    details: [
      'يتحقق: لا ادعاءات طبية كاذبة.',
      'يتحقق: Disclosure (partnership) موجود.',
      'يتحقق: لا مخالفات لسياسات X/Twitter.',
    ],
  },

  // ── Gate 2 — Social Approval ────────────────────────────────────────
  {
    id: 'social-approval',
    label: 'Gate 2 — Social Approval',
    subtitle: 'Human — موافقة السوشيال',
    phase: 'Gate2',
    phaseLabelAr: '⛩ البوابة ٢ — موافقة السوشيال',
    type: 'manual',
    icon: 'ti-user-check',
    trigger: 'بعد Verify 4',
    failureBehavior: 'اختياري — يكمل تلقائياً إذا لم يرد المراجع',
    details: [
      'مراجعة بشرية للتغريدات قبل نشرها.',
      'تتيح تعديل النص أو الهاشتاقات.',
      'خطوة اختيارية حسب الإعدادات.',
    ],
  },

  // ── P5 — Twitter/X Publish ──────────────────────────────────────────
  {
    id: 'twitter-publish',
    label: 'Twitter/X Publish',
    subtitle: 'System — نشر التغريدات',
    phase: 'P5',
    phaseLabelAr: 'P5 — نشر X/Twitter',
    type: 'system',
    icon: 'ti-brand-twitter-filled',
    trigger: 'بعد social-approval',
    failureBehavior: 'يُنبه المسؤول ولا يكرر تلقائياً',
    details: [
      'ينشر التغريدات على حساب X/Twitter.',
      'يُرفق بطاقة الحكم البصرية.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'analytics-save',
    label: 'Save Analytics ID',
    subtitle: 'System — حفظ معرف التحليلات',
    phase: 'P5',
    phaseLabelAr: 'P5 — نشر X/Twitter',
    type: 'system',
    icon: 'ti-chart-line',
    trigger: 'بعد twitter-publish',
    failureBehavior: 'يتخطى',
    details: [
      'يحفظ معرف التغريدة (tweet ID) في قاعدة البيانات.',
      'يربط التغريدة بالمنتج للمتابعة.',
      'لا يحتاج إعدادات نموذج.',
    ],
  },
  {
    id: 'schedule-reshare',
    label: 'Schedule Reshare +8h',
    subtitle: 'System — إعادة النشر المجدولة',
    phase: 'P5',
    phaseLabelAr: 'P5 — نشر X/Twitter',
    type: 'system',
    icon: 'ti-clock',
    trigger: 'بعد analytics-save',
    failureBehavior: 'يتخطى (لا يمنع اكتمال المسار)',
    details: [
      'يجدول إعادة نشر التغريدة بعد 8 ساعات.',
      'يُضاعف الوصول العضوي.',
      'placeholder —尚未 реализован.',
    ],
  },
];

// ── Circuit Breakers (side rail, not in main path) ───────────────────

interface CircuitBreaker {
  id: string;
  label: string;
  subtitle: string;
  icon: string;
  details: string[];
}

const CIRCUIT_BREAKERS: CircuitBreaker[] = [
  {
    id: 'cost-cap',
    label: 'Daily Cost Cap',
    subtitle: 'تكلفة يومية > $5',
    icon: 'ti-coin',
    details: [
      'يوقف P1 (اكتشاف ترندات جديد) عند تجاوز $5 يومياً.',
      'لا يؤثر على المهام قيد التنفيذ.',
      'يعود تلقائياً في اليوم التالي.',
    ],
  },
  {
    id: 'fail-streak',
    label: 'Fail Streak Guard',
    subtitle: '3 فشل محتوى يوقف P2',
    icon: 'ti-alert-triangle',
    details: [
      'يوقف P2 (إنتاج المحتوى) عند 3 فشل متتالي لنفس المنتج.',
      'يُنبه المسؤول للمراجعة.',
      'يتطلب مسح يدوي للاستمرار.',
    ],
  },
  {
    id: 'rate-limit',
    label: 'Twitter Rate Limit',
    subtitle: 'معدل نشر يتجاوز الحد',
    icon: 'ti-ban',
    details: [
      'يوقف P5 (نشر السوشيال) و P4 (تكييف السوشيال) عند تجاوز Rate Limit.',
      'يتعافى تلقائياً عند انخفاض الاستخدام.',
      'يُنبه المسؤول عند التفعيل.',
    ],
  },
];

const PHASE_ORDER: PhaseLabel[] = [
  'P1',
  'Verify1',
  'P2',
  'Verify2',
  'Gate1',
  'P3',
  'Verify3',
  'P4',
  'Verify4',
  'Gate2',
  'P5',
];

const NODE_TYPE_STYLE: Record<
  NodeType,
  { bg: string; border: string; badge: string; badgeIcon: string }
> = {
  ai: {
    bg: 'bg-sage/5',
    border: 'border-sage/30',
    badge: 'bg-sage/10 text-sage',
    badgeIcon: 'ti-robot',
  },
  verify: {
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-700',
    badgeIcon: 'ti-shield-check',
  },
  manual: {
    bg: 'bg-terracotta/5',
    border: 'border-terracotta/30',
    badge: 'bg-terracotta/10 text-terracotta',
    badgeIcon: 'ti-user',
  },
  system: {
    bg: 'bg-linen',
    border: 'border-beige',
    badge: 'bg-beige text-stone',
    badgeIcon: 'ti-settings',
  },
  breaker: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-700',
    badgeIcon: 'ti-bolt',
  },
};

const TIER_BADGE: Record<string, string> = {
  premium: 'bg-terracotta/10 text-terracotta',
  fast: 'bg-sage/10 text-sage',
  budget: 'bg-lavender/10 text-lavender-text',
};

const TIER_LABEL: Record<string, string> = {
  premium: 'متميز',
  fast: 'سريع',
  budget: 'اقتصادي',
};

const PERIODS = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
] as const;

/* ------------------------------------------------------------------ */
/* Tab button                                                            */
/* ------------------------------------------------------------------ */

function Tab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-white text-charcoal shadow-sm border border-beige'
          : 'text-stone hover:text-charcoal hover:bg-white/60'
      }`}
    >
      <span className={`ti ${icon} text-base ${active ? 'text-sage' : 'text-stone'}`} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Agents Tab — Full Pipeline Map                                        */
/* ------------------------------------------------------------------ */

function AgentsTab() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<AgentConfig>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveResult, setSaveResult] = useState<Record<string, 'ok' | 'error'>>({});

  const fetchSettings = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/settings/agents`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: SettingsData = await res.json();
      setData(json);
      setLocalEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const getEffective = (agentName: string): AgentConfig | undefined => {
    const base = data?.configs.find((c) => c.agentName === agentName);
    if (!base) return undefined;
    return { ...base, ...(localEdits[agentName] ?? {}) };
  };

  const applyEdit = (agentName: string, patch: Partial<AgentConfig>) => {
    setLocalEdits((prev) => ({ ...prev, [agentName]: { ...(prev[agentName] ?? {}), ...patch } }));
  };

  const handleSave = async (agentName: string) => {
    const edits = localEdits[agentName];
    if (!edits || Object.keys(edits).length === 0) return;
    setSaving((prev) => ({ ...prev, [agentName]: true }));
    setSaveResult((prev) => { const n = { ...prev }; delete n[agentName]; return n; });
    try {
      const res = await adminFetch(`${API_BASE}/admin/settings/agents/${agentName}`, {
        method: 'PATCH',
        body: JSON.stringify(edits),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: AgentConfig = await res.json();
      setData((prev) =>
        prev
          ? { ...prev, configs: prev.configs.map((c) => (c.agentName === agentName ? updated : c)) }
          : prev,
      );
      setLocalEdits((prev) => { const n = { ...prev }; delete n[agentName]; return n; });
      setSaveResult((prev) => ({ ...prev, [agentName]: 'ok' }));
      setTimeout(() => {
        setSaveResult((prev) => { const n = { ...prev }; delete n[agentName]; return n; });
      }, 2000);
    } catch {
      setSaveResult((prev) => ({ ...prev, [agentName]: 'error' }));
    } finally {
      setSaving((prev) => { const n = { ...prev }; delete n[agentName]; return n; });
    }
  };

  const costEstimate = (modelId: string, maxTokens: number): string => {
    const model = data?.models.find((m) => m.id === modelId);
    if (!model) return '—';
    const total = (500 / 1000) * model.costInput + (maxTokens / 1000) * model.costOutput;
    return `~$${total.toFixed(5)}/استدعاء`;
  };

  const hasEdits = (agentName: string) => {
    const e = localEdits[agentName];
    return e && Object.keys(e).length > 0;
  };

  const [selectedNodeId, setSelectedNodeId] = useState<string>('verdict-engine');

  const selectedNode = PIPELINE_NODES.find((n) => n.id === selectedNodeId);
  const selectedConfig = selectedNode?.configAgentName
    ? getEffective(selectedNode.configAgentName)
    : undefined;
  const selectedModel = selectedConfig
    ? data?.models.find((m) => m.id === selectedConfig.model)
    : undefined;
  const selectedIsDirty = selectedNode?.configAgentName
    ? hasEdits(selectedNode.configAgentName)
    : false;
  const selectedIsSaving = selectedNode?.configAgentName
    ? saving[selectedNode.configAgentName]
    : false;
  const selectedResult = selectedNode?.configAgentName
    ? saveResult[selectedNode.configAgentName]
    : undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-stone">جارٍ التحميل...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <span className="ti ti-alert-circle text-3xl text-terracotta" />
        <p className="text-sm text-stone">{error ?? 'خطأ في التحميل'}</p>
        <button onClick={fetchSettings} className="text-xs text-sage hover:text-charcoal underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const nodeStyle = (node: PipelineNode, isSelected: boolean) => {
    const s = NODE_TYPE_STYLE[node.type];
    return {
      card: `flex flex-col items-center gap-1.5 rounded-xl border p-3 min-w-[120px] text-center cursor-pointer transition-all relative ${s.bg} ${s.border} ${isSelected ? 'ring-2 ring-sage shadow-md' : 'hover:shadow-sm'}`,
      badge: `inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${s.badge}`,
    };
  };

  const nodesByPhase = PHASE_ORDER.reduce<Record<PhaseLabel, PipelineNode[]>>((acc, phase) => {
    acc[phase] = PIPELINE_NODES.filter((n) => n.phase === phase);
    return acc;
  }, {} as Record<PhaseLabel, PipelineNode[]>);

  const renderArrow = (dir: 'rtl' | 'ltr' = 'rtl') => (
    <div className={`flex items-center ${dir === 'rtl' ? 'flex-row-reverse' : 'flex-row'} text-beige/60 shrink-0`}>
      <div className="h-px w-3 bg-current" />
      <span className={`ti ti-chevron-${dir === 'rtl' ? 'left' : 'right'} text-xs`} />
    </div>
  );

  const typeLabel = (type: NodeType) => {
    switch (type) {
      case 'ai': return 'AI';
      case 'verify': return 'AI Verify';
      case 'manual': return 'بشري';
      case 'system': return 'نظام';
      case 'breaker': return 'Circuit';
    }
  };

  // ── Global step numbering ──────────────────────────────────────────────
  const globalStepMap = (() => {
    const map: Record<string, number> = {};
    let step = 1;
    for (const phase of PHASE_ORDER) {
      const nodes = PIPELINE_NODES.filter((n) => n.phase === phase);
      for (const node of nodes) {
        map[node.id] = step++;
      }
    }
    return map;
  })();

  const phaseTagClass = (phase: PhaseLabel) => {
    if (phase.startsWith('Verify')) return 'bg-teal-50 text-teal-700 border border-teal-200';
    if (phase.startsWith('Gate')) return 'bg-terracotta/10 text-terracotta border border-terracotta/20';
    return 'bg-sage/10 text-sage border border-sage/20';
  };

  // Phase lane metadata
  const phaseLaneMeta: Record<PhaseLabel, { label: string; count: number }> = {} as any;
  for (const phase of PHASE_ORDER) {
    const nodes = PIPELINE_NODES.filter((n) => n.phase === phase);
    phaseLaneMeta[phase] = {
      label: nodes[0]?.phaseLabelAr ?? phase,
      count: nodes.length,
    };
  }

  // Node type legend
  const LEGEND_ITEMS: { type: NodeType; label: string; bg: string; border: string }[] = [
    { type: 'ai', label: 'AI', bg: 'bg-sage/5', border: 'border-sage/30' },
    { type: 'verify', label: 'AI Verify', bg: 'bg-teal-50', border: 'border-teal-200' },
    { type: 'manual', label: 'بشري', bg: 'bg-terracotta/5', border: 'border-terracotta/30' },
    { type: 'system', label: 'نظام', bg: 'bg-linen', border: 'border-beige' },
    { type: 'breaker', label: 'Circuit', bg: 'bg-red-50', border: 'border-red-200' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-sm font-medium text-charcoal">تسلسل البايبلاين</h2>
        <p className="text-xs text-stone mt-1">
          اضغط على أي خطوة لعرض تفاصيلها وإعداداتها.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.type} className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full border ${item.bg} ${item.border}`}>
            <span className={`ti ${NODE_TYPE_STYLE[item.type].badgeIcon} text-[9px]`} />
            <span className="text-stone">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Pipeline Graph */}
        <div className="flex-1 min-w-0">
          <div className="bg-white/70 border border-beige rounded-2xl p-4">
            {/* Swimlane rows — tighter spacing */}
            <div className="min-w-[900px] space-y-2">
              {PHASE_ORDER.map((phase, phaseIdx) => {
                const phaseNodes = nodesByPhase[phase];
                if (!phaseNodes.length) return null;
                const isVerify = phase.startsWith('Verify');
                const isGate = phase.startsWith('Gate');
                const meta = phaseLaneMeta[phase];

                return (
                  <div key={phase}>
                    {/* Phase swimlane card */}
                    <div className="bg-white/80 border border-beige rounded-xl p-3">
                      <div className="flex items-stretch gap-3">
                        {/* Nodes row — scrollable, flows RTL (left in visual RTL, right in DOM order) */}
                        <div className="flex-1 overflow-x-auto pb-1">
                          <div className="min-w-max flex items-center gap-2" style={{ direction: 'rtl' }}>
                            {phaseNodes.map((node, nodeIdx) => {
                              const isSelected = node.id === selectedNodeId;
                              const cfg = node.configAgentName ? getEffective(node.configAgentName) : undefined;
                              const model = cfg && data.models.find((m) => m.id === cfg.model);
                              const s = NODE_TYPE_STYLE[node.type];
                              const stepNum = globalStepMap[node.id];

                              return (
                                <div key={node.id} className="flex items-center gap-2 shrink-0">
                                  {/* Node card */}
                                  <div
                                    onClick={() => setSelectedNodeId(node.id)}
                                    className={`relative flex flex-col items-center gap-1 rounded-xl border p-2.5 cursor-pointer transition-all select-none ${s.bg} ${s.border} ${isSelected ? 'ring-2 ring-sage' : 'hover:shadow-sm'} w-[136px]`}
                                  >
                                    {/* Step number + type badge row */}
                                    <div className="flex items-center justify-between w-full gap-1">
                                      {/* Step number */}
                                      <span className="text-[9px] font-medium text-stone/50">#{stepNum}</span>
                                      {/* Type badge */}
                                      <span className={`inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full ${s.badge}`}>
                                        <span className={`ti ${s.badgeIcon} text-[8px]`} />
                                        {typeLabel(node.type)}
                                      </span>
                                    </div>

                                    {/* Icon */}
                                    <span className={`ti ${node.icon} text-lg mt-0.5 ${
                                      node.type === 'ai' || node.type === 'verify'
                                        ? 'text-sage'
                                        : node.type === 'manual'
                                        ? 'text-terracotta'
                                        : 'text-stone'
                                    }`} />

                                    {/* Label */}
                                    <p className="text-[10px] font-medium text-charcoal leading-tight text-center">{node.label}</p>

                                    {/* Subtitle */}
                                    <p className="text-[8px] text-stone leading-tight text-center">{node.subtitle}</p>

                                    {/* Model + enabled indicator */}
                                    {model && (
                                      <span className={`text-[8px] px-1 py-0.5 rounded-full ${TIER_BADGE[model.tier] ?? 'bg-beige text-stone'}`}>
                                        {model.name.split(' ').slice(0, 2).join(' ')}
                                      </span>
                                    )}
                                    {node.configAgentName && (
                                      <div className={`w-1.5 h-1.5 rounded-full ${cfg?.enabled !== false ? 'bg-sage' : 'bg-stone/40'}`} />
                                    )}

                                    {/* Selected ring */}
                                    {isSelected && (
                                      <div className="absolute inset-0 rounded-xl ring-2 ring-sage pointer-events-none" />
                                    )}
                                  </div>

                                  {/* Arrow between nodes — points left (RTL) */}
                                  {nodeIdx < phaseNodes.length - 1 && (
                                    <div className="text-beige/50 shrink-0">
                                      <span className="ti ti-arrow-left text-sm" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Phase label — right side (far right in RTL layout) */}
                        <div className="flex flex-col items-end justify-center gap-0.5 shrink-0 w-40 border-r border-beige/60 pr-3">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${phaseTagClass(phase)}`}>
                            {meta.label}
                          </span>
                          <span className="text-[9px] text-stone">
                            {isVerify ? 'فحص آلي' : isGate ? 'بوابة بشرية' : `${meta.count} خطوات`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Vertical connector to next phase */}
                    {phaseIdx < PHASE_ORDER.length - 1 && (
                      <div className="flex items-center justify-end gap-2 py-1">
                        <div className="flex flex-col items-center">
                          <div className="h-3 w-px bg-beige/50" />
                          <span className="ti ti-arrow-down text-beige/50 text-[10px]" />
                        </div>
                        <span className="text-[9px] text-stone/50">ينتقل إلى</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Circuit Breakers */}
          <div className="mt-3 bg-red-50/70 rounded-xl border border-red-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="ti ti-bolt text-red-400 text-sm" />
              <h3 className="text-xs font-medium text-red-700">حماية تلقائية</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CIRCUIT_BREAKERS.map((br) => {
                const s = NODE_TYPE_STYLE['breaker'];
                return (
                  <div
                    key={br.id}
                    onClick={() => setSelectedNodeId(br.id)}
                    className={`flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm ${s.bg} ${s.border}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`ti ${br.icon} text-red-400 text-sm`} />
                      <p className="text-xs font-medium text-red-700">{br.label}</p>
                    </div>
                    <p className="text-[10px] text-red-600/80">{br.subtitle}</p>
                    <ul className="space-y-0.5">
                      {br.details.map((d, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-red-600/80">
                          <span className="ti ti-check text-[9px] mt-0.5 shrink-0" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="w-full lg:w-80 shrink-0">
          {!selectedNode ? (
            <div className="bg-white rounded-xl border border-beige p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <span className="ti ti-click text-3xl text-beige mb-3" />
              <p className="text-sm text-stone">اختر خطوة من الخريطة لعرض تفاصيلها</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-beige p-5 space-y-4">
              {/* Node header */}
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  selectedNode.type === 'ai' || selectedNode.type === 'verify'
                    ? 'bg-sage/10'
                    : selectedNode.type === 'manual'
                    ? 'bg-terracotta/10'
                    : selectedNode.type === 'breaker'
                    ? 'bg-red-50'
                    : 'bg-linen'
                }`}>
                  <span className={`ti ${selectedNode.icon} text-lg ${
                    selectedNode.type === 'ai' || selectedNode.type === 'verify'
                      ? 'text-sage'
                      : selectedNode.type === 'manual'
                      ? 'text-terracotta'
                      : selectedNode.type === 'breaker'
                      ? 'text-red-500'
                      : 'text-stone'
                  }`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal">{selectedNode.label}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${NODE_TYPE_STYLE[selectedNode.type].badge}`}>
                      <span className={`ti ${NODE_TYPE_STYLE[selectedNode.type].badgeIcon} text-[9px]`} />
                      {typeLabel(selectedNode.type)}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${phaseTagClass(selectedNode.phase)}`}>
                      {selectedNode.phaseLabelAr}
                    </span>
                  </div>
                </div>
              </div>

              {/* Metadata row */}
              {(selectedNode.trigger || selectedNode.costHint) && (
                <div className="flex flex-wrap gap-2">
                  {selectedNode.trigger && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-linen border border-beige text-stone">
                      <span className="ti ti-clock text-[9px]" />
                      {selectedNode.trigger}
                    </span>
                  )}
                  {selectedNode.costHint && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-linen border border-beige text-stone">
                      <span className="ti ti-coin text-[9px]" />
                      {selectedNode.costHint}
                    </span>
                  )}
                </div>
              )}

              {/* Failure behaviour */}
              {selectedNode.failureBehavior && (
                <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                  <p className="text-[10px] font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                    <span className="ti ti-alert-triangle text-[9px]" />
                    سلوك الفشل
                  </p>
                  <p className="text-[11px] text-amber-800">{selectedNode.failureBehavior}</p>
                </div>
              )}

              {/* Description bullets */}
              <div>
                <p className="text-xs font-medium text-charcoal mb-2">ماذا يفعل؟</p>
                <ul className="space-y-1.5">
                  {selectedNode.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-stone">
                      <span className="ti ti-check text-sage text-[10px] mt-0.5 shrink-0" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Config panel for AI/system nodes with config */}
              {selectedNode.configAgentName && selectedConfig ? (
                <div className="space-y-4 pt-2 border-t border-beige">
                  <p className="text-xs font-medium text-charcoal">إعدادات النموذج</p>

                  {/* Enabled toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-stone">مفعّل</label>
                    <button
                      onClick={() => selectedNode.configAgentName && applyEdit(selectedNode.configAgentName, { enabled: !selectedConfig.enabled })}
                      className={`relative w-10 h-5 rounded-full transition-colors ${selectedConfig.enabled ? 'bg-sage' : 'bg-stone/30'} cursor-pointer`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${selectedConfig.enabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {/* Model dropdown */}
                  <div>
                    <label className="block text-xs text-stone mb-1.5">النموذج</label>
                    <select
                      value={selectedConfig.model}
                      onChange={(e) => selectedNode.configAgentName && applyEdit(selectedNode.configAgentName, { model: e.target.value })}
                      className="w-full text-sm bg-cream border border-beige rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-sage/50"
                    >
                      {data.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.provider}) — {TIER_LABEL[m.tier] ?? m.tier}
                        </option>
                      ))}
                    </select>
                    {selectedModel && (
                      <p className="text-[11px] text-stone mt-1">
                        {costEstimate(selectedConfig.model, selectedConfig.maxTokens)}
                        {' • '}
                        <span className={`inline-block px-1 py-0.5 rounded-full text-[10px] ${TIER_BADGE[selectedModel.tier]}`}>
                          {TIER_LABEL[selectedModel.tier]}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Temperature */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-stone">الحرارة</label>
                      <span className="text-xs font-medium text-charcoal tabular-nums">{selectedConfig.temperature.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0} max={1} step={0.1}
                      value={selectedConfig.temperature}
                      onChange={(e) => selectedNode.configAgentName && applyEdit(selectedNode.configAgentName, { temperature: parseFloat(e.target.value) })}
                      className="w-full accent-sage"
                    />
                    <div className="flex justify-between text-[10px] text-stone mt-0.5">
                      <span>دقيق</span>
                      <span>إبداعي</span>
                    </div>
                  </div>

                  {/* Max tokens */}
                  <div>
                    <label className="block text-xs text-stone mb-1.5">الحد الأقصى للتوكنز</label>
                    <input
                      type="number"
                      min={100} max={32000} step={100}
                      value={selectedConfig.maxTokens}
                      onChange={(e) => selectedNode.configAgentName && applyEdit(selectedNode.configAgentName, { maxTokens: parseInt(e.target.value, 10) })}
                      className="w-full text-sm bg-cream border border-beige rounded-lg px-3 py-2 text-charcoal focus:outline-none focus:ring-1 focus:ring-sage/50 tabular-nums"
                    />
                  </div>

                  {/* Last updated */}
                  {selectedConfig.updatedAt && (
                    <p className="text-[10px] text-stone">
                      آخر تحديث: {new Date(selectedConfig.updatedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}

                  {/* Save button */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-xs">
                      {selectedResult === 'ok' && (
                        <span className="text-sage flex items-center gap-1"><span className="ti ti-check" />حُفظ</span>
                      )}
                      {selectedResult === 'error' && (
                        <span className="text-terracotta flex items-center gap-1"><span className="ti ti-x" />خطأ في الحفظ</span>
                      )}
                    </div>
                    <button
                      onClick={() => selectedNode.configAgentName && handleSave(selectedNode.configAgentName)}
                      disabled={!selectedIsDirty || selectedIsSaving}
                      className={`flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg transition-colors ${
                        selectedIsDirty && !selectedIsSaving ? 'bg-sage text-cream hover:bg-sage/90' : 'bg-beige text-stone cursor-not-allowed'
                      }`}
                    >
                      {selectedIsSaving ? (
                        <><span className="ti ti-loader animate-spin text-sm" />جارٍ الحفظ...</>
                      ) : (
                        <><span className="ti ti-device-floppy text-sm" />حفظ</>
                      )}
                    </button>
                  </div>
                </div>
              ) : selectedNode.configAgentName && !selectedConfig ? (
                <div className="bg-linen rounded-lg border border-beige p-4 text-center">
                  <span className="ti ti-alert-circle text-xl text-stone mb-2 block" />
                  <p className="text-xs text-stone">لم يتم تفعيل إعدادات هذا الوكيل بعد</p>
                  <p className="text-[11px] text-stone/70 mt-1">الإعدادات الافتراضية تُستخدم تلقائياً</p>
                </div>
              ) : (
                <div className="bg-linen rounded-lg border border-beige p-4 text-center">
                  <span className="ti ti-info-circle text-xl text-stone mb-2 block" />
                  <p className="text-xs text-stone">
                    هذه خطوة {selectedNode.type === 'manual' ? 'بشرية' : selectedNode.type === 'breaker' ? 'حماية تلقائية' : 'نظامية'} ولا تملك إعدادات نموذج.
                  </p>
                  {selectedNode.trigger && (
                    <p className="text-[11px] text-stone/70 mt-1">
                      التشغيل: {selectedNode.trigger}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Costs Tab                                                             */
/* ------------------------------------------------------------------ */

function CostsTab() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'tokens' | 'costUsd' | 'jobCount'>('tokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchCosts = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/costs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCosts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load costs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCosts(); }, [fetchCosts]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const successRate = costs && costs.totalJobs > 0
    ? Math.round((costs.completedJobs / costs.totalJobs) * 100)
    : 0;

  const maxDayTokens = costs?.last7Days.length
    ? Math.max(...costs.last7Days.map((d) => d.tokens), 1)
    : 1;

  const sortedAgents = costs?.byAgent
    ? [...costs.byAgent].sort((a, b) => {
        const av = a[sortKey] ?? 0;
        const bv = b[sortKey] ?? 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">إجمالي التوكنز</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading ? '—' : (costs?.totalTokens ?? 0).toLocaleString('en-US')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">التكلفة الإجمالية</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading ? '—' : error ? 'خطأ' : `$${(costs?.totalCostUsd ?? 0).toFixed(6)}`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">نسبة النجاح</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading || !costs ? '—' : `${successRate}%`}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-linen overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${successRate}%`,
                backgroundColor: successRate >= 80 ? '#6B8E7F' : successRate >= 50 ? '#D4844A' : '#C0614B',
              }}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">المهام</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading ? '—' : (costs?.totalJobs ?? 0).toLocaleString('en-US')}
          </p>
        </div>
      </div>

      {/* 7-day trend */}
      <div className="bg-white rounded-xl border border-beige p-6">
        <h2 className="text-sm font-medium text-charcoal mb-4">استهلاك آخر 7 أيام</h2>
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="text-xs text-stone">جارٍ التحميل...</span>
          </div>
        ) : error ? (
          <div className="h-40 flex items-center justify-center">
            <span className="text-xs text-red-500">{error}</span>
          </div>
        ) : !costs?.last7Days.length ? (
          <div className="h-40 flex items-center justify-center">
            <span className="text-xs text-stone">لا توجد بيانات</span>
          </div>
        ) : (
          <div className="flex items-end gap-3 h-40">
            {costs.last7Days.map((day) => {
              const barHeight = Math.max((day.tokens / maxDayTokens) * 100, 4);
              const dayLabel = new Date(day.date).toLocaleDateString('en-US', {
                weekday: 'short', month: 'numeric', day: 'numeric',
              });
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-charcoal tabular-nums">{day.tokens.toLocaleString('en-US')}</span>
                  <div className="w-full h-full flex items-end">
                    <div className="w-full bg-sage/20 rounded-sm relative" style={{ height: '100%' }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-sage rounded-sm transition-all" style={{ height: `${barHeight}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-stone text-center leading-tight">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent breakdown table */}
      <div className="bg-white rounded-xl border border-beige p-6">
        <h2 className="text-sm font-medium text-charcoal mb-4">التفصيل حسب الوكيل</h2>
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">جارٍ التحميل...</span>
          </div>
        ) : error ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-red-500">{error}</span>
          </div>
        ) : !sortedAgents.length ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">لا توجد بيانات</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige">
                  <th className="text-right text-xs text-stone font-normal pb-3 pr-4">الوكيل</th>
                  {(['tokens', 'costUsd', 'jobCount'] as const).map((key) => (
                    <th
                      key={key}
                      className="text-left text-xs text-stone font-normal pb-3 px-4 cursor-pointer select-none hover:text-charcoal"
                      onClick={() => handleSort(key)}
                    >
                      {key === 'tokens' ? 'التوكنز' : key === 'costUsd' ? 'التكلفة' : 'عدد المهام'}
                      {sortKey === key && <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {sortedAgents.map((row) => (
                  <tr key={row.agentName} className="hover:bg-linen/50 transition-colors">
                    <td className="py-3.5 pr-4 font-medium text-charcoal">{row.agentName}</td>
                    <td className="py-3.5 px-4 tabular-nums text-charcoal">{row.tokens.toLocaleString('en-US')}</td>
                    <td className="py-3.5 px-4 tabular-nums text-charcoal">${row.costUsd.toFixed(6)}</td>
                    <td className="py-3.5 pl-4 tabular-nums text-charcoal">{row.jobCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={fetchCosts}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className="ti ti-refresh text-sm" />
          تحديث
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Affiliate Tab                                                         */
/* ------------------------------------------------------------------ */

function AffiliateTab() {
  const [days, setDays] = useState<number>(7);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (period: number) => {
    try {
      const [statsRes, topRes] = await Promise.all([
        adminFetch(`/affiliate/stats?days=${period}`),
        adminFetch(`/affiliate/top?limit=10`),
      ]);
      if (!statsRes.ok) throw new Error(`Stats: HTTP ${statsRes.status}`);
      if (!topRes.ok) throw new Error(`Top: HTTP ${topRes.status}`);
      const [statsData, topData] = await Promise.all([statsRes.json(), topRes.json()]);
      setStats(statsData);
      setTopProducts(Array.isArray(topData) ? topData : topData.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load affiliate data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(days); }, [fetchData, days]);

  const maxDailyClicks = stats?.daily?.length
    ? Math.max(...stats.daily.map((d) => d.clicks), 1)
    : 1;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-1 bg-linen rounded-lg p-1 w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setDays(p.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              days === p.value ? 'bg-white text-charcoal shadow-sm' : 'text-stone hover:text-charcoal'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
          <span className="ti ti-alert-circle text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => fetchData(days)} className="mr-auto text-xs text-red-600 hover:text-red-800 underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">إجمالي النقرات</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading ? '—' : (stats?.totalClicks ?? 0).toLocaleString('en-US')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-beige p-5">
          <p className="text-xs text-stone">أكثر المتاجر نقراً</p>
          <p className="text-xl font-medium text-charcoal mt-1 truncate">
            {loading ? '—' : stats?.byStore?.[0]?.store ?? '—'}
          </p>
          {!loading && stats?.byStore?.[0] && (
            <p className="text-xs text-stone mt-0.5 tabular-nums">
              {stats.byStore[0].clicks.toLocaleString('en-US')} نقرة
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-beige p-5 col-span-2 lg:col-span-1">
          <p className="text-xs text-stone">المتاجر النشطة</p>
          <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
            {loading ? '—' : (stats?.byStore?.length ?? 0)}
          </p>
        </div>
      </div>

      {/* Daily trend */}
      <div className="bg-white rounded-xl border border-beige p-6">
        <h2 className="text-sm font-medium text-charcoal mb-4">النقرات اليومية</h2>
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="text-xs text-stone">جارٍ التحميل...</span>
          </div>
        ) : !stats?.daily?.length ? (
          <div className="h-40 flex items-center justify-center">
            <span className="text-xs text-stone">لا توجد بيانات</span>
          </div>
        ) : (
          <div className="flex items-end gap-2 h-40">
            {stats.daily.map((day) => {
              const barHeight = Math.max((day.clicks / maxDailyClicks) * 100, 4);
              const dayLabel = new Date(day.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-xs text-charcoal tabular-nums">{day.clicks > 0 ? day.clicks : ''}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full h-full flex items-end relative" style={{ height: '120px' }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-sage/20 rounded-sm" style={{ height: '100%' }} />
                      <div className="absolute bottom-0 left-0 right-0 bg-sage rounded-sm transition-all" style={{ height: `${barHeight}%` }} />
                    </div>
                  </div>
                  <span className="text-xs text-stone text-center leading-tight">{dayLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* By-store table */}
      <div className="bg-white rounded-xl border border-beige p-6">
        <h2 className="text-sm font-medium text-charcoal mb-4">حسب المتجر</h2>
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">جارٍ التحميل...</span>
          </div>
        ) : !stats?.byStore?.length ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">لا توجد بيانات</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige">
                  <th className="text-right text-xs text-stone font-normal pb-3 pr-4">المتجر</th>
                  <th className="text-left text-xs text-stone font-normal pb-3 px-4">النقرات</th>
                  <th className="text-left text-xs text-stone font-normal pb-3 pl-4">آخر نقرة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {stats.byStore.map((row) => (
                  <tr key={row.store} className="hover:bg-linen/50 transition-colors">
                    <td className="py-3.5 pr-4 font-medium text-charcoal">{row.store}</td>
                    <td className="py-3.5 px-4 tabular-nums text-charcoal">{row.clicks.toLocaleString('en-US')}</td>
                    <td className="py-3.5 pl-4 text-stone text-xs">
                      {row.lastClick
                        ? new Date(row.lastClick).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top products table */}
      <div className="bg-white rounded-xl border border-beige p-6">
        <h2 className="text-sm font-medium text-charcoal mb-4">أكثر المنتجات نقراً</h2>
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">جارٍ التحميل...</span>
          </div>
        ) : !topProducts.length ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-xs text-stone">لا توجد بيانات</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-beige">
                  <th className="text-right text-xs text-stone font-normal pb-3 pr-4">#</th>
                  <th className="text-right text-xs text-stone font-normal pb-3 pr-4">المنتج</th>
                  <th className="text-left text-xs text-stone font-normal pb-3 px-4">المتجر</th>
                  <th className="text-left text-xs text-stone font-normal pb-3 pl-4">النقرات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige">
                {topProducts.map((product, idx) => (
                  <tr key={product.productId} className="hover:bg-linen/50 transition-colors">
                    <td className="py-3.5 pr-4 text-stone tabular-nums">{idx + 1}</td>
                    <td className="py-3.5 pr-4 font-medium text-charcoal max-w-xs truncate">
                      {product.productName ?? product.slug ?? product.productId}
                    </td>
                    <td className="py-3.5 px-4 text-stone text-xs">{product.store ?? '—'}</td>
                    <td className="py-3.5 pl-4 tabular-nums text-charcoal">{product.clicks.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => fetchData(days)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className="ti ti-refresh text-sm" />
          تحديث
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Settings Page                                                    */
/* ------------------------------------------------------------------ */

type ActiveTab = 'agents' | 'costs' | 'affiliate';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('agents');

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">الإعدادات</h1>
      </header>

      <div className="flex-1 px-6 py-6 overflow-auto">
        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-linen rounded-xl p-1 w-fit mb-6">
          <Tab
            active={activeTab === 'agents'}
            icon="ti-robot"
            label="الوكلاء"
            onClick={() => setActiveTab('agents')}
          />
          <Tab
            active={activeTab === 'costs'}
            icon="ti-coin"
            label="التكاليف"
            onClick={() => setActiveTab('costs')}
          />
          <Tab
            active={activeTab === 'affiliate'}
            icon="ti-link"
            label="الأفلييت"
            onClick={() => setActiveTab('affiliate')}
          />
        </div>

        {/* Tab content */}
        {activeTab === 'agents' && <AgentsTab />}
        {activeTab === 'costs' && <CostsTab />}
        {activeTab === 'affiliate' && <AffiliateTab />}
      </div>
    </div>
  );
}
