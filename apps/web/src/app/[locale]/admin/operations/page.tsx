'use client';

import { useState, useCallback } from 'react';
import { adminFetch } from '@/shared/lib/admin-fetch';

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

interface ApiResponse {
  success?: boolean;
  message?: string;
  total?: number;
  results?: Array<{ url: string; success: boolean; error?: string; result?: unknown }>;
  [key: string]: unknown;
}

interface SprintResult {
  dryRun: boolean;
  planned: Array<{ slug: string; type: string; topic: string; productCount: number }>;
  executed: Array<{ slug: string; type: string; published: boolean }>;
  skipped: Array<{ slug: string; type: string; reason: string | null }>;
  errors: Array<{ slug: string; type: string; error: string }>;
}

type DiscoverySource = 'amazon' | 'noon' | 'all';

/* ------------------------------------------------------------------ */
/* Constants                                                             */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'جميع الفئات' },
  { value: 'formula', label: 'حليب الأطفال' },
  { value: 'diapers', label: 'الحفاضات' },
  { value: 'carseats', label: 'كراسي السيارة' },
  { value: 'bottles', label: 'الرضاعات' },
  { value: 'toys', label: 'الألعاب التعليمية' },
  { value: 'care', label: 'العناية بالطفل' },
];

const SPRINT_TYPE_OPTIONS = [
  { value: 'ALL', label: 'الكل (قوائم + مراجعات + أدلة)' },
  { value: 'BEST_LIST', label: 'قوائم أفضل' },
  { value: 'PRODUCT_REVIEW', label: 'مراجعات منتجات' },
  { value: 'BUYING_GUIDE', label: 'أدلة الشراء' },
];

const SOURCE_OPTIONS: Array<{ value: DiscoverySource; label: string; icon: string; desc: string }> = [
  { value: 'amazon', label: 'Amazon SA', icon: 'ti-brand-amazon', desc: 'أفضل المبيعات في أمازون السعودية' },
  { value: 'noon', label: 'Noon SA', icon: 'ti-shopping-bag', desc: 'أفضل المبيعات في نون السعودية' },
  { value: 'all', label: 'الكل', icon: 'ti-world', desc: 'جميع المصادر + الترند + الفجوات' },
];

/* ------------------------------------------------------------------ */
/* Collapsible section wrapper                                           */
/* ------------------------------------------------------------------ */

