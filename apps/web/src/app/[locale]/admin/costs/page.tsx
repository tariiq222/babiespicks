'use client';

import { useState, useEffect, useCallback } from 'react';

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

export default function CostsPage() {
  const [costs, setCosts] = useState<CostStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'tokens' | 'costUsd' | 'jobCount'>('tokens');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchCosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/costs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCosts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load costs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const successRate =
    costs && costs.totalJobs > 0
      ? Math.round((costs.completedJobs / costs.totalJobs) * 100)
      : 0;

  const maxDayTokens = costs?.last7Days.length
    ? Math.max(...costs.last7Days.map((d) => d.tokens), 1)
    : 1;

  const sortedAgents = costs?.byAgent
    ? [...costs.byAgent].sort((a, b) => {
        const aVal = a[sortKey] ?? 0;
        const bVal = b[sortKey] ?? 0;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      })
    : [];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">التكاليف</h1>
      </header>

      <div className="flex-1 px-6 py-8 space-y-8 overflow-auto">

        {/* Summary Cards */}
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

        {/* 7-Day Trend */}
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
            <div className="space-y-3">
              {/* Bar chart */}
              <div className="flex items-end gap-3 h-40">
                {costs.last7Days.map((day) => {
                  const barHeight = Math.max((day.tokens / maxDayTokens) * 100, 4);
                  const dateObj = new Date(day.date);
                  const dayLabel = dateObj.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'numeric',
                    day: 'numeric',
                  });
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-charcoal tabular-nums">
                        {day.tokens.toLocaleString('en-US')}
                      </span>
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
                      <span className="text-xs text-stone text-center leading-tight">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Agent Breakdown Table */}
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
                    <th
                      className="text-left text-xs text-stone font-normal pb-3 px-4 cursor-pointer select-none hover:text-charcoal"
                      onClick={() => handleSort('tokens')}
                    >
                      التوكنز
                      {sortKey === 'tokens' && (
                        <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      className="text-left text-xs text-stone font-normal pb-3 px-4 cursor-pointer select-none hover:text-charcoal"
                      onClick={() => handleSort('costUsd')}
                    >
                      التكلفة
                      {sortKey === 'costUsd' && (
                        <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th
                      className="text-left text-xs text-stone font-normal pb-3 pl-4 cursor-pointer select-none hover:text-charcoal"
                      onClick={() => handleSort('jobCount')}
                    >
                      عدد المهام
                      {sortKey === 'jobCount' && (
                        <span className="mr-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {sortedAgents.map((row) => (
                    <tr key={row.agentType} className="hover:bg-linen/50 transition-colors">
                      <td className="py-3.5 pr-4 font-medium text-charcoal">{row.agentType}</td>
                      <td className="py-3.5 px-4 tabular-nums text-charcoal">
                        {row.tokens.toLocaleString('en-US')}
                      </td>
                      <td className="py-3.5 px-4 tabular-nums text-charcoal">
                        ${row.costUsd.toFixed(6)}
                      </td>
                      <td className="py-3.5 pl-4 tabular-nums text-charcoal">{row.jobCount}</td>
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
            onClick={fetchCosts}
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