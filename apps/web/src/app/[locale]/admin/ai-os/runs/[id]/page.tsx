'use client';

import { useState, useCallback, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { use } from 'react';
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
  error?: string;
  costUsd?: number;
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
    content?: string;
    metadata?: Record<string, unknown>;
    url?: string;
    size?: number;
    createdAt: string;
  }>;
  costLogs: Array<{
    id: string;
    model: string;
    costUsd: number | string;
    tokensUsed?: number;
    createdAt: string;
  }>;
  approvals: Array<{ id: string; status: string; createdAt: string }>;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار',
  RUNNING: 'قيد التشغيل',
  COMPLETED: 'مكتمل',
  FAILED: 'فاشل',
  CANCELLED: 'ملغى',
};

const RUN_TYPE_LABELS: Record<string, string> = {
  PRODUCT_PIPELINE: 'ذكاء المنتجات',
  CONTENT_PIPELINE: 'المحتوى',
  DISCOVERY: 'اكتشاف المنتجات',
  CONTENT_SPRINT: 'سبرنت المحتوى',
  MANUAL: 'يدوي',
};

/** Returns the display label for a run, including special handling for social_pipeline. */
function getRunTypeLabel(type: string, input?: Record<string, unknown>): string {
  if (type === 'MANUAL' && input?.action === 'social_pipeline') {
    return 'سوشيال ميديا';
  }
  return RUN_TYPE_LABELS[type] ?? type;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ar-SA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(ms?: number) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

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
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StepStatusDot({ status }: { status: string }) {
  if (status === 'COMPLETED')
    return <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />;
  if (status === 'FAILED')
    return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />;
  if (status === 'RUNNING')
    return <span className="w-2 h-2 rounded-full bg-sage animate-pulse flex-shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-stone/30 flex-shrink-0" />;
}

/* ─── Section card ─────────────────────────────────────────────────────────── */

function Card({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-beige overflow-hidden">
      <div className="px-5 py-3.5 border-b border-beige flex items-center gap-2.5">
        <span className={`ti ${icon} text-sm text-sage`} />
        <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

interface Props {
  params: Promise<{ id: string }>;
}

export default function AiOsRunDetailPage({ params }: Props) {
  const { id } = use(params);

  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const fetchRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/ai-os/runs/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRun(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل جلب البيانات');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => { void fetchRun(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCancel() {
    if (!run) return;
    if (!['PENDING', 'RUNNING'].includes(run.status)) return;
    setCancelling(true);
    setToast(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/ai-os/runs/${id}/cancel`, {
        method: 'PATCH',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setToast({ type: 'success', msg: 'تم إلغاء التشغيل ✅' });
      void fetchRun();
    } catch (err) {
      setToast({
        type: 'error',
        msg: err instanceof Error ? err.message : 'حدث خطأ أثناء الإلغاء',
      });
    } finally {
      setCancelling(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  async function handleEnqueue() {
    if (!run) return;
    if (run.status !== 'PENDING') return;
    setEnqueuing(true);
    setToast(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/ai-os/runs/${id}/enqueue`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setToast({ type: 'success', msg: 'تم إدخال التشغيل في الطابور ✅' });
      void fetchRun();
    } catch (err) {
      setToast({
        type: 'error',
        msg: err instanceof Error ? err.message : 'حدث خطأ أثناء الإدخال في الطابور',
      });
    } finally {
      setEnqueuing(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const canEnqueue = run && run.status === 'PENDING';
  const canCancel = run && ['PENDING', 'RUNNING'].includes(run.status);

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/ai-os/runs" className="text-stone hover:text-charcoal transition-colors">
            <span className="ti ti-arrow-right text-sm" />
          </Link>
          <h1 className="text-sm font-medium text-charcoal">تفاصيل التشغيل</h1>
          {run && (
            <span className="text-xs font-mono text-stone bg-linen border border-beige rounded px-2 py-0.5">
              {run.id.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {canEnqueue && (
            <button
              onClick={handleEnqueue}
              disabled={enqueuing}
              className="flex items-center gap-1.5 text-xs text-sage hover:text-sage-deep transition-colors disabled:opacity-50"
            >
              <span className={`ti ti-queue text-sm ${enqueuing ? 'animate-spin' : ''}`} />
              {enqueuing ? 'جارٍ الإدخال...' : 'إدخال في الطابور'}
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
            >
              <span className={`ti ti-x text-sm ${cancelling ? 'animate-spin' : ''}`} />
              {cancelling ? 'جارٍ الإلغاء...' : 'إلغاء التشغيل'}
            </button>
          )}
          <button
            onClick={() => { void fetchRun(); }}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
          >
            <span className={`ti ti-refresh text-sm ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </header>

      {/* Disclaimer — real vs placeholder execution */}
      {run && run.status === 'PENDING' && (
        <div className={`flex items-start gap-2 rounded-lg px-6 py-2 mx-6 mt-2 ${
          run.type === 'PRODUCT_PIPELINE' || run.type === 'CONTENT_PIPELINE' || run.type === 'DISCOVERY' || (run.type === 'MANUAL' && (run.input as Record<string, unknown>)?.action === 'social_pipeline')
            ? 'bg-sage/5 border border-sage/20'
            : 'bg-amber-50/60 border border-amber-200'
        }`}>
          <span className={`ti ti-info-circle text-xs mt-0.5 flex-shrink-0 ${
            run.type === 'PRODUCT_PIPELINE' || run.type === 'CONTENT_PIPELINE' || run.type === 'DISCOVERY' || (run.type === 'MANUAL' && (run.input as Record<string, unknown>)?.action === 'social_pipeline') ? 'text-sage' : 'text-amber-600'
          }`} />
          <p className={`text-[10px] leading-relaxed ${
            run.type === 'PRODUCT_PIPELINE' || run.type === 'CONTENT_PIPELINE' || run.type === 'DISCOVERY' || (run.type === 'MANUAL' && (run.input as Record<string, unknown>)?.action === 'social_pipeline') ? 'text-sage-deep' : 'text-amber-700'
          }`}>
            {run.type === 'PRODUCT_PIPELINE'
              ? 'تشغيل ذكاء المنتجات ينتظر في الطابور — خط المنتجات الحقيقي سيُنفَّذ: جلب بيانات المنتج، تحليل المراجعات، وإصدار Verdict.'
              : run.type === 'CONTENT_PIPELINE'
              ? 'تشغيل المحتوى ينتظر في الطابور — خط المحتوى الحقيقي سيُنفَّذ: الخطة SEO، كتابة المحتوى ثنائي اللغة، تدقيق SEO، وضمان الجودة.'
              : run.type === 'DISCOVERY'
              ? 'تشغيل اكتشاف المنتجات ينتظر في الطابور — سيبحث فعلياً في Amazon/Noon حسب الإعدادات، مع تشغيلات مجدولة يومياً: Amazon 3 صباحاً وNoon 10 صباحاً.'
              : (run.type === 'MANUAL' && (run.input as Record<string, unknown>)?.action === 'social_pipeline')
              ? 'تشغيل السوشيال ميديا ينتظر في الطابور — خط السوشيال ينشئ منشورات X/Twitter وتيليجرام.'
              : 'تشغيلات سبرنت المحتوى/الوسائط فقط ما زالت placeholder. خطوط المنتجات، المحتوى، الاكتشاف، والسوشيال ميديا مُنَفَّذة فعلياً.'}
          </p>
        </div>
      )}

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

      <div className="flex-1 px-6 py-6 space-y-5 overflow-auto">

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <span className="ti ti-loader-2 animate-spin text-sage text-2xl" />
              <p className="text-xs text-stone">جارٍ جلب البيانات...</p>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="ti ti-alert-triangle text-red-500 text-lg" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button
              onClick={() => { void fetchRun(); }}
              className="text-xs text-red-700 underline hover:no-underline"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* ── Run not found ── */}
        {!loading && !error && !run && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-12 h-12 rounded-xl bg-linen flex items-center justify-center">
              <span className="ti ti-search text-stone text-xl" />
            </div>
            <p className="text-sm text-stone">التشغيل غير موجود</p>
            <Link href="/admin/ai-os/runs" className="text-xs text-sage hover:underline">
              العودة لقائمة التشغيلات
            </Link>
          </div>
        )}

        {/* ── Content ── */}
        {run && (
          <>
            {/* ── Meta bar ── */}
            <div className="bg-white rounded-xl border border-beige px-5 py-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="ti ti-brain text-sage" />
                <span className="text-sm font-medium text-charcoal">{run.name}</span>
              </div>
              <div className="h-5 w-px bg-beige hidden sm:block" />
              <span className="text-xs text-stone">
                {getRunTypeLabel(run.type, run.input)}
              </span>
              <div className="h-5 w-px bg-beige hidden sm:block" />
              <StatusBadge status={run.status} />
              <div className="h-5 w-px bg-beige hidden sm:block" />
              <div className="flex items-center gap-1.5 text-xs text-stone">
                <span className="ti ti-calendar text-sm" />
                <span>بدأ: {fmtDate(run.createdAt)}</span>
              </div>
              {run.startedAt && run.startedAt !== run.createdAt && (
                <>
                  <div className="h-5 w-px bg-beige hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-xs text-stone">
                    <span className="ti ti-player-play text-sm" />
                    <span>شُغّل: {fmtDate(run.startedAt)}</span>
                  </div>
                </>
              )}
              {run.completedAt && (
                <>
                  <div className="h-5 w-px bg-beige hidden sm:block" />
                  <div className="flex items-center gap-1.5 text-xs text-stone">
                    <span className="ti ti-check text-sm" />
                    <span>انتهى: {fmtDate(run.completedAt)}</span>
                  </div>
                </>
              )}
            </div>

            {/* ── Error banner ── */}
            {run.error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <span className="ti ti-alert-triangle text-red-500 text-lg flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 mb-0.5">خطأ في التشغيل</p>
                  <p className="text-xs text-red-600">{run.error}</p>
                </div>
              </div>
            )}

            {/* ── Timeline steps ── */}
            {run.steps && run.steps.length > 0 && (
              <Card icon="ti-git-branch" title="الخطوات">
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute start-4 top-0 bottom-0 w-px bg-beige" />

                  <div className="space-y-0">
                    {run.steps.map((step, idx) => {
                      const isLast = idx === run.steps.length - 1;
                      return (
                        <div key={step.id ?? idx} className="relative flex items-start gap-4 pb-4">
                          {/* Dot */}
                          <div className="relative z-10 w-8 h-8 rounded-full bg-white border border-beige flex items-center justify-center flex-shrink-0">
                            <StepStatusDot status={step.status} />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-1">
                            <div className="flex items-center flex-wrap gap-2 mb-1">
                              <p className="text-sm font-medium text-charcoal">{step.stepName}</p>
                              {step.error && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-red-600 bg-red-50 rounded-full px-2 py-0.5">
                                  <span className="ti ti-alert-triangle" />
                                  {step.error}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-[10px] text-stone">
                              {step.createdAt && (
                                <span className="flex items-center gap-1">
                                  <span className="ti ti-player-play text-[9px]" />
                                  {fmtDate(step.createdAt)}
                                </span>
                              )}
                              {step.completedAt && (
                                <span className="flex items-center gap-1">
                                  <span className="ti ti-check text-[9px]" />
                                  {fmtDate(step.completedAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}

            {/* ── Cost ── */}
            {run.costLogs && run.costLogs.length > 0 && (
              <Card icon="ti-coin" title="التكلفة">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-linen rounded-lg p-4">
                    <p className="text-xs text-stone mb-1">التوكنز</p>
                    <p className="text-lg font-semibold text-charcoal tabular-nums">
                      {run.tokensUsed != null
                        ? run.tokensUsed.toLocaleString('en-US')
                        : run.costLogs.reduce((sum, l) => sum + (l.tokensUsed ?? 0), 0).toLocaleString('en-US')}
                    </p>
                  </div>
                  <div className="bg-linen rounded-lg p-4">
                    <p className="text-xs text-stone mb-1">التكلفة (USD)</p>
                    <p className="text-lg font-semibold text-charcoal tabular-nums sar">
                      ${Number(run.costUsd ?? run.costLogs.reduce((sum, l) => sum + Number(l.costUsd ?? 0), 0)).toFixed(6)}
                    </p>
                  </div>
                  {run.costLogs.length === 1 && run.costLogs[0].model && (
                    <div className="col-span-2 bg-linen rounded-lg p-4">
                      <p className="text-xs text-stone mb-1">نموذج الذكاء الاصطناعي</p>
                      <p className="text-sm font-medium text-charcoal font-mono">{run.costLogs[0].model}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* ── Artifacts ── */}
            {run.artifacts && run.artifacts.length > 0 && (
              <Card icon="ti-file-3d" title="المخرجات">
                <div className="space-y-2">
                  {run.artifacts.map((art, idx) => (
                    <div
                      key={art.id ?? idx}
                      className="flex items-center gap-3 p-3 bg-linen rounded-lg"
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-beige flex items-center justify-center flex-shrink-0">
                        <span className={`ti ${art.type === 'IMAGE' ? 'ti-photo' : 'ti-file-text'} text-sm text-stone`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-charcoal truncate">{art.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-stone">
                          <span>{art.type}</span>
                          {art.size && <span>—</span>}
                          {art.size && (
                            <span>
                              {art.size < 1024
                                ? `${art.size}B`
                                : art.size < 1024 * 1024
                                ? `${(art.size / 1024).toFixed(0)}KB`
                                : `${(art.size / 1024 / 1024).toFixed(1)}MB`}
                            </span>
                          )}
                          {art.createdAt && <span>— {fmtDate(art.createdAt)}</span>}
                        </div>
                      </div>
                      {art.url && (
                        <a
                          href={art.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-sage hover:underline flex-shrink-0"
                        >
                          <span className="ti ti-download text-sm" />
                          تحميل
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Events log ── */}
            {run.events && run.events.length > 0 && (
              <Card icon="ti-activity" title="سجل الأحداث">
                <div className="space-y-1.5 max-h-80 overflow-y-auto no-scrollbar">
                  {run.events.map((evt, idx) => (
                    <div key={evt.id ?? idx} className="flex items-start gap-3 text-xs">
                      <span className="text-stone tabular-nums flex-shrink-0 mt-0.5 font-mono text-[10px]">
                        {new Date(evt.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] flex-shrink-0 ${
                        evt.type === 'ERROR' ? 'bg-red-50 text-red-600' :
                        evt.type === 'WARNING' ? 'bg-amber-50 text-amber-700' :
                        'bg-linen text-stone border border-beige'
                      }`}>
                        {evt.type}
                      </span>
                      <p className="text-charcoal leading-relaxed flex-1">{evt.message}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Config ── */}
            {run.input && Object.keys(run.input).length > 0 && (
              <Card icon="ti-settings-2" title="إعدادات التشغيل">
                <pre className="text-xs text-charcoal bg-linen rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
                  {JSON.stringify(run.input, null, 2)}
                </pre>
              </Card>
            )}

          </>
        )}

      </div>
    </div>
  );
}
