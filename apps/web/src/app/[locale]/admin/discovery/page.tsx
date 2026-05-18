'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type DiscoverySource = 'amazon' | 'noon' | 'all';

interface DiscoveryCandidate {
  url: string;
  name: string;
  price?: number;
  rating?: number;
  category?: string;
  source: 'amazon_bestseller' | 'noon_bestseller' | 'trending' | 'competitor_gap';
  score: number;
}

interface DiscoveryResult {
  discovered: number;
  newCandidates: number;
  candidates: DiscoveryCandidate[];
}

interface PipelineResult {
  discovered: number;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ name: string; url: string; success: boolean; error?: string }>;
}

const PIPELINE_STEPS = [
  { icon: 'ti-radar-2', label: 'جمع المرشحين', color: 'bg-sage/10 text-sage border-sage/20' },
  { icon: 'ti-brain', label: 'تقييم ذكي AI', color: 'bg-lavender/20 text-lavender border-lavender/30' },
  { icon: 'ti-filter', label: 'فلترة', color: 'bg-blue-50 text-blue-600 border-blue-100' },
  { icon: 'ti-cpu', label: 'Pipeline', color: 'bg-amber-50 text-amber-600 border-amber-100' },
  { icon: 'ti-send', label: 'نشر', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
];

const SOURCE_OPTIONS: Array<{ value: DiscoverySource; label: string; icon: string; desc: string }> = [
  { value: 'amazon', label: 'Amazon SA', icon: 'ti-brand-amazon', desc: 'أفضل المبيعات في أمازون السعودية' },
  { value: 'noon', label: 'Noon SA', icon: 'ti-shopping-bag', desc: 'أفضل المبيعات في نون السعودية' },
  { value: 'all', label: 'الكل', icon: 'ti-world', desc: 'جميع المصادر + الترند + الفجوات' },
];

export default function DiscoveryPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PipelineResult | null>(null);
  const [stats, setStats] = useState<{ products: number; verdicts: number; contentPages: number; agentJobs: number } | null>(null);
  const [maxProducts, setMaxProducts] = useState(10);
  const [source, setSource] = useState<DiscoverySource>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/admin/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const runDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`${API_BASE}/admin/pipeline/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxProducts, source }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [maxProducts, source]);

  const sourceBadge = (src: string) => {
    switch (src) {
      case 'amazon_bestseller':
        return <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5">Amazon</span>;
      case 'noon_bestseller':
        return <span className="inline-flex items-center rounded-full bg-yellow-50 text-yellow-700 text-xs font-medium px-2 py-0.5">Noon</span>;
      case 'trending':
        return <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5">ترند</span>;
      case 'competitor_gap':
        return <span className="inline-flex items-center rounded-full bg-purple-50 text-purple-700 text-xs font-medium px-2 py-0.5">فجوة</span>;
      default:
        return <span className="inline-flex items-center rounded-full bg-stone-100 text-stone-600 text-xs font-medium px-2 py-0.5">{src}</span>;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">اكتشاف المنتجات</h1>
      </header>

      <div className="flex-1 px-6 py-8 space-y-8 overflow-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">إجمالي المنتجات</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">{stats?.products ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">الأحكام</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">{stats?.verdicts ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">صفحات المحتوى</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">{stats?.contentPages ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">مهام AI</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">{stats?.agentJobs ?? '—'}</p>
          </div>
        </div>

        {/* Pipeline Flow Visualization */}
        <section className="bg-white rounded-xl border border-beige p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="ti ti-git-branch text-sage text-lg" />
            <h2 className="text-sm font-medium text-charcoal">خط أنابيب الاكتشاف</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${step.color}`}>
                  <span className={`ti ${step.icon} text-sm`} />
                  {step.label}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <span className="ti ti-arrow-left text-stone text-sm flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-stone mt-3">يعمل النظام على تقييم المرشحين بالذكاء الاصطناعي قبل إدخالهم في pipeline المنتجات</p>
        </section>

        {/* Discovery Trigger */}
        <section className="bg-white rounded-xl border border-beige p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="ti ti-radar-2 text-sage text-lg" />
            <h2 className="text-sm font-medium text-charcoal">تشغيل الاكتشاف</h2>
          </div>

          <div className="space-y-5">
            {/* Source Selector */}
            <div>
              <label className="block text-xs text-stone mb-2">مصدر الاكتشاف</label>
              <div className="grid grid-cols-3 gap-3">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSource(opt.value)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-medium transition-colors ${
                      source === opt.value
                        ? 'border-sage bg-sage/10 text-sage'
                        : 'border-beige bg-linen text-stone hover:border-sage/40 hover:text-charcoal'
                    }`}
                  >
                    <span className={`ti ${opt.icon} text-base`} />
                    <span>{opt.label}</span>
                    <span className={`text-[10px] font-normal leading-tight text-center ${source === opt.value ? 'text-sage/70' : 'text-stone/70'}`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Max products */}
            <div>
              <label className="block text-xs text-stone mb-1.5">عدد المنتجات (الحد الأقصى)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={maxProducts}
                onChange={e => setMaxProducts(Number(e.target.value))}
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>

            {/* Active strategies summary */}
            <div className="rounded-lg bg-linen border border-beige p-3 space-y-1.5">
              <p className="text-xs text-stone font-medium">استراتيجيات البحث النشطة:</p>
              {(source === 'amazon' || source === 'all') && (
                <>
                  <div className="flex items-center gap-2 text-xs text-charcoal">
                    <span className="ti ti-brand-amazon text-emerald-600" /> Amazon SA Bestsellers
                  </div>
                  <div className="flex items-center gap-2 text-xs text-charcoal">
                    <span className="ti ti-trending-up text-blue-500" /> تحليل الترند بالذكاء الاصطناعي
                  </div>
                  <div className="flex items-center gap-2 text-xs text-charcoal">
                    <span className="ti ti-target text-purple-500" /> تحليل فجوات المنافسين
                  </div>
                </>
              )}
              {(source === 'noon' || source === 'all') && (
                <div className="flex items-center gap-2 text-xs text-charcoal">
                  <span className="ti ti-shopping-bag text-yellow-600" /> Noon SA Bestsellers
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-charcoal">
                <span className="ti ti-brain text-lavender" /> تقييم ذكي بـ Gemini Flash (لجميع المصادر)
              </div>
            </div>

            <button
              onClick={runDiscovery}
              disabled={loading}
              className="w-full rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="ti ti-loader-2 animate-spin" />
                  جاري البحث عن منتجات جديدة...
                </>
              ) : (
                <>
                  <span className="ti ti-radar-2" />
                  ابدأ الاكتشاف
                  {source !== 'all' && (
                    <span className="opacity-70">
                      ({source === 'amazon' ? 'Amazon SA' : 'Noon SA'})
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Results */}
        {results && (
          <section className="bg-white rounded-xl border border-beige p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="ti ti-list-check text-sage text-lg" />
              <h2 className="text-sm font-medium text-charcoal">نتائج الاكتشاف</h2>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/10 text-sage text-xs font-medium px-3 py-1">
                <span className="ti ti-search" /> اكتُشف {results.discovered}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1">
                <span className="ti ti-check" /> نجح {results.succeeded}
              </span>
              {results.failed > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 text-xs font-medium px-3 py-1">
                  <span className="ti ti-x" /> فشل {results.failed}
                </span>
              )}
            </div>

            {/* Results Table */}
            {results.results && results.results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-beige text-xs text-stone">
                      <th className="text-right py-2 pr-3">#</th>
                      <th className="text-right py-2">المنتج</th>
                      <th className="text-right py-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {results.results.map((r, i) => (
                      <tr key={i} className="hover:bg-linen/50 transition-colors">
                        <td className="py-2.5 pr-3 text-stone tabular-nums">{i + 1}</td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-charcoal">{r.name || 'منتج جديد'}</span>
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sage hover:text-sage-deep">
                              <span className="ti ti-external-link text-xs" />
                            </a>
                          </div>
                        </td>
                        <td className="py-2.5">
                          {r.success ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5">
                              <span className="ti ti-check text-xs" /> نجح
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 text-xs font-medium px-2 py-0.5" title={r.error}>
                              <span className="ti ti-x text-xs" /> فشل
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-stone">لم يتم العثور على منتجات جديدة</p>
            )}
          </section>
        )}

        {/* Cron Status — dual schedules */}
        <section className="bg-white rounded-xl border border-beige p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="ti ti-clock text-sage text-lg" />
            <h2 className="text-sm font-medium text-charcoal">الاكتشاف التلقائي</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-linen border border-beige px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="ti ti-brand-amazon text-emerald-600 text-base" />
                <div>
                  <p className="text-sm text-charcoal font-medium">Amazon SA</p>
                  <p className="text-xs text-stone">يومياً 6:00 صباحاً بتوقيت السعودية</p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-sage/10 text-sage text-xs font-medium px-2.5 py-1">مفعّل</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-linen border border-beige px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="ti ti-shopping-bag text-yellow-600 text-base" />
                <div>
                  <p className="text-sm text-charcoal font-medium">Noon SA</p>
                  <p className="text-xs text-stone">يومياً 1:00 ظهراً بتوقيت السعودية</p>
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-sage/10 text-sage text-xs font-medium px-2.5 py-1">مفعّل</span>
            </div>
          </div>
          <p className="text-xs text-stone mt-3">كلا الجدولين يستخدمان تقييم الذكاء الاصطناعي تلقائياً قبل إدخال المنتجات في pipeline التحليل</p>
        </section>
      </div>
    </div>
  );
}
