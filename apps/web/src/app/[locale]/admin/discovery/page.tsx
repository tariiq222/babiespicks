'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? '';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getStringField(record: JsonRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function getNumberField(record: JsonRecord | null, key: string): number | null {
  const value = record?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function getErrorCount(record: JsonRecord | null): number | null {
  const value = record?.errors;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return 1;
  return null;
}

function cronToSaudiTime(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 2) {
    const utcHour = parseInt(parts[1], 10);
    const saudiHour = (utcHour + 3) % 24;
    return `${String(saudiHour).padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
  }
  return '06:00';
}

function saudiTimeToCron(time: string): string {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return '0 6 * * *';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '0 6 * * *';
  const utcHour = ((h - 3) + 24) % 24;
  return `${String(m).padStart(2, '0')} ${utcHour} * * *`;
}

interface DiscoveryStats {
  totalProducts: number;
  activeProducts: number;
  totalVerdicts: number;
  trendSignals: number;
  discoveryRuns: number;
  recentRuns: Array<{
    id: string;
    name: string | null;
    status: string;
    createdAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    input: unknown;
    output: unknown;
    error: string | null;
    _count?: {
      steps?: number;
      events?: number;
      artifacts?: number;
    };
  }>;
  verdictBreakdown: Array<{ type: string; count: number }>;
}

interface DiscoveryConfig {
  amazonCron: string;
  noonCron: string;
  maxProducts: number;
  enabled: boolean;
  amazonNextRun: string | null;
  noonNextRun: string | null;
}

interface TrendSignal {
  id: string;
  source: string | null;
  rawTitle: string | null;
  normalizedTitle: string | null;
  canonicalUrl: string | null;
  trendScore: number | null;
  discoveryReason: string | null;
  status: string;
  createdAt: string | null;
  metadata: Record<string, unknown> | null;
}

interface ProductStore {
  id: string;
  name: string;
  slug: string;
  url: string | null;
  affiliateNetwork: string | null;
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

interface ProductPrice {
  price: number;
  originalPrice: number | null;
  currency: string;
  url: string | null;
  inStock: boolean | null;
  scrapedAt: string | null;
  store: ProductStore;
}

interface ProductVerdict {
  type: string;
  score: number | null;
  reasoningAr: string | null;
  reasoningEn: string | null;
  safetyScore: number | null;
  qualityScore: number | null;
  reviewsScore: number | null;
  priceScore: number | null;
  longTermScore: number | null;
  isPublished: boolean | null;
  createdAt: string | null;
}

interface ProductTranslation {
  locale: string;
  title: string | null;
  description: string | null;
}

interface ProductAgentJob {
  id: string;
  agentName: string;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
}

interface ProductReviewSummary {
  averageRating: number | null;
  totalReviews: number | null;
  sentimentScore: number | null;
  prosAr: string | null;
  prosEn: string | null;
  consAr: string | null;
  consEn: string | null;
  redFlags: string | null;
  analyzedAt: string | null;
}

interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  slug: string | null;
  brand: string | null;
  status: string;
  sourceUrl: string | null;
  dataSource: string | null;
  confidence: number | null;
  isActive: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  store: ProductStore | null;
  category: ProductCategory | null;
  verdict: ProductVerdict | null;
  reviewSummary: ProductReviewSummary | null;
  translations: ProductTranslation[];
  prices: ProductPrice[];
  agentJobs: ProductAgentJob[];
}

interface TriggerResult {
  runId: string;
  source: string;
  maxProducts: number;
  status: string;
}

type ToastType = 'success' | 'error';

export default function DiscoveryPage() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const saudiTimeHelpLabel = locale === 'ar' ? 'الوقت بصيغة 24 ساعة' : 'Time in 24-hour format';

  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [config, setConfig] = useState<DiscoveryConfig | null>(null);
  const [trendSignals, setTrendSignals] = useState<TrendSignal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<'all' | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'signals' | 'products'>('overview');
  const [amazonTime, setAmazonTime] = useState('');

  const showToast = useCallback((type: ToastType, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, configRes, signalsRes, productsRes] = await Promise.all([
        adminFetch(`${API_BASE}/admin/discovery/stats`),
        adminFetch(`${API_BASE}/admin/discovery/config`),
        adminFetch(`${API_BASE}/admin/discovery/trend-signals?limit=50`),
        adminFetch(`${API_BASE}/admin/discovery/products?limit=50`),
      ]);

      const [statsData, configData, signalsData, productsData] = await Promise.all([
        statsRes.json().catch(() => null),
        configRes.json().catch(() => null),
        signalsRes.json().catch(() => null),
        productsRes.json().catch(() => null),
      ]);

      if (!statsRes.ok) throw new Error('Failed to load data');
      setStats(statsData);
      setConfig(configData);
      setAmazonTime(cronToSaudiTime(configData?.amazonCron ?? '0 3 * * *'));
      setTrendSignals(signalsData?.items ?? []);
      setProducts(productsData?.items ?? []);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const handleTrigger = async (source: 'all') => {
    setTriggering(source);
    try {
      const res = await adminFetch(`${API_BASE}/admin/discovery/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, maxProducts: config?.maxProducts ?? 10 }),
      });
      await res.json().catch(() => null);
      if (!res.ok) throw new Error('Trigger failed');
      showToast('success', `${t('discoveryTriggered')} (${source})`);
      await fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Trigger failed');
    } finally {
      setTriggering(null);
    }
  };

  const handleUpdateConfig = async (updates: Partial<DiscoveryConfig>) => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/discovery/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error('Update failed');
      setConfig(data.config);
      showToast('success', t('configUpdated'));
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Update failed');
    }
  };

  const verdictColor = (type: string) => {
    switch (type) {
      case 'WORTH_IT': return 'bg-green-100 text-green-700';
      case 'WORTH_IT_WITH': return 'bg-emerald-100 text-emerald-700';
      case 'WAIT': return 'bg-yellow-100 text-yellow-700';
      case 'NOT_WORTH_IT': return 'bg-red-100 text-red-700';
      default: return 'bg-stone-100 text-stone-600';
    }
  };

  const runName = (run: DiscoveryStats['recentRuns'][number]) => {
    const name = typeof run.name === 'string' ? run.name.trim() : '';
    if (name) return name;

    const input = isRecord(run.input) ? run.input : null;
    const source = getStringField(input, 'source') ?? t('source');
    return t('discoveryRunFallbackName', { source });
  };

  const runResultParts = (run: DiscoveryStats['recentRuns'][number]) => {
    const input = isRecord(run.input) ? run.input : null;
    const output = isRecord(run.output) ? run.output : null;
    const parts: string[] = [];
    const source = getStringField(output, 'source') ?? getStringField(input, 'source');
    const maxProducts = getNumberField(output, 'maxProducts') ?? getNumberField(input, 'maxProducts');
    const discovered = getNumberField(output, 'discovered');
    const succeeded = getNumberField(output, 'succeeded');
    const failed = getNumberField(output, 'failed');
    const total = getNumberField(output, 'total');
    const errors = getErrorCount(output) ?? (run.error ? 1 : null);

    if (source) parts.push(t('runSource', { source }));
    if (maxProducts !== null) parts.push(t('runMaxProducts', { count: maxProducts }));
    if (discovered !== null) parts.push(t('runDiscovered', { count: discovered }));
    if (succeeded !== null) parts.push(t('runSucceededCount', { count: succeeded }));
    if (failed !== null) parts.push(t('runFailed', { count: failed }));
    if (total !== null) parts.push(t('runTotal', { count: total }));
    if (errors !== null) parts.push(t('runErrors', { count: errors }));

    return parts;
  };

  return (
    <div className="min-h-screen bg-cream" dir={dir}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 ${locale === 'ar' ? 'left-4' : 'right-4'} z-50 animate-in slide-in-from-top`}>
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            <span className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-x'} text-lg`} />
            <span className="font-medium">{toast.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-beige bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-charcoal">{t('discoveryPipeline')}</h1>
            <p className="mt-1 text-sm text-stone">{t('discoverySubtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { void handleTrigger('all'); }}
              disabled={triggering !== null}
              className="flex items-center gap-2 rounded-lg bg-sage px-3 py-2 text-sm font-semibold text-white transition hover:bg-sage/90 disabled:opacity-50"
            >
              <span className="ti ti-refresh" />
              {triggering === 'all' ? t('running') : t('runProductIntelligence')}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-beige bg-white px-6">
        <nav className="flex gap-1" role="tablist">
          {(['overview', 'signals', 'products'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); }}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab
                  ? 'border-sage text-sage text-charcoal'
                  : 'border-transparent text-stone hover:text-charcoal'
              }`}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab === 'overview' ? t('overview') : tab === 'signals' ? t('trendSignals') : t('products')}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-stone">
            <span className="ti-loader-2 animate-spin text-3xl" />
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && stats && config && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    icon="ti-package"
                    label={t('totalProducts')}
                    value={stats.totalProducts}
                    sub={`${stats.activeProducts} ${t('active')}`}
                    color="bg-lavender/20"
                  />
                  <StatCard
                    icon="ti-stars"
                    label={t('totalVerdicts')}
                    value={stats.totalVerdicts}
                    sub={stats.verdictBreakdown.map((v) => `${v.type}: ${v.count}`).join(' • ')}
                    color="bg-terracotta/10"
                  />
                  <StatCard
                    icon="ti-antenna-signal"
                    label={t('trendSignals')}
                    value={stats.trendSignals}
                    sub={`${stats.discoveryRuns} ${t('totalRuns')}`}
                    color="bg-sage/10"
                  />
                  <StatCard
                    icon="ti-history"
                    label={t('recentRuns')}
                    value={stats.recentRuns.length}
                    sub={t('last10Runs')}
                    color="bg-cream"
                  />
                </div>

                {/* Product Intelligence Pipeline Overview */}
                <div className="rounded-2xl border border-sage/20 bg-sage/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="ti ti-brain text-lg text-sage" />
                    <h3 className="text-sm font-semibold text-charcoal">{t('productIntelligencePipeline')}</h3>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="font-medium text-stone mb-1">{t('pipelineStages')}:</p>
                      <p className="text-charcoal font-mono">{t('stagesDescription')}</p>
                    </div>
                    <div>
                      <p className="font-medium text-stone mb-1">{t('allowedCategories')}:</p>
                      <p className="text-charcoal">formula · diapers · bottles · carseats · baby_care · educational_toys</p>
                    </div>
                    <div>
                      <p className="font-medium text-stone mb-1">{t('qualityGates')}:</p>
                      <ul className="space-y-0.5 text-charcoal">
                        <li>• {t('scoreRequirement')}</li>
                        <li>• {t('imageRequirement')}</li>
                        <li>• {t('reviewSourceRequirement')}</li>
                        <li>• {t('arabicContentRequirement')}</li>
                        <li>• {t('priceStockRequirement')}</li>
                        <li>• {t('schemaRequirement')}</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Config Panel */}
                <div className="rounded-2xl border border-beige bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold text-charcoal">{t('cronSettings')}</h2>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Product Intelligence Pipeline */}
                    <div className="space-y-3 rounded-xl bg-sage/10 p-4 border border-sage/20">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-brain text-lg text-sage" />
                        <span className="font-semibold text-charcoal">{t('productIntelligencePipeline')}</span>
                        <span className={`ml-auto text-xs font-mono px-2 py-0.5 rounded-full ${config.enabled ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
                          {config.enabled ? t('enabled') : t('disabled')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-stone">{t('dailyRunTime')}</label>
                        <input
                          type="time"
                          value={amazonTime || '06:00'}
                          onChange={(e) => { setAmazonTime(e.target.value); }}
                          onBlur={() => { void handleUpdateConfig({ amazonCron: saudiTimeToCron(amazonTime) }); }}
                          className="w-full rounded-lg border border-sage/30 bg-white px-3 py-2 text-sm font-mono focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                        />
                        <p className="text-xs text-stone/60">{saudiTimeHelpLabel}</p>
                        <p className="text-xs text-stone/60">
                          {config.amazonNextRun ? `${t('nextRun')}: ${new Date(config.amazonNextRun).toLocaleString(locale)}` : t('noScheduledRun')}
                        </p>
                      </div>
                    </div>

                    {/* Max Products */}
                    <div className="space-y-3 rounded-xl bg-sage/10 p-4 border border-sage/20">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-settings" />
                        <span className="font-semibold text-charcoal">{t('maxProducts')}</span>
                      </div>
                      <div className="space-y-2">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          defaultValue={config.maxProducts}
                          onBlur={(e) => { void handleUpdateConfig({ maxProducts: parseInt(e.target.value) }); }}
                          className="w-full rounded-lg border border-sage/30 bg-white px-3 py-2 text-sm focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                        />
                        <p className="text-xs text-stone/60">{t('maxProductsHelp')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Runs */}
                <div className="rounded-2xl border border-beige bg-white overflow-hidden">
                  <div className="border-b border-beige px-6 py-4">
                    <h2 className="font-semibold text-charcoal">{t('recentPipelineRuns')}</h2>
                  </div>
                  {stats.recentRuns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-stone">
                      <span className="ti-box text-4xl mb-3" />
                      <p>{t('noRunsYet')}</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-beige bg-linen/50">
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('name')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('status')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('startedAt')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('completedAt')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('result')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige">
                        {stats.recentRuns.map((run) => {
                          const startedAt = run.startedAt ?? run.createdAt;
                          const resultParts = runResultParts(run);

                          return (
                            <tr key={run.id} className="hover:bg-linen/30 transition-colors">
                              <td className="px-4 py-3 font-medium text-charcoal"><bdi dir="auto">{runName(run)}</bdi></td>
                              <td className="px-4 py-3">
                                <StatusBadge status={run.status} />
                              </td>
                              <td className="px-4 py-3 text-stone text-xs">{startedAt ? new Date(startedAt).toLocaleString(locale) : '—'}</td>
                              <td className="px-4 py-3 text-stone text-xs">{run.completedAt ? new Date(run.completedAt).toLocaleString(locale) : '—'}</td>
                              <td className="px-4 py-3 text-xs text-stone">
                                {resultParts.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {resultParts.map((part) => (
                                      <span key={part} className="rounded-full bg-linen px-2 py-0.5"><bdi dir="auto">{part}</bdi></span>
                                    ))}
                                  </div>
                                ) : run.status === 'COMPLETED' ? (
                                  <span>{t('completedWithoutDetails')}</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Verdict Breakdown */}
                {stats.verdictBreakdown.length > 0 && (
                  <div className="rounded-2xl border border-beige bg-white p-6">
                    <h2 className="mb-4 font-semibold text-charcoal">{t('verdictBreakdown')}</h2>
                    <div className="flex flex-wrap gap-3">
                      {stats.verdictBreakdown.map((v) => (
                        <div key={v.type} className={`flex items-center gap-2 rounded-full px-4 py-2 ${verdictColor(v.type)}`}>
                          <span className="text-sm font-medium">{v.type.replace('_', ' ')}</span>
                          <span className="text-xs opacity-75">({v.count})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Trend Signals Tab */}
            {activeTab === 'signals' && (
              <div className="rounded-2xl border border-beige bg-white overflow-hidden">
                <div className="border-b border-beige px-6 py-4">
                  <h2 className="font-semibold text-charcoal">{t('trendSignals')} ({trendSignals.length})</h2>
                  <p className="mt-1 text-xs text-stone">{t('trendSignalsHelp')}</p>
                </div>
                {trendSignals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-stone">
                    <span className="ti-antenna-signal text-4xl mb-3" />
                    <p>{t('noSignalsYet')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-beige bg-linen/50">
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('name')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('source')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('category')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('score')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('discoveryReason')}</th>
                          <th className="px-4 py-3 text-left font-medium text-stone">{t('createdAt')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige">
                        {trendSignals.map((signal) => (
                          <tr key={signal.id} className="hover:bg-linen/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-charcoal max-w-xs truncate">
                              <bdi dir="auto">{signal.rawTitle ?? signal.normalizedTitle ?? '—'}</bdi>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono text-stone/60">{signal.source?.split(':')[1] ?? signal.source ?? '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-stone">
                              {signal.metadata && typeof signal.metadata === 'object' && 'category' in signal.metadata
                                ? String((signal.metadata as Record<string, unknown>).category)
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              {signal.trendScore != null ? (
                                <span className="rounded-full bg-sage/10 px-2 py-0.5 text-xs font-mono text-sage font-semibold">
                                  {signal.trendScore.toFixed(1)}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-stone max-w-xs truncate">
                              <bdi dir="auto">{signal.discoveryReason ?? '—'}</bdi>
                            </td>
                            <td className="px-4 py-3 text-xs text-stone">{signal.createdAt ? new Date(signal.createdAt).toLocaleDateString(locale) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-beige bg-white overflow-hidden">
                  <div className="border-b border-beige px-6 py-4">
                    <h2 className="font-semibold text-charcoal">{t('discoveredProducts')} ({products.length})</h2>
                    <p className="mt-1 text-xs text-stone">{t('discoveredProductsHelp')}</p>
                  </div>
                  {products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-stone">
                      <span className="ti-package text-4xl mb-3" />
                      <p>{t('noProductsYet')}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                      {products.map((product) => (
                        <ProductCard key={product.id} product={product} locale={locale} t={t} verdictColor={verdictColor} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, locale, t, verdictColor }: {
  product: Product;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  verdictColor: (type: string) => string;
}) {
  const na = (val: unknown): string => (val != null ? String(val) : t('notAvailable'));
  const siteUrl = SITE_URL || 'https://babiespicks.com';

  return (
    <div className="rounded-2xl border border-beige bg-white overflow-hidden hover:shadow-md transition-shadow">
      {/* Card Header */}
      <div className="flex items-start gap-3 p-4 border-b border-beige bg-linen/20">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-linen"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-linen flex items-center justify-center flex-shrink-0">
            <span className="ti ti-package text-2xl text-stone/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-charcoal text-sm leading-snug">
            <bdi dir="auto">{product.translations.find((tr) => tr.locale === locale)?.title ?? product.name ?? t('notAvailable')}</bdi>
          </p>
          {product.brand && <p className="text-xs text-stone mt-0.5">{product.brand}</p>}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StatusBadge status={product.status} />
            {product.verdict && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${verdictColor(product.verdict.type)}`}>
                {product.verdict.type.replace('_', ' ')} ({product.verdict.score?.toFixed(1) ?? '?'})
              </span>
            )}
            {product.isActive && (
              <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded-full">{t('active')}</span>
            )}
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-4 text-sm">

        {/* Price + Store */}
        <div className="flex items-center justify-between">
          <div>
            {product.prices[0] ? (
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono font-bold text-charcoal text-base">
                  {product.prices[0].price.toLocaleString()} {product.prices[0].currency}
                </span>
                {product.prices[0].originalPrice && product.prices[0].originalPrice > product.prices[0].price && (
                  <span className="font-mono text-xs text-stone line-through">{product.prices[0].originalPrice.toLocaleString()}</span>
                )}
              </div>
            ) : (
              <span className="text-xs text-stone">{t('notAvailable')}</span>
            )}
            {product.prices[0]?.inStock === false && (
              <span className="ml-2 text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{t('outOfStock')}</span>
            )}
            {product.prices[0]?.inStock === true && (
              <span className="ml-2 text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{t('inStock')}</span>
            )}
          </div>
          {product.store && <span className="text-xs text-stone">{product.store.name}</span>}
        </div>

        {/* Links */}
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-stone uppercase tracking-wide">{t('links')}</h4>
          <div className="flex flex-wrap gap-2">
            {product.sourceUrl && (
              <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-sage underline hover:no-underline truncate max-w-[180px]">
                {t('sourceUrl')}
              </a>
            )}
            {product.slug && (
              <a href={`${siteUrl}/${locale}/products/${product.slug}`} target="_blank" rel="noopener noreferrer"
                className="text-xs text-sage underline hover:no-underline truncate max-w-[180px]">
                {t('publicProductUrl')}
              </a>
            )}
          </div>
          {/* Saved purchase links */}
          {product.prices.filter((p) => p.url).length > 0 && (
            <div>
              <p className="text-xs text-stone mb-1">{t('savedPurchaseLinks')}:</p>
              <div className="flex flex-wrap gap-2">
                {product.prices.filter((p) => p.url).map((price, idx) => (
                  <a key={idx} href={price.url!} target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-sage/10 text-sage px-2 py-1 rounded-lg underline hover:no-underline flex items-center gap-1">
                    <span className="ti ti-shopping-cart text-xs" />
                    {price.store?.name ?? t('purchaseLink')}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Identifiers */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <span className="text-xs text-stone">{t('productId')}:</span>{' '}
            <span className="text-xs font-mono text-charcoal">{product.id.slice(0, 8)}…</span>
          </div>
          {product.category && (
            <div>
              <span className="text-xs text-stone">{t('category')}:</span>{' '}
              <span className="text-xs text-charcoal">{product.category.name}</span>
            </div>
          )}
          {product.slug && (
            <div>
              <span className="text-xs text-stone">{t('slug')}:</span>{' '}
              <span className="text-xs font-mono text-charcoal truncate block">{product.slug}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-stone">{t('dataSource')}:</span>{' '}
            <span className="text-xs text-charcoal">{na(product.dataSource)}</span>
          </div>
          <div>
            <span className="text-xs text-stone">{t('confidence')}:</span>{' '}
            <span className="text-xs text-charcoal">{product.confidence != null ? `${(product.confidence * 100).toFixed(0)}%` : t('notAvailable')}</span>
          </div>
          <div>
            <span className="text-xs text-stone">{t('createdAt')}:</span>{' '}
            <span className="text-xs text-charcoal">{product.createdAt ? new Date(product.createdAt).toLocaleDateString(locale) : t('notAvailable')}</span>
          </div>
        </div>

        {/* Verdict Scores */}
        {product.verdict && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-stone uppercase tracking-wide">{t('verdictDetails')}</h4>
            <div className="grid grid-cols-3 gap-2">
              {product.verdict.safetyScore != null && (
                <div className="bg-sage/5 rounded-lg p-2 text-center">
                  <div className="text-xs text-stone">{t('safetyScore')}</div>
                  <div className="font-mono font-bold text-charcoal text-sm">{product.verdict.safetyScore.toFixed(1)}</div>
                </div>
              )}
              {product.verdict.qualityScore != null && (
                <div className="bg-lavender/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-stone">{t('qualityScore')}</div>
                  <div className="font-mono font-bold text-charcoal text-sm">{product.verdict.qualityScore.toFixed(1)}</div>
                </div>
              )}
              {product.verdict.reviewsScore != null && (
                <div className="bg-terracotta/10 rounded-lg p-2 text-center">
                  <div className="text-xs text-stone">{t('reviewsScore')}</div>
                  <div className="font-mono font-bold text-charcoal text-sm">{product.verdict.reviewsScore.toFixed(1)}</div>
                </div>
              )}
              {product.verdict.priceScore != null && (
                <div className="bg-cream rounded-lg p-2 text-center">
                  <div className="text-xs text-stone">{t('priceScore')}</div>
                  <div className="font-mono font-bold text-charcoal text-sm">{product.verdict.priceScore.toFixed(1)}</div>
                </div>
              )}
              {product.verdict.longTermScore != null && (
                <div className="bg-stone-100 rounded-lg p-2 text-center">
                  <div className="text-xs text-stone">{t('longTermScore')}</div>
                  <div className="font-mono font-bold text-charcoal text-sm">{product.verdict.longTermScore.toFixed(1)}</div>
                </div>
              )}
            </div>
            {locale === 'ar' && product.verdict.reasoningAr && (
              <p className="text-xs text-charcoal bg-linen/50 rounded-lg p-2 leading-relaxed">
                <bdi dir="auto">{product.verdict.reasoningAr}</bdi>
              </p>
            )}
            {locale === 'en' && product.verdict.reasoningEn && (
              <p className="text-xs text-charcoal bg-linen/50 rounded-lg p-2 leading-relaxed">
                <bdi dir="auto">{product.verdict.reasoningEn}</bdi>
              </p>
            )}
            {product.verdict.isPublished !== null && (
              <div className="text-xs">
                {product.verdict.isPublished ? (
                  <span className="text-green-700 font-medium">{t('published')}</span>
                ) : (
                  <span className="text-yellow-700">{t('notPublished')}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Translations */}
        {product.translations.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-stone uppercase tracking-wide">{t('translations')}</h4>
            <div className="flex gap-2">
              {product.translations.map((tr) => (
                <div key={tr.locale} className="flex-1 bg-linen/40 rounded-lg p-2 min-w-0">
                  <span className="text-xs font-medium text-charcoal uppercase">{tr.locale}</span>
                  {tr.title && <p className="text-xs text-charcoal mt-0.5 truncate"><bdi dir="auto">{tr.title}</bdi></p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review Summary */}
        {product.reviewSummary && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-stone uppercase tracking-wide">{t('reviewSummary')}</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {product.reviewSummary.averageRating != null && (
                <div>
                  <span className="text-xs text-stone">{t('averageRating')}:</span>{' '}
                  <span className="text-xs font-medium text-charcoal">{product.reviewSummary.averageRating.toFixed(2)} / 5</span>
                </div>
              )}
              {product.reviewSummary.totalReviews != null && (
                <div>
                  <span className="text-xs text-stone">{t('totalReviews')}:</span>{' '}
                  <span className="text-xs text-charcoal">{product.reviewSummary.totalReviews.toLocaleString()}</span>
                </div>
              )}
              {product.reviewSummary.sentimentScore != null && (
                <div>
                  <span className="text-xs text-stone">{t('sentimentScore')}:</span>{' '}
                  <span className="text-xs text-charcoal">{product.reviewSummary.sentimentScore.toFixed(2)}</span>
                </div>
              )}
            </div>
            {locale === 'ar' && product.reviewSummary.prosAr && (
              <p className="text-xs text-green-700"><span className="font-medium">{t('pros')}:</span> <bdi dir="auto">{product.reviewSummary.prosAr}</bdi></p>
            )}
            {locale === 'en' && product.reviewSummary.prosEn && (
              <p className="text-xs text-green-700"><span className="font-medium">{t('pros')}:</span> <bdi dir="auto">{product.reviewSummary.prosEn}</bdi></p>
            )}
            {locale === 'ar' && product.reviewSummary.consAr && (
              <p className="text-xs text-red-700"><span className="font-medium">{t('cons')}:</span> <bdi dir="auto">{product.reviewSummary.consAr}</bdi></p>
            )}
            {locale === 'en' && product.reviewSummary.consEn && (
              <p className="text-xs text-red-700"><span className="font-medium">{t('cons')}:</span> <bdi dir="auto">{product.reviewSummary.consEn}</bdi></p>
            )}
          </div>
        )}

        {/* Latest Agent Jobs */}
        {product.agentJobs.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-stone uppercase tracking-wide">{t('latestAgentJobs')}</h4>
            <div className="space-y-1">
              {product.agentJobs.slice(0, 3).map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-charcoal truncate flex-1">{job.agentName}</span>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: string; label: string; value: number; sub: string; color: string }) {
  return (
    <div className={`rounded-2xl border border-beige ${color} p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <span className={`ti ${icon} text-2xl`} />
        <span className="text-3xl font-bold text-charcoal">{value.toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-charcoal">{label}</p>
      <p className="mt-0.5 text-xs text-stone">{sub}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    NEW: 'bg-sage/10 text-sage',
    ACTIVE: 'bg-green-100 text-green-700',
    INACTIVE: 'bg-stone-100 text-stone-500',
    DISCOVERED: 'bg-lavender/20 text-lavender',
    DATA_ACQUIRED: 'bg-blue-50 text-blue-600',
    REVIEWS_ANALYZED: 'bg-yellow-50 text-yellow-700',
    VERDICT_GENERATED: 'bg-terracotta/10 text-terracotta',
    READY: 'bg-green-50 text-green-700',
  };

  const style = styles[status] ?? 'bg-stone-100 text-stone-600';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
