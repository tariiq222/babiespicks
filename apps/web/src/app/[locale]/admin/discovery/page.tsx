'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ProductDraftStatus =
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_EDIT'
  | 'PUBLISHED'
  | 'ARCHIVED';

type DraftAction = 'approve' | 'reject' | 'needs-edit';

interface ProductDraft {
  id: string;
  title: string;
  source?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  category?: string | null;
  discoveryReason?: string | null;
  trendScore?: number | null;
  demandSignal?: string | null;
  competitionSignal?: string | null;
  seasonalitySignal?: string | null;
  status: ProductDraftStatus | string;
  editNotes?: string | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface DraftStats {
  total: number;
  needsReview: number;
  approved: number;
  rejected: number;
  needsEdit: number;
  withSignals: number;
  averageScore: number | null;
  topSource: string | null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object';
}

function isProductDraft(value: unknown): value is ProductDraft {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

function extractDrafts(payload: unknown): ProductDraft[] {
  if (Array.isArray(payload)) {
    return payload.filter(isProductDraft);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.items, payload.data, payload.drafts];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isProductDraft);
    }
  }

  return [];
}

function makeIdempotencyKey(draftId: string, action: DraftAction): string {
  const randomPart =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : makeRandomIdempotencyPart();

  return `admin-discovery-${action}-${draftId}-${randomPart}`;
}

function makeRandomIdempotencyPart(): string {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36)).join('-');
  }

  return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function canTransition(status: string): boolean {
  return status === 'NEEDS_REVIEW' || status === 'NEEDS_EDIT';
}

function formatScore(score: number | null | undefined, locale: string): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '—';
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(score);
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getDraftUrl(draft: ProductDraft): string | null {
  return draft.canonicalUrl ?? draft.sourceUrl ?? null;
}

function getDraftSource(draft: ProductDraft): string | null {
  return draft.source ?? draft.sourceType ?? null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message;
  }

  return fallback;
}

