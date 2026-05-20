'use client';

import { useState, useCallback, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { adminFetch } from '@/shared/lib/admin-fetch';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Run {
  id: string;
  name: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  input?: Record<string, unknown>;
  costUsd?: number | string;
  tokensUsed?: number;
  steps: Array<{
    id: string;
    stepName: string;
    status: string;
    createdAt: string;
    updatedAt?: string;
    completedAt?: string;
    error?: string;
  }>;
  events: Array<{ id: string; type: string; message: string; createdAt: string }>;
  artifacts: Array<{
    id: string;
    name: string;
    type: string;
    url?: string;
    size?: number;
    content?: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }>;
  costLogs: Array<{ id: string; model: string; costUsd: number | string; tokensUsed?: number; createdAt: string }>;
  approvals: Array<{ id: string; status: string; createdAt: string }>;
}

interface RunsResponse {
  data: Run[];
  nextCursor: string | null;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'الكل' },
  { value: 'PENDING', label: 'بانتظار' },
  { value: 'RUNNING', label: 'قيد التشغيل' },
  { value: 'COMPLETED', label: 'مكتمل' },
  { value: 'FAILED', label: 'فاشل' },
  { value: 'CANCELLED', label: 'ملغى' },
];

const RUN_TYPE_LABELS: Record<string, string> = {
  PRODUCT_PIPELINE: 'ذكاء المنتجات',
  CONTENT_PIPELINE: 'المحتوى',
  DISCOVERY: 'اكتشاف المنتجات',
  CONTENT_SPRINT: 'سبرنت المحتوى',
  MANUAL: 'يدوي',
};

/* ─── Status badge ───────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: Run['status'] }) {
  const map: Record<Run['status'], { cls: string; dot?: boolean }> = {
    PENDING: { cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
    RUNNING: { cls: 'bg-sage/10 text-sage-deep border border-sage/20' },
    COMPLETED: { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    FAILED: { cls: 'bg-red-50 text-red-600 border border-red-200' },
    CANCELLED: { cls: 'bg-stone-50 text-stone-600 border border-stone-200' },
  };
  const { cls, dot } = map[status] ?? { cls: 'bg-stone-50 text-stone-600 border border-stone-200' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full text-xs font-medium px-3 py-1 ${cls}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />}
      {status === 'PENDING' ? 'بانتظار' :
       status === 'RUNNING' ? 'قيد التشغيل' :
       status === 'COMPLETED' ? 'مكتمل' :
       status === 'FAILED' ? 'فاشل' :
       status === 'CANCELLED' ? 'ملغى' : status}
    </span>
  );
}

/* ─── Run type badge ─────────────────────────────────────────────────────── */

function TypeBadge({ type, input }: { type: string; input?: Record<string, unknown> }) {
  // SOCIAL_PIPELINE_UI maps to MANUAL + action=social_pipeline in the backend
  const isSocial = type === 'MANUAL' && (input as Record<string, unknown>)?.action === 'social_pipeline';
  const label = isSocial ? 'سوشيال ميديا' : (RUN_TYPE_LABELS[type] ?? type);
  return (
    <span className="inline-flex items-center rounded-lg text-xs font-medium px-2.5 py-1 bg-lavender/20 text-lavender-text border border-lavender-border/30">
      {label}
    </span>
  );
}

