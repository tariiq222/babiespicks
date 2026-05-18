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
  { icon: 'ti-radar-2', label: 'جمع المرشحين', color: 'text-sage', bg: 'bg-sage/10', border: 'border-sage/20', activeRing: 'ring-sage/30' },
  { icon: 'ti-brain', label: 'تقييم AI', color: 'text-lavender-text', bg: 'bg-lavender', border: 'border-lavender-border/30', activeRing: 'ring-lavender-border/30' },
  { icon: 'ti-filter', label: 'فلترة', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', activeRing: 'ring-blue-200' },
  { icon: 'ti-cpu', label: 'Pipeline', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', activeRing: 'ring-amber-200' },
  { icon: 'ti-send', label: 'نشر', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', activeRing: 'ring-emerald-200' },
];

const SOURCE_OPTIONS: Array<{ value: DiscoverySource; label: string; icon: string; desc: string; color: string; iconBg: string }> = [
  { value: 'amazon', label: 'Amazon SA', icon: 'ti-brand-amazon', desc: 'أفضل المبيعات في أمازون السعودية', color: 'text-emerald-700', iconBg: 'bg-emerald-50' },
  { value: 'noon', label: 'Noon SA', icon: 'ti-shopping-bag', desc: 'أفضل المبيعات في نون السعودية', color: 'text-yellow-700', iconBg: 'bg-yellow-50' },
  { value: 'all', label: 'الكل', icon: 'ti-world', desc: 'جميع المصادر + الترند + الفجوات', color: 'text-sage', iconBg: 'bg-sage/10' },
];

const AI_CRITERIA = [
  { icon: 'ti-chart-bar', label: 'حجم البحث', desc: 'الطلب الشهري على المنتج', color: 'text-blue-600', bg: 'bg-blue-50' },
  { icon: 'ti-sword', label: 'المنافسة', desc: 'مستوى صعوبة المنافسة', color: 'text-amber-600', bg: 'bg-amber-50' },
  { icon: 'ti-coin', label: 'إمكانية الربح', desc: 'هامش الربح المتوقع', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { icon: 'ti-calendar-event', label: 'الموسمية', desc: 'مدى ثبات الطلب على مدار العام', color: 'text-lavender-text', bg: 'bg-lavender' },
  { icon: 'ti-shield-check', label: 'السلامة', desc: 'مدى ملاءمة المنتج للأطفال', color: 'text-sage', bg: 'bg-sage/10' },
];

export default function DiscoveryPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PipelineResult | null>(null);
  const [stats, setStats] = useState<{ products: number; verdicts: number; contentPages: number; agentJobs: number } | null>(null);
  const [maxProducts, setMaxProducts] = useState(10);
  const [source, setSource] = useState<DiscoverySource>('all');
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number | null>(null);

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
    setActiveStep(0);

    const stepInterval = setInterval(() => {
      setActiveStep(prev => {
        if (prev === null || prev >= PIPELINE_STEPS.length - 1) return prev;
        return prev + 1;
      });
    }, 3000);

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
      clearInterval(stepInterval);
      setLoading(false);
      setActiveStep(null);
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

  const activeStrategies = () => {
    const list: { icon: string; label: string; color: string }[] = [];
    if (source === 'amazon' || source === 'all') {
      list.push({ icon: 'ti-brand-amazon', label: 'Amazon SA Bestsellers', color: 'text-emerald-600' });
      list.push({ icon: 'ti-trending-up', label: 'تحليل الترند بالذكاء الاصطناعي', color: 'text-blue-500' });
      list.push({ icon: 'ti-target', label: 'تحليل فجوات المنافسين', color: 'text-purple-500' });
    }
    if (source === 'noon' || source === 'all') {
      list.push({ icon: 'ti-shopping-bag', label: 'Noon SA Bestsellers', color: 'text-yellow-600' });
    }
    list.push({ icon: 'ti-brain', label: 'تقييم ذكي بـ Gemini Flash', color: 'text-lavender-text' });
    return list;
  };

  return (
    <div className="min-h-screen flex flex-col bg-linen">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-sage/10 flex items-center justify-center">
            <span className="ti ti-radar-2 text-sage text-sm" />
          </div>
          <h1 className="text-sm font-medium text-charcoal">اكتشاف المنتجات</h1>
        </div>
      </header>

      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Pipeline Flow — full width */}
          <section className="bg-white rounded-xl border border-beige p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="ti ti-git-branch text-sage text-base" />
              <h2 className="text-sm font-medium text-charcoal">خط أنابيب الاكتشاف</h2>
              <span className="text-xs text-stone mr-auto">يعمل النظام على تقييم المرشحين بالذكاء الاصطناعي قبل الإدخال في pipeline المنتجات</span>
            </div>

            {/* Steps with connecting lines */}
            <div className="flex items-start justify-between gap-2 relative">
              {/* Connecting line background */}
              <div className="absolute top-[22px] right-[40px] left-[40px] h-px bg-beige" />
              {/* Animated progress line when loading */}
              {loading && activeStep !== null && (
                <div
                  className="absolute top-[22px] right-[40px] h-px bg-sage transition-all duration-1000"
                  style={{ width: `${(activeStep / (PIPELINE_STEPS.length - 1)) * (100 - (80 / 540 * 100))}%` }}
                />
              )}

              {PIPELINE_STEPS.map((step, i) => {
                const isActive = loading && activeStep === i;
                const isDone = loading && activeStep !== null && i < activeStep;
                return (
                  <div key={step.label} className="flex flex-col items-center gap-2 z-10 flex-1">
                    <div className={`
                      w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-300
                      ${isDone ? 'bg-sage border-sage text-cream' : isActive ? `${step.bg} ${step.border} border-2 ring-4 ${step.activeRing}` : `${step.bg} ${step.border} ${step.color}`}
                      ${isActive ? 'scale-110' : ''}
                    `}>
                      {isDone
                        ? <span className="ti ti-check text-sm" />
                        : <span className={`ti ${step.icon} text-sm ${isActive ? step.color : ''}`} />
                      }
                    </div>
                    <span className={`text-xs font-medium text-center leading-tight ${isActive ? 'text-charcoal' : isDone ? 'text-sage' : 'text-stone'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Stats — 4 cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي المنتجات', value: stats?.products, icon: 'ti-package', color: 'text-sage', bg: 'bg-sage/10' },
              { label: 'الأحكام', value: stats?.verdicts, icon: 'ti-scale', color: 'text-lavender-text', bg: 'bg-lavender' },
              { label: 'صفحات المحتوى', value: stats?.contentPages, icon: 'ti-file-text', color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'مهام AI', value: stats?.agentJobs, icon: 'ti-robot', color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-beige p-5 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`ti ${card.icon} ${card.color} text-lg`} />
                </div>
                <div>
                  <p className="text-xs text-stone leading-tight">{card.label}</p>
                  <p className="text-2xl font-semibold text-charcoal tabular-nums mt-0.5">{card.value ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 2-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

            {/* Left: Discovery Trigger */}
            <section className="bg-white rounded-xl border border-beige p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-7 h-7 rounded-lg bg-sage/10 flex items-center justify-center">
                  <span className="ti ti-radar-2 text-sage text-sm" />
                </div>
                <h2 className="text-sm font-medium text-charcoal">تشغيل الاكتشاف</h2>
              </div>

              <div className="space-y-5">
                {/* Source Selector — 3 card buttons */}
                <div>
                  <label className="block text-xs text-stone mb-2.5">مصدر الاكتشاف</label>
                  <div className="grid grid-cols-3 gap-3">
                    {SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSource(opt.value)}
                        className={`group flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-xs font-medium transition-all ${
                          source === opt.value
                            ? 'border-sage bg-sage/5 shadow-sm'
                            : 'border-beige bg-linen hover:border-sage/40 hover:bg-white'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                          source === opt.value ? `${opt.iconBg}` : 'bg-beige/60 group-hover:bg-beige'
                        }`}>
                          <span className={`ti ${opt.icon} text-base ${source === opt.value ? opt.color : 'text-stone'}`} />
                        </div>
                        <span className={source === opt.value ? 'text-charcoal' : 'text-stone'}>{opt.label}</span>
                        <span className={`text-[10px] font-normal leading-tight text-center ${source === opt.value ? 'text-stone' : 'text-stone/60'}`}>
                          {opt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max products */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-stone">عدد المنتجات (الحد الأقصى)</label>
                    <span className="text-xs font-semibold text-charcoal tabular-nums bg-linen border border-beige rounded-md px-2 py-0.5">{maxProducts}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={50}
                      value={maxProducts}
                      onChange={e => setMaxProducts(Number(e.target.value))}
                      className="flex-1 h-1.5 rounded-full bg-beige accent-sage cursor-pointer"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setMaxProducts(v => Math.max(1, v - 5))}
                        className="w-7 h-7 rounded-lg border border-beige bg-linen text-stone hover:text-charcoal hover:border-sage/40 flex items-center justify-center transition-colors text-xs"
                      >
                        <span className="ti ti-minus" />
                      </button>
                      <button
                        onClick={() => setMaxProducts(v => Math.min(50, v + 5))}
                        className="w-7 h-7 rounded-lg border border-beige bg-linen text-stone hover:text-charcoal hover:border-sage/40 flex items-center justify-center transition-colors text-xs"
                      >
                        <span className="ti ti-plus" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-stone/60 mt-1">
                    <span>1</span>
                    <span>25</span>
                    <span>50</span>
                  </div>
                </div>

                {/* Active strategies */}
                <div className="rounded-xl bg-linen border border-beige p-4">
                  <p className="text-xs font-medium text-charcoal mb-3">استراتيجيات البحث النشطة</p>
                  <div className="space-y-2">
                    {activeStrategies().map((s, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs text-charcoal">
                        <div className="w-5 h-5 rounded-md bg-white border border-beige flex items-center justify-center flex-shrink-0">
                          <span className={`ti ${s.icon} ${s.color} text-xs`} />
                        </div>
                        <span>{s.label}</span>
                        <span className="ti ti-check text-sage mr-auto" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={runDiscovery}
                  disabled={loading}
                  className="w-full rounded-xl bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
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
                        <span className="opacity-70 text-xs">({source === 'amazon' ? 'Amazon SA' : 'Noon SA'})</span>
                      )}
                    </>
                  )}
                </button>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-start gap-3">
                    <span className="ti ti-alert-triangle text-red-600 text-sm mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
              </div>
            </section>

            {/* Right column */}
            <div className="space-y-5">

              {/* Cron Schedules */}
              <section className="bg-white rounded-xl border border-beige p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-sage/10 flex items-center justify-center">
                    <span className="ti ti-clock text-sage text-sm" />
                  </div>
                  <h2 className="text-sm font-medium text-charcoal">الجدولة التلقائية</h2>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border border-beige bg-linen p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-brand-amazon text-emerald-600 text-base" />
                        <span className="text-sm font-medium text-charcoal">Amazon SA</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 text-sage text-xs font-medium px-2.5 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />
                        مفعّل
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone">
                      <span className="ti ti-clock text-stone/60" />
                      يومياً 6:00 صباحاً (توقيت السعودية)
                    </div>
                  </div>

                  <div className="rounded-xl border border-beige bg-linen p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-shopping-bag text-yellow-600 text-base" />
                        <span className="text-sm font-medium text-charcoal">Noon SA</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 text-sage text-xs font-medium px-2.5 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-sage inline-block" />
                        مفعّل
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone">
                      <span className="ti ti-clock text-stone/60" />
                      يومياً 1:00 ظهراً (توقيت السعودية)
                    </div>
                  </div>

                  <p className="text-xs text-stone/70 pt-1">يستخدم كلا الجدولين تقييم AI تلقائياً قبل إدخال المنتجات في pipeline التحليل</p>
                </div>
              </section>

              {/* AI Scoring Criteria */}
              <section className="bg-white rounded-xl border border-beige p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-lavender flex items-center justify-center">
                    <span className="ti ti-brain text-lavender-text text-sm" />
                  </div>
                  <h2 className="text-sm font-medium text-charcoal">معايير التقييم الذكي</h2>
                </div>
                <div className="space-y-2.5">
                  {AI_CRITERIA.map((c) => (
                    <div key={c.label} className="flex items-center gap-3 rounded-lg bg-linen border border-beige px-3 py-2.5">
                      <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
                        <span className={`ti ${c.icon} ${c.color} text-sm`} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-charcoal leading-tight">{c.label}</p>
                        <p className="text-[10px] text-stone leading-tight mt-0.5">{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          </div>

          {/* Results — full width */}
          {results && (
            <section className="bg-white rounded-xl border border-beige p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-7 h-7 rounded-lg bg-sage/10 flex items-center justify-center">
                  <span className="ti ti-list-check text-sage text-sm" />
                </div>
                <h2 className="text-sm font-medium text-charcoal">نتائج الاكتشاف</h2>

                {/* Summary badges */}
                <div className="flex items-center gap-2 mr-auto flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/10 text-sage text-xs font-medium px-3 py-1">
                    <span className="ti ti-search text-xs" /> اكتُشف {results.discovered}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1">
                    <span className="ti ti-check text-xs" /> نجح {results.succeeded}
                  </span>
                  {results.failed > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 text-xs font-medium px-3 py-1">
                      <span className="ti ti-x text-xs" /> فشل {results.failed}
                    </span>
                  )}
                </div>
              </div>

              {results.results && results.results.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-beige">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-linen border-b border-beige text-xs text-stone">
                        <th className="text-right py-3 px-4 font-medium">#</th>
                        <th className="text-right py-3 px-4 font-medium">المنتج</th>
                        <th className="text-right py-3 px-4 font-medium">المصدر</th>
                        <th className="text-right py-3 px-4 font-medium">الحالة</th>
                        <th className="text-right py-3 px-4 font-medium">تفاصيل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige">
                      {results.results.map((r, i) => (
                        <tr key={i} className="hover:bg-linen/50 transition-colors group">
                          <td className="py-3 px-4 text-stone tabular-nums text-xs">{i + 1}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-charcoal text-sm">{r.name || 'منتج جديد'}</span>
                              <a href={r.url} target="_blank" rel="noopener noreferrer"
                                className="text-stone hover:text-sage opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="ti ti-external-link text-xs" />
                              </a>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {sourceBadge(r.url?.includes('amazon') ? 'amazon_bestseller' : 'noon_bestseller')}
                          </td>
                          <td className="py-3 px-4">
                            {r.success ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1">
                                <span className="ti ti-check text-xs" /> نجح
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1">
                                <span className="ti ti-x text-xs" /> فشل
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {!r.success && r.error && (
                              <span className="text-xs text-stone/70 truncate max-w-xs block" title={r.error}>{r.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-stone">
                  <span className="ti ti-search-off text-3xl text-stone/30 mb-2" />
                  <p className="text-sm">لم يتم العثور على منتجات جديدة</p>
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