export default function AdminDiscoveryPage() {
  const t = useTranslations('admin.discovery');
  const locale = useLocale();
  const [drafts, setDrafts] = useState<ProductDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const actionIdempotencyKeysRef = useRef<Map<string, string>>(new Map());

  const getActionIdempotencyKey = useCallback((draftId: string, action: DraftAction): string => {
    const actionKey = `${draftId}:${action}`;
    const existingKey = actionIdempotencyKeysRef.current.get(actionKey);

    if (existingKey) {
      return existingKey;
    }

    const nextKey = makeIdempotencyKey(draftId, action);
    actionIdempotencyKeysRef.current.set(actionKey, nextKey);
    return nextKey;
  }, []);

  const clearActionIdempotencyKey = useCallback((draftId: string, action: DraftAction) => {
    actionIdempotencyKeysRef.current.delete(`${draftId}:${action}`);
  }, []);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await adminFetch(`${API_BASE}/admin/product-drafts`);
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      setDrafts(extractDrafts(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchDrafts(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchDrafts]);

  const stats = useMemo<DraftStats>(() => {
    const numericScores = drafts
      .map((draft) => draft.trendScore)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

    const sourceCounts = new Map<string, number>();
    for (const draft of drafts) {
      const source = getDraftSource(draft);
      if (source) {
        sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      }
    }

    const topSource = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      total: drafts.length,
      needsReview: drafts.filter((draft) => draft.status === 'NEEDS_REVIEW').length,
      approved: drafts.filter((draft) => draft.status === 'APPROVED').length,
      rejected: drafts.filter((draft) => draft.status === 'REJECTED').length,
      needsEdit: drafts.filter((draft) => draft.status === 'NEEDS_EDIT').length,
      withSignals: drafts.filter(
        (draft) => draft.demandSignal || draft.competitionSignal || draft.seasonalitySignal,
      ).length,
      averageScore: numericScores.length
        ? numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length
        : null,
      topSource,
    };
  }, [drafts]);

  async function runAction(draft: ProductDraft, action: DraftAction) {
    const actionKey = `${draft.id}:${action}`;
    const idempotencyKey = getActionIdempotencyKey(draft.id, action);
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/product-drafts/${draft.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
        }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      if (isProductDraft(payload)) {
        setDrafts((current) => current.map((item) => (item.id === payload.id ? payload : item)));
      }

      clearActionIdempotencyKey(draft.id, action);
      showToast('success', t(`actionSuccess.${action}`));
      void fetchDrafts();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('actionFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-charcoal">{t('title')}</h1>
          <span className="text-xs text-stone bg-linen border border-beige rounded-full px-2 py-0.5">
            {t('eyebrow')}
          </span>
        </div>
        <button
          type="button"
          onClick={() => { void fetchDrafts(); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className={`ti ti-refresh text-sm ${loading ? 'animate-spin' : ''}`} />
          <span>{t('refresh')}</span>
        </button>
      </header>

      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-sage text-cream' : 'bg-terracotta text-cream'
          }`}
          role="status"
        >
          <span className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-alert-circle'} text-base`} />
          {toast.msg}
        </div>
      )}

      <main className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        <section className="bg-white rounded-xl border border-beige px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-sage/10 flex items-center justify-center flex-shrink-0">
            <span className="ti ti-radar-2 text-lg text-sage" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sage mb-1">{t('introKicker')}</p>
            <h2 className="text-lg font-semibold text-charcoal leading-snug">{t('introTitle')}</h2>
            <p className="text-sm text-stone leading-relaxed mt-2 max-w-3xl">{t('introBody')}</p>
          </div>
        </section>

        <section aria-label={t('statsLabel')} className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard icon="ti-package-import" label={t('stats.total')} value={stats.total} />
          <StatCard icon="ti-eye-check" label={t('stats.needsReview')} value={stats.needsReview} accent="sage" />
          <StatCard icon="ti-chart-line" label={t('stats.averageScore')} value={formatScore(stats.averageScore, locale)} />
          <StatCard icon="ti-sparkles" label={t('stats.withSignals')} value={stats.withSignals} accent="lavender" />
          <StatCard icon="ti-building-store" label={t('stats.topSource')} value={stats.topSource ?? t('notAvailable')} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="bg-white rounded-xl border border-beige overflow-hidden">
            <div className="px-5 py-4 border-b border-beige flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-charcoal">{t('draftsTitle')}</h2>
                <p className="text-xs text-stone mt-1">{t('draftsSubtitle')}</p>
              </div>
              <span className="text-xs text-stone bg-linen rounded-full px-3 py-1 tabular-nums">
                {stats.total}
              </span>
            </div>

            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('loadingTitle')} body={t('loadingBody')} />
            ) : error ? (
              <StateBlock icon="ti-alert-circle" title={t('errorTitle')} body={error}>
                <button
                  type="button"
                  onClick={() => { void fetchDrafts(); }}
                  className="rounded-lg bg-sage px-4 py-2 text-xs font-medium text-cream hover:bg-sage-deep transition-colors"
                >
                  {t('retry')}
                </button>
              </StateBlock>
            ) : drafts.length === 0 ? (
              <StateBlock icon="ti-inbox" title={t('emptyTitle')} body={t('emptyBody')} />
            ) : (
              <div className="divide-y divide-beige">
                {drafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    locale={locale}
                    actionLoading={actionLoading}
                    onAction={runAction}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="bg-white rounded-xl border border-beige p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="ti ti-chart-dots-3 text-sage" />
                <h2 className="text-sm font-semibold text-charcoal">{t('trendTitle')}</h2>
              </div>
              <div className="space-y-3">
                <TrendRow label={t('trend.reviewQueue')} value={stats.needsReview} />
                <TrendRow label={t('trend.needsEdit')} value={stats.needsEdit} />
                <TrendRow label={t('trend.approved')} value={stats.approved} />
                <TrendRow label={t('trend.rejected')} value={stats.rejected} />
              </div>
            </div>

            <div className="rounded-xl border border-sage/20 bg-sage/5 p-5">
              <div className="flex items-start gap-3">
                <span className="ti ti-info-circle text-sage mt-0.5" />
                <div>
                  <h3 className="text-xs font-semibold text-sage-deep">{t('scopeTitle')}</h3>
                  <p className="text-xs text-stone leading-relaxed mt-2">{t('scopeBody')}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent = 'stone',
}: {
  icon: string;
  label: string;
  value: string | number;
  accent?: 'sage' | 'lavender' | 'stone';
}) {
  const iconClass = {
    sage: 'text-sage',
    lavender: 'text-lavender-text',
    stone: 'text-stone',
  }[accent];

  return (
    <div className="bg-white rounded-xl border border-beige p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-stone">{label}</p>
        <span className={`ti ${icon} text-lg ${iconClass}`} />
      </div>
      <p className="text-2xl font-medium text-charcoal tabular-nums truncate">{value}</p>
    </div>
  );
}

function StateBlock({
  icon,
  title,
  body,
  children,
}: {
  icon: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-80 flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
      <span className={`ti ${icon} text-3xl text-stone/50`} />
      <div>
        <p className="text-sm font-medium text-charcoal">{title}</p>
        <p className="text-xs text-stone leading-relaxed mt-1 max-w-md">{body}</p>
      </div>
      {children}
    </div>
  );
}

