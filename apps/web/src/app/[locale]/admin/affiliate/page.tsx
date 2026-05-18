'use client';

import { useState, useEffect, useCallback } from 'react';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const PERIODS = [
  { label: '7 أيام', value: 7 },
  { label: '30 يوم', value: 30 },
  { label: '90 يوم', value: 90 },
] as const;

export default function AffiliatePage() {
  const [days, setDays] = useState<number>(7);
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (period: number) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, topRes] = await Promise.all([
        fetch(`${API_BASE}/affiliate/stats?days=${period}`),
        fetch(`${API_BASE}/affiliate/top?limit=10`),
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

  useEffect(() => {
    fetchData(days);
  }, [fetchData, days]);

  const maxDailyClicks = stats?.daily?.length
    ? Math.max(...stats.daily.map((d) => d.clicks), 1)
    : 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">أداء الأفلييت</h1>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-linen rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                days === p.value
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-stone hover:text-charcoal'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 px-6 py-8 space-y-8 overflow-auto">

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="ti ti-alert-circle text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => fetchData(days)}
              className="mr-auto text-xs text-red-600 hover:text-red-800 underline"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Total Clicks */}
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">إجمالي النقرات</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
              {loading ? '—' : (stats?.totalClicks ?? 0).toLocaleString('en-US')}
            </p>
          </div>

          {/* Top Store */}
          <div className="bg-white rounded-xl border border-beige p-5">
            <p className="text-xs text-stone">أكثر المتاجر نقراً</p>
            <p className="text-xl font-medium text-charcoal mt-1 truncate">
              {loading
                ? '—'
                : stats?.byStore?.[0]?.store ?? '—'}
            </p>
            {!loading && stats?.byStore?.[0] && (
              <p className="text-xs text-stone mt-0.5 tabular-nums">
                {stats.byStore[0].clicks.toLocaleString('en-US')} نقرة
              </p>
            )}
          </div>

          {/* Active Stores */}
          <div className="bg-white rounded-xl border border-beige p-5 col-span-2 lg:col-span-1">
            <p className="text-xs text-stone">المتاجر النشطة</p>
            <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
              {loading ? '—' : (stats?.byStore?.length ?? 0)}
            </p>
          </div>
        </div>

        {/* Daily Trend */}
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
                const dateObj = new Date(day.date);
                const dayLabel = dateObj.toLocaleDateString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                });
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <span className="text-xs text-charcoal tabular-nums">
                      {day.clicks > 0 ? day.clicks : ''}
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div className="w-full h-full flex items-end relative" style={{ height: '120px' }}>
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-sage/20 rounded-sm"
                          style={{ height: '100%' }}
                        />
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-sage rounded-sm transition-all"
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-stone text-center leading-tight">{dayLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* By Store Table */}
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
                      <td className="py-3.5 px-4 tabular-nums text-charcoal">
                        {row.clicks.toLocaleString('en-US')}
                      </td>
                      <td className="py-3.5 pl-4 text-stone text-xs">
                        {row.lastClick
                          ? new Date(row.lastClick).toLocaleDateString('ar-SA', {
                              month: 'short',
                              day: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Products Table */}
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
                      <td className="py-3.5 pl-4 tabular-nums text-charcoal">
                        {product.clicks.toLocaleString('en-US')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Refresh button */}
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
    </div>
  );
}
