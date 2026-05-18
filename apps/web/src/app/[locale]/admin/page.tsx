'use client';

import { useState, useEffect, useCallback } from 'react';
import { Link } from '@/i18n/navigation';
import { adminFetch } from '@/shared/lib/admin-fetch';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  products: number;
  verdicts: number;
  contentPages: number;
  agentJobs: number;
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

interface CircuitBreaker {
  name: string;
  isTripped: boolean;
  tripCount: number;
}

interface ApprovalItem {
  status: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const CB_NAME_MAP: Record<string, string> = {
  cost: 'التكلفة',
  failure: 'الفشل المتتالي',
  rate: 'معدل التشغيل',
};

function cbLabel(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(CB_NAME_MAP)) {
    if (lower.includes(key)) return val;
  }
  return name;
}

function todayCost(last7Days: CostStats['last7Days']): number {
  const today = new Date().toISOString().slice(0, 10);
  return last7Days.find((d) => d.date.slice(0, 10) === today)?.costUsd ?? 0;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [costs, setCosts] = useState<CostStats | null>(null);
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);

  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);
  const [breakersLoading, setBreakersLoading] = useState(true);

  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const [resetingBreaker, setResetingBreaker] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/stats`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'فشل');
    }
  }, []);

  const fetchCosts = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/costs`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCosts(await res.json());
    } catch (err) {
      setCostsError(err instanceof Error ? err.message : 'فشل');
    }
  }, []);

  const fetchBreakers = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/circuit-breakers`);
      if (res.ok) {
        const data: CircuitBreaker[] = await res.json().catch(() => []);
        setBreakers(Array.isArray(data) ? data : []);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals`);
      if (res.ok) {
        const data: ApprovalItem[] | { items?: ApprovalItem[] } = await res.json().catch(() => []);
        const items: ApprovalItem[] = Array.isArray(data) ? data : (data.items ?? []);
        setPendingCount(items.filter((i) => i.status === 'PENDING_APPROVAL').length);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchAll = useCallback(() => {
    fetchStats();
    fetchCosts();
    fetchBreakers();
    fetchApprovals();
  }, [fetchStats, fetchCosts, fetchBreakers, fetchApprovals]);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchStats(), fetchCosts(), fetchBreakers()]);
    })().finally(() => {
        setStatsLoading(false);
        setCostsLoading(false);
        setBreakersLoading(false);
      });
    const interval = setInterval(() => {
      void fetchStats();
      void fetchCosts();
      void fetchBreakers();
      void fetchApprovals();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchCosts, fetchBreakers, fetchApprovals]);

  // ── Toast ─────────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Reset circuit breaker ─────────────────────────────────────────────────

  async function handleResetBreaker(name: string) {
    setResetingBreaker(name);
    try {
      const res = await adminFetch(`${API_BASE}/admin/circuit-breakers/${name}/reset`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast('success', `تمت إعادة تعيين ${cbLabel(name)} ✅`);
      await fetchBreakers();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setResetingBreaker(null);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const anyTripped = breakers.some((b) => b.isTripped);
  const maxDayTokens = costs?.last7Days.length
    ? Math.max(...costs.last7Days.map((d) => d.tokens), 1)
    : 1;
  const isLoading = statsLoading || costsLoading;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">لوحة القيادة</h1>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className={`ti ti-refresh text-sm ${isLoading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </header>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-sage text-cream' : 'bg-terracotta text-cream'
          }`}
        >
          <span className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-x'} text-base`} />
          {toast.msg}
        </div>
      )}

      <div className="flex-1 px-6 py-6 space-y-6 overflow-auto">

        {/* ── Row 1: Status Bar ── */}
        <div className="bg-white rounded-xl border border-beige px-5 py-4 flex items-center gap-4 flex-wrap">
          {/* Overall health pill */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                breakersLoading ? 'bg-stone/30' : anyTripped ? 'bg-red-400' : 'bg-emerald-400'
              }`}
            />
            <span className="text-sm font-medium text-charcoal">
              {breakersLoading ? '—' : anyTripped ? 'يوجد خلل في الحماية' : 'النظام سليم'}
            </span>
          </div>

          <div className="h-5 w-px bg-beige hidden sm:block" />

          {/* Circuit breaker pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {breakersLoading ? (
              <span className="text-xs text-stone">جارٍ التحميل...</span>
            ) : breakers.length === 0 ? (
              <span className="text-xs text-stone">لا توجد بيانات</span>
            ) : (
              breakers.map((b) => (
                <div key={b.name} className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${
                      b.isTripped
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    <span className={`ti ${b.isTripped ? 'ti-alert-triangle' : 'ti-check'} text-xs`} />
                    {cbLabel(b.name)}
                  </span>
                  {b.isTripped && (
                    <button
                      onClick={() => handleResetBreaker(b.name)}
                      disabled={resetingBreaker === b.name}
                      className="text-[10px] text-stone hover:text-charcoal underline disabled:opacity-50 transition-colors"
                    >
                      إعادة تعيين
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Row 2: Today's Numbers ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pending approvals */}
          <Link href="/admin/approvals" className="block group">
            <div className="bg-white rounded-xl border border-beige p-5 transition-colors group-hover:border-sage/40">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-stone">بانتظار الموافقة</p>
                <span className="ti ti-clipboard-check text-lg text-sage/60" />
              </div>
              <p className="text-2xl font-medium text-charcoal tabular-nums">
                {pendingCount === null ? '—' : pendingCount}
              </p>
              <p className="text-[10px] text-sage mt-1.5 group-hover:underline">عرض الموافقات ←</p>
            </div>
          </Link>

          {/* Today's cost */}
          <div className="bg-white rounded-xl border border-beige p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone">تكلفة اليوم</p>
              <span className="ti ti-coin text-lg text-terracotta/60" />
            </div>
            <p className="text-2xl font-medium text-charcoal tabular-nums">
              {costsLoading
                ? '—'
                : costsError
                ? 'خطأ'
                : `$${todayCost(costs?.last7Days ?? []).toFixed(4)}`}
            </p>
            <p className="text-[10px] text-stone mt-1.5">
              إجمالي: {costsLoading ? '—' : `$${(costs?.totalCostUsd ?? 0).toFixed(4)}`}
            </p>
          </div>

          {/* New products */}
          <div className="bg-white rounded-xl border border-beige p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone">المنتجات</p>
              <span className="ti ti-package text-lg text-lavender-text/60" />
            </div>
            <p className="text-2xl font-medium text-charcoal tabular-nums">
              {statsLoading ? '—' : statsError ? 'خطأ' : (stats?.products ?? 0).toLocaleString('en-US')}
            </p>
            <p className="text-[10px] text-stone mt-1.5">
              تقييمات: {statsLoading ? '—' : (stats?.verdicts ?? 0).toLocaleString('en-US')}
            </p>
          </div>

          {/* Published content */}
          <div className="bg-white rounded-xl border border-beige p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-stone">محتوى منشور</p>
              <span className="ti ti-file-text text-lg text-charcoal/40" />
            </div>
            <p className="text-2xl font-medium text-charcoal tabular-nums">
              {statsLoading ? '—' : statsError ? 'خطأ' : (stats?.contentPages ?? 0).toLocaleString('en-US')}
            </p>
            <p className="text-[10px] text-stone mt-1.5">
              مهام الوكيل: {statsLoading ? '—' : (stats?.agentJobs ?? 0).toLocaleString('en-US')}
            </p>
          </div>
        </div>

        {/* ── Row 3: Pipeline Activity ── */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Last 7 days chart */}
          <div className="bg-white rounded-xl border border-beige p-6">
            <h3 className="text-sm font-medium text-charcoal mb-4">آخر 7 أيام — التوكنز</h3>
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
                  const dayLabel = new Date(day.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'numeric',
                    day: 'numeric',
                  });
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full h-full flex items-end">
                        <div className="w-full bg-sage/10 rounded-sm relative" style={{ height: '100%' }}>
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
                <button onClick={fetchCosts} className="text-xs text-sage underline">
                  إعادة المحاولة
                </button>
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
                      <tr key={row.agentName}>
                        <td className="py-2.5 pr-3 font-medium text-charcoal">{row.agentName}</td>
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

        {/* ── Row 4: Quick Actions ── */}
        <div className="bg-white rounded-xl border border-beige px-5 py-4">
          <p className="text-xs text-stone mb-3">إجراءات سريعة</p>
          <div className="flex flex-wrap gap-3">
            <QuickAction
              href="/admin/operations"
              icon="ti-radar-2"
              label="اكتشاف منتجات"
              variant="primary"
            />
            <QuickAction
              href="/admin/operations"
              icon="ti-pencil"
              label="توليد محتوى"
              variant="secondary"
            />
            <QuickAction
              href="/admin/approvals"
              icon="ti-clipboard-check"
              label="مراجعة الموافقات"
              variant="secondary"
              badge={pendingCount && pendingCount > 0 ? pendingCount : undefined}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function QuickAction({
  href,
  icon,
  label,
  variant,
  badge,
}: {
  href: string;
  icon: string;
  label: string;
  variant: 'primary' | 'secondary';
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-xl text-sm font-medium px-5 py-2.5 transition-colors ${
        variant === 'primary'
          ? 'bg-sage hover:bg-sage-deep text-cream'
          : 'border border-beige hover:border-charcoal text-charcoal bg-white'
      }`}
    >
      <span className={`ti ${icon} text-base`} />
      {label}
      {badge !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 rounded-full text-[10px] font-semibold px-1.5 bg-white/30 tabular-nums">
          {badge}
        </span>
      )}
    </Link>
  );
}