function DraftCard({
  draft,
  locale,
  actionLoading,
  onAction,
}: {
  draft: ProductDraft;
  locale: string;
  actionLoading: string | null;
  onAction: (draft: ProductDraft, action: DraftAction) => void;
}) {
  const t = useTranslations('admin.discovery');
  const url = getDraftUrl(draft);
  const source = getDraftSource(draft);
  const isActionable = canTransition(draft.status);

  return (
    <article className="p-5 hover:bg-linen/40 transition-colors">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={draft.status} />
            {source && (
              <span className="inline-flex items-center gap-1 rounded-full bg-linen px-2.5 py-1 text-[11px] font-medium text-stone">
                <span className="ti ti-world-search text-xs" />
                {source}
              </span>
            )}
            {draft.category && (
              <span className="rounded-full bg-lavender/20 px-2.5 py-1 text-[11px] font-medium text-lavender-text">
                {draft.category}
              </span>
            )}
          </div>

          <div>
            <h3 className="text-base font-semibold text-charcoal leading-snug">{draft.title}</h3>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="mt-1 block text-xs text-sage hover:text-sage-deep underline-offset-2 hover:underline break-all text-left"
              >
                {url}
              </a>
            )}
          </div>

          {draft.discoveryReason && (
            <p className="rounded-xl bg-sage/5 border border-sage/10 px-4 py-3 text-sm text-charcoal leading-relaxed">
              {draft.discoveryReason}
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <SignalBox label={t('fields.demand')} value={draft.demandSignal} />
            <SignalBox label={t('fields.competition')} value={draft.competitionSignal} />
            <SignalBox label={t('fields.seasonality')} value={draft.seasonalitySignal} />
          </div>

          {(draft.editNotes || draft.rejectionReason) && (
            <p className="text-xs text-stone leading-relaxed">
              {draft.editNotes ?? draft.rejectionReason}
            </p>
          )}
        </div>

        <div className="xl:w-56 flex-shrink-0 space-y-3">
          <div className="rounded-xl bg-white border border-beige p-4">
            <p className="text-xs text-stone mb-1">{t('fields.trendScore')}</p>
            <p className="text-3xl font-semibold text-charcoal tabular-nums">
              {formatScore(draft.trendScore, locale)}
            </p>
            <p className="text-[10px] text-stone mt-2">
              {t('fields.updatedAt')}: {formatDate(draft.updatedAt ?? draft.createdAt, locale)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
            <ActionButton
              icon="ti-check"
              label={t('actions.approve')}
              loading={actionLoading === `${draft.id}:approve`}
              disabled={!isActionable || actionLoading !== null}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onAction(draft, 'approve')}
            />
            <ActionButton
              icon="ti-pencil"
              label={t('actions.needsEdit')}
              loading={actionLoading === `${draft.id}:needs-edit`}
              disabled={!isActionable || actionLoading !== null}
              className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
              onClick={() => onAction(draft, 'needs-edit')}
            />
            <ActionButton
              icon="ti-x"
              label={t('actions.reject')}
              loading={actionLoading === `${draft.id}:reject`}
              disabled={!isActionable || actionLoading !== null}
              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200"
              onClick={() => onAction(draft, 'reject')}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function SignalBox({ label, value }: { label: string; value?: string | null }) {
  const t = useTranslations('admin.discovery');

  return (
    <div className="rounded-xl border border-beige bg-white px-4 py-3">
      <p className="text-[10px] font-medium text-stone mb-1">{label}</p>
      <p className="text-xs text-charcoal leading-relaxed line-clamp-3">{value || t('notAvailable')}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('admin.discovery.status');
  const classes: Record<string, string> = {
    NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    NEEDS_EDIT: 'bg-lavender/20 text-lavender-text border-lavender/30',
    PUBLISHED: 'bg-sage/10 text-sage-deep border-sage/20',
    ARCHIVED: 'bg-stone/10 text-stone border-stone/20',
  };
  const knownStatus = status in classes;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        classes[status] ?? 'bg-linen text-stone border-beige'
      }`}
    >
      {knownStatus ? t(status) : status}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  className,
  onClick,
}: {
  icon: string;
  label: string;
  loading: boolean;
  disabled: boolean;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <span className={`ti ${loading ? 'ti-loader-2 animate-spin' : icon} text-sm`} />
      <span>{label}</span>
    </button>
  );
}

function TrendRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-linen/70 px-3 py-2">
      <span className="text-xs text-stone">{label}</span>
      <span className="text-sm font-semibold text-charcoal tabular-nums">{value}</span>
    </div>
  );
}