function Section({
  icon,
  title,
  defaultOpen = false,
  danger = false,
  children,
}: {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden transition-all ${
        danger ? 'border-terracotta/30' : 'border-beige'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-6 py-4 text-right"
      >
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          danger ? 'bg-terracotta/10' : 'bg-sage/10'
        }`}>
          <span className={`ti ${icon} text-sm ${danger ? 'text-terracotta' : 'text-sage'}`} />
        </span>
        <span className="text-sm font-medium text-charcoal flex-1 text-start">{title}</span>
        <span className={`ti text-stone text-sm transition-transform ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
      </button>

      {open && (
        <div className={`px-6 pb-6 border-t ${danger ? 'border-terracotta/20' : 'border-beige'}`}>
          <div className="pt-5">{children}</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                  */
/* ------------------------------------------------------------------ */

export default function OperationsPage() {
  /* — Single product — */
  const [productUrl, setProductUrl] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [productLoading, setProductLoading] = useState(false);

  /* — Batch — */
  const [batchUrls, setBatchUrls] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  /* — Discovery — */
  const [source, setSource] = useState<DiscoverySource>('all');
  const [maxProducts, setMaxProducts] = useState(10);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  /* — Content pipeline — */
  const [contentType, setContentType] = useState<'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE'>('BEST_LIST');
  const [topic, setTopic] = useState('');
  const [slug, setSlug] = useState('');
  const [productIds, setProductIds] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  /* — Content Sprint — */
  const [sprintType, setSprintType] = useState<'ALL' | 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE'>('ALL');
  const [sprintCategory, setSprintCategory] = useState('all');
  const [sprintDryRun, setSprintDryRun] = useState(true);
  const [sprintLoading, setSprintLoading] = useState(false);
  const [sprintResult, setSprintResult] = useState<SprintResult | null>(null);

  /* — Danger zone — */
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  /* — Shared result — */
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---------------------------------------------------------------- */
  /* Handlers                                                           */
  /* ---------------------------------------------------------------- */

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productUrl.trim()) return;
    setProductLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/pipeline/product`, {
        method: 'POST',
        body: JSON.stringify({ url: productUrl.trim(), storeSlug: storeSlug.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
      setProductUrl('');
      setStoreSlug('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run product pipeline');
    } finally {
      setProductLoading(false);
    }
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = batchUrls.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBatchLoading(true);
    setResult(null);
    setError(null);
    try {
      const urls = lines.map((line) => {
        const [url, slugFromLine] = line.split(/\s+/);
        return { url, storeSlug: slugFromLine || undefined };
      });
      const res = await adminFetch(`${API_BASE}/admin/pipeline/batch`, {
        method: 'POST',
        body: JSON.stringify({ urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
      setBatchUrls('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run batch pipeline');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleDiscovery = useCallback(async () => {
    setDiscoveryLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/pipeline/discover`, {
        method: 'POST',
        body: JSON.stringify({ maxProducts, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run discovery');
    } finally {
      setDiscoveryLoading(false);
    }
  }, [maxProducts, source]);

  const handleContentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !slug.trim() || !productIds.trim()) return;
    setContentLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/pipeline/content`, {
        method: 'POST',
        body: JSON.stringify({
          type: contentType,
          topic: topic.trim(),
          slug: slug.trim(),
          productIds: productIds.split(',').map((id) => id.trim()).filter(Boolean),
          categoryId: categoryId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
      setTopic('');
      setSlug('');
      setProductIds('');
      setCategoryId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run content pipeline');
    } finally {
      setContentLoading(false);
    }
  };

  const handleSprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSprintLoading(true);
    setSprintResult(null);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/pipeline/content-sprint`, {
        method: 'POST',
        body: JSON.stringify({ type: sprintType, categorySlug: sprintCategory, dryRun: sprintDryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setSprintResult(data as SprintResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run content sprint');
    } finally {
      setSprintLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/data/reset`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
      setShowResetConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset data');
    } finally {
      setResetLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Input styles                                                        */
  /* ---------------------------------------------------------------- */

  const inputCls =
    'w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow';
  const selectCls =
    'w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow';
  const labelCls = 'block text-xs text-stone mb-1.5';
  const btnPrimary =
    'w-full rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  /* ---------------------------------------------------------------- */
  /* Render                                                              */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">العمليات</h1>
      </header>

      <div className="flex-1 px-6 py-6 space-y-4 overflow-auto">

        {/* ── Section 1: تشغيل المنتجات ── */}
        <Section icon="ti-package" title="تشغيل المنتجات" defaultOpen>
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Single product */}
            <div>
              <p className="text-xs font-medium text-charcoal mb-4 flex items-center gap-1.5">
                <span className="ti ti-package text-sage" />
                منتج واحد
              </p>
              <form onSubmit={handleProductSubmit} className="space-y-3">
                <div>
                  <label htmlFor="product-url" className={labelCls}>رابط المنتج</label>
                  <input
                    id="product-url"
                    type="url"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    placeholder="https://..."
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="store-slug" className={labelCls}>معرّف المتجر (اختياري)</label>
                  <input
                    id="store-slug"
                    type="text"
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(e.target.value)}
                    placeholder="jarir"
                    className={inputCls}
                  />
                </div>
                <button type="submit" disabled={productLoading || !productUrl.trim()} className={btnPrimary}>
                  {productLoading ? 'جارٍ التشغيل...' : 'تشغيل'}
                </button>
              </form>
            </div>

            {/* Batch */}
            <div>
              <p className="text-xs font-medium text-charcoal mb-4 flex items-center gap-1.5">
                <span className="ti ti-list text-sage" />
                تشغيل دفعي
              </p>
              <form onSubmit={handleBatchSubmit} className="space-y-3">
                <div>
                  <label htmlFor="batch-urls" className={labelCls}>روابط المنتجات (سطر لكل منتج)</label>
                  <textarea
                    id="batch-urls"
                    value={batchUrls}
                    onChange={(e) => setBatchUrls(e.target.value)}
                    placeholder={"https://example.com/product1\nhttps://example.com/product2 jarir"}
                    rows={5}
                    className={`${inputCls} resize-none`}
                  />
                </div>
                <button type="submit" disabled={batchLoading || !batchUrls.trim()} className={btnPrimary}>
                  {batchLoading ? 'جارٍ التشغيل...' : 'تشغيل الكل'}
                </button>
              </form>
            </div>
          </div>
        </Section>

        {/* ── Section 2: اكتشاف المنتجات ── */}
        <Section icon="ti-radar-2" title="اكتشاف المنتجات">
          <div className="space-y-5">
            {/* Source selector */}
            <div>
              <label className={labelCls}>مصدر الاكتشاف</label>
              <div className="grid grid-cols-3 gap-3">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSource(opt.value)}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-xs font-medium transition-all ${
                      source === opt.value
                        ? 'border-sage bg-sage/5 shadow-sm'
                        : 'border-beige bg-linen hover:border-sage/40 hover:bg-white'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      source === opt.value ? 'bg-sage/10' : 'bg-beige/60'
                    }`}>
                      <span className={`ti ${opt.icon} text-base ${source === opt.value ? 'text-sage' : 'text-stone'}`} />
                    </div>
                    <span className={source === opt.value ? 'text-charcoal' : 'text-stone'}>{opt.label}</span>
                    <span className={`text-[10px] font-normal leading-tight text-center ${source === opt.value ? 'text-stone' : 'text-stone/60'}`}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Max products slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-stone">عدد المنتجات (الحد الأقصى)</label>
                <span className="text-xs font-semibold text-charcoal tabular-nums bg-linen border border-beige rounded-md px-2 py-0.5">{maxProducts}</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={20}
                  value={maxProducts}
                  onChange={(e) => setMaxProducts(Number(e.target.value))}
                  className="flex-1 h-1.5 rounded-full bg-beige accent-sage cursor-pointer"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMaxProducts((v) => Math.max(5, v - 1))}
                    className="w-7 h-7 rounded-lg border border-beige bg-linen text-stone hover:text-charcoal hover:border-sage/40 flex items-center justify-center transition-colors"
                  >
                    <span className="ti ti-minus text-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaxProducts((v) => Math.min(20, v + 1))}
                    className="w-7 h-7 rounded-lg border border-beige bg-linen text-stone hover:text-charcoal hover:border-sage/40 flex items-center justify-center transition-colors"
                  >
                    <span className="ti ti-plus text-xs" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-stone/60 mt-1">
                <span>5</span>
                <span>12</span>
                <span>20</span>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleDiscovery}
              disabled={discoveryLoading}
              className="w-full rounded-xl bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {discoveryLoading ? (
                <>
                  <span className="ti ti-loader-2 animate-spin" />
                  جاري البحث...
                </>
              ) : (
                <>
                  <span className="ti ti-radar-2" />
                  ابدأ الاكتشاف
                </>
              )}
            </button>
          </div>
        </Section>

        {/* ── Section 3: توليد المحتوى ── */}
        <Section icon="ti-file-text" title="توليد المحتوى">
          <div className="space-y-8">
            {/* Content pipeline */}
            <div>
              <p className="text-xs font-medium text-charcoal mb-4 flex items-center gap-1.5">
                <span className="ti ti-file-text text-sage" />
                صفحة محتوى مخصصة
              </p>
              <form onSubmit={handleContentSubmit} className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="content-type" className={labelCls}>النوع</label>
                  <select
                    id="content-type"
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as typeof contentType)}
                    className={selectCls}
                  >
                    <option value="BEST_LIST">قائمة أفضل</option>
                    <option value="PRODUCT_REVIEW">مراجعة منتج</option>
                    <option value="BUYING_GUIDE">دليل الشراء</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="topic" className={labelCls}>الموضوع</label>
                  <input
                    id="topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="أفضل حمّالات للأطفال"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="content-slug" className={labelCls}>المُعرّف (slug)</label>
                  <input
                    id="content-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="best-baby-carriers"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="product-ids" className={labelCls}>معرّفات المنتجات</label>
                  <input
                    id="product-ids"
                    type="text"
                    value={productIds}
                    onChange={(e) => setProductIds(e.target.value)}
                    placeholder="prod_xxx, prod_yyy"
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="category-id" className={labelCls}>معرّف الفئة (اختياري)</label>
                  <input
                    id="category-id"
                    type="text"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    placeholder="cat_xxx"
                    className={inputCls}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={contentLoading || !topic.trim() || !slug.trim() || !productIds.trim()}
                    className={`${btnPrimary}`}
                  >
                    {contentLoading ? 'جارٍ التشغيل...' : 'تشغيل'}
                  </button>
                </div>
              </form>
            </div>

            <hr className="border-beige" />

            {/* Content Sprint */}
            <div>
              <p className="text-xs font-medium text-charcoal mb-1 flex items-center gap-1.5">
                <span className="ti ti-bolt text-sage" />
                Content Sprint — توليد المحتوى التلقائي
              </p>
              <p className="text-xs text-stone mb-4 leading-relaxed">
                يولّد قوائم الأفضل ومراجعات المنتجات وأدلة الشراء تلقائياً من المنتجات الموجودة في قاعدة البيانات.
                استخدم &quot;تجربة&quot; أولاً لعرض ما سيُولَّد دون استدعاء الذكاء الاصطناعي.
              </p>
              <form onSubmit={handleSprintSubmit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label htmlFor="sprint-type" className={labelCls}>النوع</label>
                  <select
                    id="sprint-type"
                    value={sprintType}
                    onChange={(e) => setSprintType(e.target.value as typeof sprintType)}
                    className={selectCls}
                  >
                    {SPRINT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="sprint-category" className={labelCls}>الفئة</label>
                  <select
                    id="sprint-category"
                    value={sprintCategory}
                    onChange={(e) => setSprintCategory(e.target.value)}
                    className={selectCls}
                  >
                    {CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-0.5">
                  <input
                    id="sprint-dry-run"
                    type="checkbox"
                    checked={sprintDryRun}
                    onChange={(e) => setSprintDryRun(e.target.checked)}
                    className="h-4 w-4 rounded border-beige text-sage focus:ring-sage/30"
                  />
                  <label htmlFor="sprint-dry-run" className="text-sm text-charcoal select-none cursor-pointer">
                    تجربة فقط (Dry Run)
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={sprintLoading}
                  className="rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 px-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sprintLoading ? 'جارٍ التشغيل...' : sprintDryRun ? 'معاينة الخطة' : 'تشغيل Sprint'}
                </button>
              </form>

              {/* Sprint results */}
              {sprintResult && (
                <div className="mt-6 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-sage/10 text-sage text-xs font-medium px-3 py-1">
                      <span className="ti ti-check text-[11px]" />
                      {sprintResult.executed.length} مُنجَز
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-medium px-3 py-1">
                      <span className="ti ti-clock text-[11px]" />
                      {sprintResult.skipped.length} متجاوَز
                    </span>
                    {sprintResult.errors.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-600 text-xs font-medium px-3 py-1">
                        <span className="ti ti-alert-triangle text-[11px]" />
                        {sprintResult.errors.length} خطأ
                      </span>
                    )}
                    {sprintResult.dryRun && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-lavender/20 text-lavender-text text-xs font-medium px-3 py-1">
                        تجربة — لم يُستدعَ الذكاء الاصطناعي
                      </span>
                    )}
                  </div>

                  {sprintResult.planned.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-charcoal mb-2">
                        {sprintResult.dryRun ? 'سيُولَّد:' : 'خطة التنفيذ:'}
                      </p>
                      <div className="rounded-lg border border-beige overflow-hidden divide-y divide-beige">
                        {sprintResult.planned.map((item) => {
                          const exec = sprintResult.executed.find((e) => e.slug === item.slug);
                          const err = sprintResult.errors.find((e) => e.slug === item.slug);
                          return (
                            <div key={item.slug} className="flex items-center gap-3 px-4 py-2.5 bg-linen/40">
                              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                                item.type === 'BEST_LIST' ? 'bg-sage/15 text-sage-deep' :
                                item.type === 'PRODUCT_REVIEW' ? 'bg-lavender/20 text-lavender-text' :
                                'bg-terracotta/10 text-terracotta'
                              }`}>
                                {item.type === 'BEST_LIST' ? 'أفضل' : item.type === 'PRODUCT_REVIEW' ? 'مراجعة' : 'دليل'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-charcoal truncate">{item.topic}</p>
                                <p className="text-[10px] text-stone font-mono">{item.slug}</p>
                              </div>
                              <span className="text-[10px] text-stone whitespace-nowrap">{item.productCount} منتج</span>
                              {exec && <span className="ti ti-check text-sage text-sm" title="تم النشر" />}
                              {err && <span className="ti ti-x text-red-500 text-sm" title={err.error} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sprintResult.errors.length > 0 && (
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                      {sprintResult.errors.map((e) => (
                        <p key={e.slug} className="text-xs text-red-600">
                          <span className="font-mono">{e.slug}</span>: {e.error}
                        </p>
                      ))}
                    </div>
                  )}

                  {sprintResult.skipped.length > 0 && (
                    <details className="text-xs text-stone">
                      <summary className="cursor-pointer select-none hover:text-charcoal transition-colors">
                        {sprintResult.skipped.length} عنصر متجاوَز ←
                      </summary>
                      <div className="mt-2 space-y-1 ps-3 border-s border-beige">
                        {sprintResult.skipped.map((s) => (
                          <p key={s.slug} className="font-mono">{s.slug} — {s.reason}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ── Section 4: منطقة الخطر ── */}
        <Section icon="ti-alert-triangle" title="منطقة الخطر" danger>
          <p className="text-sm text-stone mb-4 leading-relaxed">
            حذف جميع المنتجات والتقييمات وصفحات المحتوى ومهام الوكيل. هذا الإجراء لا يمكن التراجع عنه.
          </p>
          {!showResetConfirm ? (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="rounded-lg border border-terracotta text-terracotta hover:bg-terracotta hover:text-cream text-sm font-medium py-2.5 px-5 transition-colors"
            >
              إعادة تعيين البيانات
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-terracotta font-medium">هل أنت متأكد؟ لا يمكن التراجع عن هذا.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={resetLoading}
                  className="rounded-lg bg-terracotta hover:bg-terracotta/90 text-cream text-sm font-medium py-2.5 px-5 transition-colors disabled:opacity-50"
                >
                  {resetLoading ? 'جارٍ...' : 'نعم، احذف الكل'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetLoading}
                  className="rounded-lg border border-beige text-stone hover:bg-linen text-sm font-medium py-2.5 px-5 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* ── Shared result area ── */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="ti ti-alert-triangle text-red-500 text-sm" />
              <span className="text-sm font-medium text-red-700">خطأ</span>
            </div>
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
        {result && (
          <div className="rounded-xl bg-sage/5 border border-sage/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="ti ti-check text-sage text-sm" />
              <span className="text-sm font-medium text-sage-deep">النتيجة</span>
            </div>
            <pre className="text-xs text-charcoal overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}