/* ─── Date formatter ─────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function AiOsRunsPage() {
  const [filter, setFilter] = useState('ALL');
  const [runs, setRuns] = useState<Run[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async (cursor: string | null = null) => {
    if (cursor === null) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      if (cursor) params.set('cursor', cursor);
      if (filter !== 'ALL') params.set('status', filter);
      const res = await adminFetch(`${API_BASE}/admin/ai-os/runs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: RunsResponse = await res.json();
      if (cursor === null) {
        setRuns(data.data ?? []);
      } else {
        setRuns((prev) => [...prev, ...(data.data ?? [])]);
      }
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل جلب البيانات');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter]);

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => { void fetchRuns(null); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterChange(newFilter: string) {
    setFilter(newFilter);
    setNextCursor(null);
    void fetchRuns(null);
  }

  const hasMore = nextCursor !== null;

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/ai-os" className="text-stone hover:text-charcoal transition-colors">
            <span className="ti ti-arrow-right text-sm" />
          </Link>
          <h1 className="text-sm font-medium text-charcoal">تشغيلات الذكاء الاصطناعي</h1>
          {!loading && (
            <span className="text-xs text-stone bg-linen border border-beige rounded-full px-2 py-0.5 tabular-nums">
              {runs.length}{hasMore ? '+' : ''} إجمالي
            </span>
          )}
        </div>
        <button
          onClick={() => { void fetchRuns(null); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className={`ti ti-refresh text-sm ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </header>

      <div className="flex-1 px-6 py-6 space-y-4 overflow-auto">

        {/* ── Filter bar ── */}
        <div className="bg-white rounded-xl border border-beige px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-stone flex-shrink-0">فلترة:</span>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFilterChange(opt.value)}
                className={`rounded-lg text-xs font-medium px-3 py-1.5 transition-colors ${
                  filter === opt.value
                    ? 'bg-sage text-cream'
                    : 'bg-linen text-stone hover:bg-beige hover:text-charcoal border border-beige'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error state ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="ti ti-alert-triangle text-red-500 text-lg" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button
              onClick={() => { void fetchRuns(null); }}
              className="text-xs text-red-700 underline hover:no-underline"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <span className="ti ti-loader-2 animate-spin text-sage text-2xl" />
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && runs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-xl bg-linen flex items-center justify-center">
              <span className="ti ti-list text-stone text-xl" />
            </div>
            <p className="text-sm text-stone">لا توجد تشغيلات</p>
            <Link
              href="/admin/ai-os"
              className="text-xs text-sage hover:underline flex items-center gap-1.5"
            >
              <span className="ti ti-plus text-sm" />
              بدء تشغيل جديد
            </Link>
          </div>
        )}

        {/* ── Table ── */}
        {!loading && !error && runs.length > 0 && (
          <div className="bg-white rounded-xl border border-beige overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                  <thead>
                  <tr className="border-b border-beige bg-linen/50">
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">الاسم</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">النوع</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">الحالة</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">الخطوة الحالية</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">تاريخ البدء</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4">التكلفة</th>
                    <th className="text-right text-xs text-stone font-normal py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {runs.map((run) => {
                    const currentStep = run.steps?.find((s) => s.status === 'RUNNING');
                    return (
                      <tr key={run.id} className="hover:bg-linen/30 transition-colors">
                        <td className="py-3 px-4">
                          <span className="text-xs text-charcoal font-medium truncate max-w-[140px] block">{run.name}</span>
                        </td>
                        <td className="py-3 px-4">
                          <TypeBadge type={run.type} input={run.input} />
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={run.status} />
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-stone truncate max-w-[160px] block">
                            {currentStep?.stepName ?? '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-stone tabular-nums">
                            {fmtDate(run.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {run.costUsd != null ? (
                            <span className="text-xs text-charcoal tabular-nums">
                              ${typeof run.costUsd === 'number' ? run.costUsd.toFixed(4) : Number(run.costUsd ?? 0).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-xs text-stone">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            href={`/admin/ai-os/runs/${run.id}`}
                            className="inline-flex items-center gap-1 text-xs text-sage hover:underline"
                          >
                            التفاصيل
                            <span className="ti ti-arrow-left text-[10px] flip-x" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {!loading && !error && hasMore && (
              <div className="border-t border-beige px-4 py-3 flex items-center justify-center">
                <button
                  onClick={() => { void fetchRuns(nextCursor); }}
                  disabled={loadingMore}
                  className="rounded-lg border border-beige bg-white text-stone hover:text-charcoal text-xs font-medium px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <span className="ti ti-loader-2 animate-spin text-sm" />
                      جارٍ التحميل...
                    </>
                  ) : (
                    <>
                      <span className="ti ti-arrow-down text-sm" />
                      تحميل المزيد
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
