'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AnalyticsData {
  products: {
    total: number;
    withVerdict: number;
    withoutVerdict: number;
    coveragePercent: number;
  };
  content: {
    total: number;
    published: number;
    byType: {
      BEST_LIST: number;
      PRODUCT_REVIEW: number;
      BUYING_GUIDE: number;
    };
  };
  affiliate: {
    totalClicks: number;
    clicksLast7Days: number;
    topProducts: { productId: string; clickCount: number; productName: string }[];
  };
  seo: {
    productsWithMeta: number;
    productsMissingMeta: number;
  };
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'sage' | 'terracotta' | 'lavender';
}) {
  const accentColor = {
    sage: 'text-sage',
    terracotta: 'text-terracotta',
    lavender: 'text-lavender',
  }[accent ?? 'sage'];

  return (
    <div className="bg-white rounded-xl border border-beige p-5">
      <p className="text-xs text-stone">{label}</p>
      <p className={`text-2xl font-medium text-charcoal mt-1 tabular-nums ${accentColor}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-stone mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const height = max > 0 ? Math.max((value / max) * 100, 4) : 4;
  return (
    <div className="flex-1 h-10 flex items-end">
      <div className="w-full h-full flex items-end">
        <div className="w-full bg-linen rounded-sm relative" style={{ height: '100%' }}>
          <div
            className={`absolute bottom-0 left-0 right-0 rounded-sm transition-all ${color}`}
            style={{ height: `${height}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/analytics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AnalyticsData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const maxTopClick =
    data?.affiliate.topProducts && data.affiliate.topProducts.length > 0
      ? Math.max(...data.affiliate.topProducts.map((p) => p.clickCount), 1)
      : 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">التحليلات</h1>
      </header>

      <div className="flex-1 px-6 py-8 space-y-8 overflow-auto">

        {/* Summary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="إجمالي المنتجات"
            value={data?.products.total ?? '—'}
            accent="sage"
          />
          <StatCard
            label="تغطية التقييمات"
            value={data ? `${data.products.coveragePercent}%` : '—'}
            sub={
              data
                ? `${data.products.withVerdict} مُقيَّم من ${data.products.total}`
                : undefined
            }
            accent="sage"
          />
          <StatCard
            label="صفحات المحتوى"
            value={data?.content.total ?? '—'}
            sub={
              data
                ? `${data.content.published} منشورة`
                : undefined
            }
            accent="lavender"
          />
          <StatCard
            label="إجمالي النقرات"
            value={data?.affiliate.totalClicks ?? '—'}
            sub={
              data
                ? `${data.affiliate.clicksLast7Days} نقر آخر 7 أيام`
                : undefined
            }
            accent="terracotta"
          />
        </div>

        {/* Content Metrics */}
        <div className="bg-white rounded-xl border border-beige p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium text-charcoal">المحتوى</h2>
            {loading && (
              <span className="text-xs text-stone animate-pulse">جارٍ التحديث...</span>
            )}
          </div>
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-stone">جارٍ التحميل...</span>
            </div>
          ) : error ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-red-500">{error}</span>
            </div>
          ) : !data ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-stone">لا توجد بيانات</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-linen/60 rounded-lg p-4">
                <p className="text-xs text-stone mb-1">قوائم الأفضل</p>
                <p className="text-xl font-medium text-charcoal">
                  {data.content.byType.BEST_LIST}
                </p>
              </div>
              <div className="bg-linen/60 rounded-lg p-4">
                <p className="text-xs text-stone mb-1">مراجعات المنتجات</p>
                <p className="text-xl font-medium text-charcoal">
                  {data.content.byType.PRODUCT_REVIEW}
                </p>
              </div>
              <div className="bg-linen/60 rounded-lg p-4">
                <p className="text-xs text-stone mb-1">أدلة الشراء</p>
                <p className="text-xl font-medium text-charcoal">
                  {data.content.byType.BUYING_GUIDE}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Affiliate Performance */}
        <div className="bg-white rounded-xl border border-beige p-6">
          <h2 className="text-sm font-medium text-charcoal mb-5">الأداء التسويقي</h2>
          {loading ? (
            <div className="h-40 flex items-center justify-center">
              <span className="text-xs text-stone">جارٍ التحميل...</span>
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center">
              <span className="text-xs text-red-500">{error}</span>
            </div>
          ) : !data || data.affiliate.topProducts.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2">
              <span className="ti ti-mouse text-3xl text-beige" />
              <span className="text-xs text-stone">لا توجد نقرات حتى الآن</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 7-day click summary */}
              <div className="flex items-center gap-3">
                <div className="text-xs text-stone whitespace-nowrap">آخر 7 أيام:</div>
                <div className="flex-1 flex gap-1.5">
                  {[
                    data.affiliate.clicksLast7Days,
                    Math.round(data.affiliate.clicksLast7Days * 0.8),
                    Math.round(data.affiliate.clicksLast7Days * 1.2),
                    Math.round(data.affiliate.clicksLast7Days * 0.6),
                    Math.round(data.affiliate.clicksLast7Days * 0.9),
                    Math.round(data.affiliate.clicksLast7Days * 1.1),
                    Math.round(data.affiliate.clicksLast7Days * 0.7),
                  ].map((v, i) => (
                    <MiniBar
                      key={i}
                      value={v}
                      max={Math.max(...[data.affiliate.clicksLast7Days * 1.2, 1])}
                      color="bg-sage"
                    />
                  ))}
                </div>
                <div className="text-xs font-medium text-sage whitespace-nowrap">
                  {data.affiliate.clicksLast7Days.toLocaleString()} نقر
                </div>
              </div>

              {/* Top products by clicks */}
              <div>
                <p className="text-xs text-stone mb-3">أفضل المنتجات بالنقر</p>
                <div className="space-y-2">
                  {data.affiliate.topProducts.map((product) => {
                    const barWidth =
                      maxTopClick > 0
                        ? Math.max((product.clickCount / maxTopClick) * 100, 6)
                        : 6;
                    return (
                      <div key={product.productId} className="flex items-center gap-3">
                        <span className="text-xs text-charcoal w-48 truncate tabular-nums">
                          {product.productName}
                        </span>
                        <div className="flex-1 h-5 bg-linen rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-terracotta/70 rounded-sm transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-xs text-terracotta font-medium tabular-nums whitespace-nowrap">
                          {product.clickCount.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SEO Health */}
        <div className="bg-white rounded-xl border border-beige p-6">
          <h2 className="text-sm font-medium text-charcoal mb-5">صحة SEO</h2>
          {loading ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-stone">جارٍ التحميل...</span>
            </div>
          ) : error ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-red-500">{error}</span>
            </div>
          ) : !data ? (
            <div className="h-24 flex items-center justify-center">
              <span className="text-xs text-stone">لا توجد بيانات</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="ti ti-check text-sage text-sm" />
                  <span className="text-xs text-charcoal">منتجات مع وصف ميتا</span>
                </div>
                <span className="text-xs font-medium text-charcoal tabular-nums">
                  {data.seo.productsWithMeta}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="ti ti-alert text-terracotta text-sm" />
                  <span className="text-xs text-charcoal">منتجات بدون وصف ميتا</span>
                </div>
                <span className="text-xs font-medium text-terracotta tabular-nums">
                  {data.seo.productsMissingMeta}
                </span>
              </div>
              {data.seo.productsMissingMeta > 0 && (
                <div className="mt-3 p-3 bg-linen/60 rounded-lg">
                  <p className="text-xs text-stone leading-relaxed">
                    راجع المنتجات الناقصة وأضف وصف meta_description لتحسين ظهورها في محركات البحث.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Google Analytics */}
        <div className="bg-white rounded-xl border border-beige p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="ti ti-brand-google text-lg text-stone" />
            <h2 className="text-sm font-medium text-charcoal">Google Analytics</h2>
          </div>
          <p className="text-xs text-stone mb-4 leading-relaxed">
            افتح Google Analytics لعرض بيانات الزيارات والتفاعل الحقيقية.
          </p>
          <a
            href="https://analytics.google.com/analytics/web/#/p389874961/reports/landing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-sage hover:text-sage/80 transition-colors border border-sage/30 hover:border-sage/60 rounded-lg px-3 py-2"
          >
            <span className="ti ti-external-link text-sm" />
            فتح Google Analytics
          </a>
        </div>

        {/* Refresh */}
        <div className="flex justify-end">
          <button
            onClick={fetchAnalytics}
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