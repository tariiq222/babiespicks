'use client';

import { useState, useEffect, useCallback } from 'react';

interface Stats {
  products: number;
  verdicts: number;
  contentPages: number;
  agentJobs: number;
}

interface CostStats {
  totalTokens: number;
  totalCostUsd: number;
  byAgent: { agentType: string; tokens: number; costUsd: number; jobCount: number }[];
  last7Days: { date: string; tokens: number; costUsd: number }[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  total?: number;
  results?: Array<{ url: string; success: boolean; error?: string; result?: unknown }>;
  [key: string]: unknown;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.babiespicks.com';

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [costs, setCosts] = useState<CostStats | null>(null);
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);

  const [productUrl, setProductUrl] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [productLoading, setProductLoading] = useState(false);

  const [batchUrls, setBatchUrls] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);

  const [contentType, setContentType] = useState<'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE'>('BEST_LIST');
  const [topic, setTopic] = useState('');
  const [slug, setSlug] = useState('');
  const [productIds, setProductIds] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contentLoading, setContentLoading] = useState(false);

  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchCosts = useCallback(async () => {
    setCostsLoading(true);
    setCostsError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/costs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCosts(data);
    } catch (err) {
      setCostsError(err instanceof Error ? err.message : 'Failed to load costs');
    } finally {
      setCostsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchCosts();
  }, [fetchStats, fetchCosts]);

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productUrl.trim()) return;
    setProductLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/pipeline/product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: productUrl.trim(),
          storeSlug: storeSlug.trim() || undefined,
        }),
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
        const [url, storeSlug] = line.split(/\s+/);
        return { url, storeSlug: storeSlug || undefined };
      });
      const res = await fetch(`${API_BASE}/admin/pipeline/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleContentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !slug.trim() || !productIds.trim()) return;
    setContentLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/pipeline/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const handleReset = async () => {
    setResetLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/data/reset`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setResult({ success: true, ...data });
      setShowResetConfirm(false);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset data');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-medium text-charcoal">الإحصائيات</h2>
          <p className="text-sm text-stone mt-1">نظرة عامة على بيانات المنصة</p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchCosts(); }}
          disabled={statsLoading || costsLoading}
          className="text-sm text-sage hover:text-sage-deep transition-colors disabled:opacity-50"
        >
          تحديث
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="المنتجات"
          value={stats?.products ?? '—'}
          loading={statsLoading}
          error={statsError && !stats ? statsError : undefined}
          accent="sage"
        />
        <StatCard
          label="التقييمات"
          value={stats?.verdicts ?? '—'}
          loading={statsLoading}
          error={undefined}
          accent="terracotta"
        />
        <StatCard
          label="صفحات المحتوى"
          value={stats?.contentPages ?? '—'}
          loading={statsLoading}
          error={undefined}
          accent="lavender"
        />
        <StatCard
          label="مهام الوكيل"
          value={stats?.agentJobs ?? '—'}
          loading={statsLoading}
          error={undefined}
          accent="charcoal"
        />
      </div>

      {/* Cost Tracking Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-medium text-charcoal">تتبع التكاليف</h3>
          <div className="flex items-center gap-3">
            {costsLoading && <span className="text-xs text-stone">جارٍ التحديث...</span>}
            <span className="text-xs text-stone">
              {costs
                ? `${costs.totalJobs} مهمة · ${costs.completedJobs} مكتملة · ${costs.failedJobs} فشلت`
                : '—'}
            </span>
          </div>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-charcoal/20 bg-charcoal/5 p-5">
            <p className="text-xs opacity-70">إجمالي التوكنز</p>
            <p className="text-2xl font-medium mt-1 tabular-nums">
              {costsLoading ? '—' : (costs?.totalTokens ?? 0).toLocaleString('en-US')}
            </p>
          </div>
          <div className="rounded-xl border border-terracotta/20 bg-terracotta/5 p-5">
            <p className="text-xs opacity-70">التكلفة الإجمالية</p>
            <p className="text-2xl font-medium mt-1 tabular-nums">
              {costsLoading ? '—' : costsError ? 'خطأ' : `$${(costs?.totalCostUsd ?? 0).toFixed(6)}`}
            </p>
          </div>
          <div className="rounded-xl border border-sage/20 bg-sage/5 p-5">
            <p className="text-xs opacity-70">نسبة النجاح</p>
            <p className="text-2xl font-medium mt-1 tabular-nums">
              {costsLoading || !costs ? '—' : costs.totalJobs > 0
                ? `${Math.round((costs.completedJobs / costs.totalJobs) * 100)}%`
                : '0%'}
            </p>
          </div>
          <div className="rounded-xl border border-lavender-border bg-lavender/5 p-5">
            <p className="text-xs opacity-70">المهام</p>
            <p className="text-2xl font-medium mt-1 tabular-nums">
              {costsLoading ? '—' : (costs?.totalJobs ?? 0).toLocaleString('en-US')}
            </p>
          </div>
        </div>

        {/* By Agent Table */}
        <div className="bg-cream rounded-xl p-6 hairline mb-6">
          <h4 className="text-sm font-medium text-charcoal mb-4">التفصيل حسب الوكيل</h4>
          {costsLoading ? (
            <p className="text-sm text-stone">جارٍ التحميل...</p>
          ) : costsError ? (
            <p className="text-sm text-red-600">{costsError}</p>
          ) : !costs?.byAgent.length ? (
            <p className="text-sm text-stone">لا توجد بيانات</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beige">
                    <th className="text-right text-xs text-stone font-normal pb-2">الوكيل</th>
                    <th className="text-left text-xs text-stone font-normal pb-2">التوكنز</th>
                    <th className="text-left text-xs text-stone font-normal pb-2">التكلفة</th>
                    <th className="text-left text-xs text-stone font-normal pb-2">المهام</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {costs.byAgent.map((row) => (
                    <tr key={row.agentType}>
                      <td className="py-2.5 text-charcoal font-medium">{row.agentType}</td>
                      <td className="py-2.5 text-charcoal tabular-nums">{row.tokens.toLocaleString('en-US')}</td>
                      <td className="py-2.5 text-charcoal tabular-nums">${row.costUsd.toFixed(6)}</td>
                      <td className="py-2.5 text-charcoal tabular-nums">{row.jobCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Last 7 Days */}
        {costs && costs.last7Days.length > 0 && (
          <div className="bg-cream rounded-xl p-6 hairline">
            <h4 className="text-sm font-medium text-charcoal mb-4">آخر 7 أيام</h4>
            <div className="flex items-end gap-2 h-24">
              {costs.last7Days.map((day) => {
                const maxTokens = Math.max(...costs.last7Days.map((d) => d.tokens), 1);
                const barHeight = (day.tokens / maxTokens) * 100;
                const dateObj = new Date(day.date);
                const dayLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full bg-sage/20 rounded-sm relative" style={{ height: `${barHeight}%`, minHeight: '4px' }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-sage rounded-sm"
                        style={{ height: `${barHeight}%` }}
                      />
                    </div>
                    <span className="text-xs text-stone text-center leading-tight">{dayLabel}</span>
                    <span className="text-xs text-charcoal tabular-nums">{day.tokens.toLocaleString('en-US')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Forms Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Product Pipeline */}
        <section className="bg-cream rounded-xl p-6 hairline">
          <h3 className="text-base font-medium text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-sage text-cream text-xs flex items-center justify-center">١</span>
            تشغيل خط منتجات
          </h3>
          <form onSubmit={handleProductSubmit} className="space-y-3">
            <div>
              <label htmlFor="product-url" className="block text-xs text-stone mb-1.5">رابط المنتج</label>
              <input
                id="product-url"
                type="url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="https://..."
                required
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>
            <div>
              <label htmlFor="store-slug" className="block text-xs text-stone mb-1.5">معرّف المتجر (اختياري)</label>
              <input
                id="store-slug"
                type="text"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                placeholder="jarir"
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>
            <button
              type="submit"
              disabled={productLoading || !productUrl.trim()}
              className="w-full rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {productLoading ? 'جارٍ التشغيل...' : 'تشغيل'}
            </button>
          </form>
        </section>

        {/* Batch Pipeline */}
        <section className="bg-cream rounded-xl p-6 hairline">
          <h3 className="text-base font-medium text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-sage text-cream text-xs flex items-center justify-center">٢</span>
            تشغيل خط دفعي
          </h3>
          <form onSubmit={handleBatchSubmit} className="space-y-3">
            <div>
              <label htmlFor="batch-urls" className="block text-xs text-stone mb-1.5">روابط المنتجات (واحدة لكل سطر)</label>
              <textarea
                id="batch-urls"
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
                placeholder="https://example.com/product1&#10;https://example.com/product2 jarir"
                rows={5}
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={batchLoading || !batchUrls.trim()}
              className="w-full rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchLoading ? 'جارٍ التشغيل...' : 'تشغيل الكل'}
            </button>
          </form>
        </section>

        {/* Content Pipeline */}
        <section className="bg-cream rounded-xl p-6 hairline">
          <h3 className="text-base font-medium text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-sage text-cream text-xs flex items-center justify-center">٣</span>
            تشغيل خط محتوى
          </h3>
          <form onSubmit={handleContentSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="content-type" className="block text-xs text-stone mb-1.5">النوع</label>
                <select
                  id="content-type"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value as typeof contentType)}
                  className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                >
                  <option value="BEST_LIST">قائمة أفضل</option>
                  <option value="PRODUCT_REVIEW">مراجعة منتج</option>
                  <option value="BUYING_GUIDE">دليل الشراء</option>
                </select>
              </div>
              <div>
                <label htmlFor="category-id" className="block text-xs text-stone mb-1.5">معرّف الفئة (اختياري)</label>
                <input
                  id="category-id"
                  type="text"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  placeholder="cat_xxx"
                  className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                />
              </div>
            </div>
            <div>
              <label htmlFor="topic" className="block text-xs text-stone mb-1.5">الموضوع</label>
              <input
                id="topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="أفضل حمّالات للأطفال"
                required
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>
            <div>
              <label htmlFor="content-slug" className="block text-xs text-stone mb-1.5">المُعرّف (slug)</label>
              <input
                id="content-slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="best-baby-carriers"
                required
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>
            <div>
              <label htmlFor="product-ids" className="block text-xs text-stone mb-1.5">معرّفات المنتجات (مفصولة بفواصل)</label>
              <input
                id="product-ids"
                type="text"
                value={productIds}
                onChange={(e) => setProductIds(e.target.value)}
                placeholder="prod_xxx, prod_yyy"
                required
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>
            <button
              type="submit"
              disabled={contentLoading || !topic.trim() || !slug.trim() || !productIds.trim()}
              className="w-full rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {contentLoading ? 'جارٍ التشغيل...' : 'تشغيل'}
            </button>
          </form>
        </section>

        {/* Reset Data */}
        <section className="bg-cream rounded-xl p-6 hairline">
          <h3 className="text-base font-medium text-charcoal mb-4 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-terracotta text-cream text-xs flex items-center justify-center">!</span>
            إعادة تعيين البيانات
          </h3>
          <p className="text-sm text-stone mb-4 leading-relaxed">
            حذف جميع المنتجات والتقييمات وصفحات المحتوى ومهام الوكيل. هذا الإجراء لا يمكن التراجع عنه.
          </p>
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full rounded-lg border border-terracotta text-terracotta hover:bg-terracotta hover:text-cream text-sm font-medium py-2.5 transition-colors"
            >
              إعادة تعيين البيانات
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-terracotta font-medium">هل أنت متأكد؟ لا يمكن التراجع عن هذا.</p>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  disabled={resetLoading}
                  className="flex-1 rounded-lg bg-terracotta hover:bg-terracotta/90 text-cream text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                >
                  {resetLoading ? 'جارٍ...' : 'نعم، احذف الكل'}
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  disabled={resetLoading}
                  className="flex-1 rounded-lg border border-beige text-stone hover:bg-linen text-sm font-medium py-2.5 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Results & Error Display */}
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {result && (
          <div className="rounded-xl bg-sage/5 border border-sage/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-sage" />
              <span className="text-sm font-medium text-sage-deep">نتيجة</span>
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

function StatCard({
  label,
  value,
  loading,
  error,
  accent,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  error?: string;
  accent: 'sage' | 'terracotta' | 'lavender' | 'charcoal';
}) {
  const accentMap = {
    sage: 'bg-sage/10 text-sage-deep border-sage/20',
    terracotta: 'bg-terracotta/10 text-terracotta border-terracotta/20',
    lavender: 'bg-lavender text-lavender-text border-lavender-border',
    charcoal: 'bg-charcoal/10 text-charcoal border-charcoal/20',
  };
  const classes = accentMap[accent];

  if (error) {
    return (
      <div className={`rounded-xl border p-5 ${classes}`}>
        <p className="text-xs opacity-70">{label}</p>
        <p className="text-xs mt-1 opacity-50">خطأ</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-2xl font-medium mt-1 tabular-nums">
        {loading ? '—' : value}
      </p>
    </div>
  );
}