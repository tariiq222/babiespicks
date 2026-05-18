'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [costs, setCosts] = useState<CostStats | null>(null);
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);

  const [pageTitle, setPageTitle] = useState('لوحة التحكم');

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

  const handleRefresh = () => {
    fetchStats();
    fetchCosts();
  };

  const successRate =
    costs && costs.totalJobs > 0
      ? Math.round((costs.completedJobs / costs.totalJobs) * 100)
      : 0;

  const maxDayTokens = costs?.last7Days.length
    ? Math.max(...costs.last7Days.map((d) => d.tokens), 1)
    : 1;

  return (
    <div className="min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-sm font-medium text-charcoal">{pageTitle}</h1>
          <button
            onClick={handleRefresh}
            disabled={statsLoading || costsLoading}
            className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
          >
            <span className="ti ti-refresh text-sm" />
            <span>تحديث</span>
          </button>
        </header>

        {/* Page content */}
        <div className="flex-1 px-6 py-8 space-y-8 overflow-auto">

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="المنتجات"
              value={stats?.products ?? '—'}
              icon="ti-package"
              loading={statsLoading}
              error={statsError && !stats ? statsError : undefined}
              accent="sage"
            />
            <StatCard
              label="التقييمات"
              value={stats?.verdicts ?? '—'}
              icon="ti-star"
              loading={statsLoading}
              error={undefined}
              accent="terracotta"
            />
            <StatCard
              label="صفحات المحتوى"
              value={stats?.contentPages ?? '—'}
              icon="ti-file-text"
              loading={statsLoading}
              error={undefined}
              accent="lavender"
            />
            <StatCard
              label="مهام الوكيل"
              value={stats?.agentJobs ?? '—'}
              icon="ti-cpu"
              loading={statsLoading}
              error={undefined}
              accent="charcoal"
            />
          </div>

          {/* Cost Summary */}
          <section>
            <h2 className="text-base font-medium text-charcoal mb-4">خلاصة التكاليف</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-beige p-5">
                <p className="text-xs text-stone">إجمالي التوكنز</p>
                <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
                  {costsLoading ? '—' : (costs?.totalTokens ?? 0).toLocaleString('en-US')}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-beige p-5">
                <p className="text-xs text-stone">التكلفة الإجمالية</p>
                <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
                  {costsLoading ? '—' : costsError ? 'خطأ' : `$${(costs?.totalCostUsd ?? 0).toFixed(6)}`}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-beige p-5">
                <p className="text-xs text-stone">نسبة النجاح</p>
                <p className="text-2xl font-medium text-charcoal mt-1 tabular-nums">
                  {costsLoading || !costs ? '—' : `${successRate}%`}
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
                  {costsLoading ? '—' : (costs?.totalJobs ?? 0).toLocaleString('en-US')}
                </p>
              </div>
            </div>
          </section>

          {/* 7-Day Chart + Agent Table */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Last 7 days chart */}
            <div className="bg-white rounded-xl border border-beige p-6">
              <h3 className="text-sm font-medium text-charcoal mb-4">آخر 7 أيام</h3>
              {costsLoading ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-stone">جارٍ التحميل...</span>
                </div>
              ) : costsError ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-red-500">{costsError}</span>
                </div>
              ) : !costs?.last7Days.length ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-stone">لا توجد بيانات</span>
                </div>
              ) : (
                <div className="flex items-end gap-2 h-28">
                  {costs.last7Days.map((day) => {
                    const barHeight = Math.max((day.tokens / maxDayTokens) * 100, 4);
                    const dateObj = new Date(day.date);
                    const dayLabel = dateObj.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'numeric',
                      day: 'numeric',
                    });
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                        <div className="w-full h-full flex items-end">
                          <div
                            className="w-full bg-sage/20 rounded-sm relative"
                            style={{ height: '100%' }}
                          >
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-sage rounded-sm transition-all"
                              style={{ height: `${barHeight}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] text-stone text-center leading-tight">{dayLabel}</span>
                        <span className="text-[10px] text-charcoal tabular-nums">
                          {day.tokens.toLocaleString('en-US')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Agent breakdown */}
            <div className="bg-white rounded-xl border border-beige p-6">
              <h3 className="text-sm font-medium text-charcoal mb-4">تفصيل الوكلاء</h3>
              {costsLoading ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-stone">جارٍ التحميل...</span>
                </div>
              ) : costsError ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-red-500">{costsError}</span>
                </div>
              ) : !costs?.byAgent.length ? (
                <div className="h-28 flex items-center justify-center">
                  <span className="text-xs text-stone">لا توجد بيانات</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-beige">
                        <th className="text-right text-stone font-normal pb-2 pr-3">الوكيل</th>
                        <th className="text-left text-stone font-normal pb-2 px-2">التوكنز</th>
                        <th className="text-left text-stone font-normal pb-2 px-2">التكلفة</th>
                        <th className="text-left text-stone font-normal pb-2 pl-3">المهام</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige">
                      {costs.byAgent.map((row) => (
                        <tr key={row.agentType}>
                          <td className="py-2.5 pr-3 font-medium text-charcoal">{row.agentType}</td>
                          <td className="py-2.5 px-2 tabular-nums text-charcoal">
                            {row.tokens.toLocaleString('en-US')}
                          </td>
                          <td className="py-2.5 px-2 tabular-nums text-charcoal">${row.costUsd.toFixed(6)}</td>
                          <td className="py-2.5 pl-3 tabular-nums text-charcoal">{row.jobCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/pipeline"
              className="inline-flex items-center gap-2 rounded-xl bg-sage hover:bg-sage-deep text-cream text-sm font-medium px-5 py-2.5 transition-colors"
            >
              <span className="ti ti-robot text-base" />
              تشغيل خط الإنتاج
            </Link>
            <Link
              href="/admin/costs"
              className="inline-flex items-center gap-2 rounded-xl border border-beige hover:border-charcoal text-charcoal text-sm font-medium px-5 py-2.5 transition-colors bg-white"
            >
              <span className="ti ti-chart-bar text-base" />
              عرض التكاليف
            </Link>
          </div>

        </div>
      </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  loading,
  error,
  accent,
}: {
  label: string;
  value: string | number;
  icon: string;
  loading: boolean;
  error?: string;
  accent: 'sage' | 'terracotta' | 'lavender' | 'charcoal';
}) {
  const iconBg: Record<string, string> = {
    sage: 'bg-sage/10 text-sage',
    terracotta: 'bg-terracotta/10 text-terracotta',
    lavender: 'bg-lavender/10 text-lavender',
    charcoal: 'bg-charcoal/10 text-charcoal',
  };

  return (
    <div className="bg-white rounded-xl border border-beige p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-stone">{label}</p>
        <span className={`ti ${icon} text-lg ${iconBg[accent] ?? ''}`} />
      </div>
      <p className="text-2xl font-medium text-charcoal tabular-nums">
        {loading ? '—' : error ? 'خطأ' : value}
      </p>
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}