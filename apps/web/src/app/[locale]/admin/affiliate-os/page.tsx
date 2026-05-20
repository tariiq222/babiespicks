'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ProductDraftStatus =
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_EDIT'
  | 'PUBLISHED'
  | 'ARCHIVED';

type DraftAction = 'evaluate' | 'publish';
type ToastType = 'success' | 'error';

interface ProductDraft {
  id: string;
  title: string;
  status: ProductDraftStatus | string;
  trendScore?: number | null;
  createdAt?: string | null;
}

interface SocialPost {
  id: string;
  platform: string;
  status: string;
  content?: unknown;
  contentAr?: unknown;
  contentEn?: unknown;
  tweetsAr?: Array<{ text?: string }> | null;
  tweetsEn?: Array<{ text?: string }> | null;
  createdAt?: string | null;
}

interface AiRun {
  id: string;
  name: string;
  type: string;
  status: string;
  createdAt?: string | null;
}

interface DashboardData {
  drafts: ProductDraft[];
  approvedDrafts: ProductDraft[];
  socialPosts: SocialPost[];
  aiRuns: AiRun[];
  activeRuns: number;
  totalClicks: number;
  topProductName: string | null;
}

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  hint?: React.ReactNode;
}

interface ActionButtonProps {
  icon: string;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  title?: string;
  variant?: 'primary' | 'secondary';
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object';
}

function isProductDraft(value: unknown): value is ProductDraft {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string';
}

function isSocialPost(value: unknown): value is SocialPost {
  return isRecord(value) && typeof value.id === 'string' && typeof value.platform === 'string';
}

function isAiRun(value: unknown): value is AiRun {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function extractItems<T>(payload: unknown, guard: (value: unknown) => value is T): T[] {
  if (Array.isArray(payload)) {
    return payload.filter(guard);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.items, payload.data, payload.drafts, payload.runs];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(guard);
    }
  }

  return [];
}

function getNumericField(payload: unknown, path: string[]): number {
  let current: unknown = payload;
  for (const key of path) {
    if (!isRecord(current)) return 0;
    current = current[key];
  }

  return typeof current === 'number' && Number.isFinite(current) ? current : 0;
}

function getTopProductName(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.affiliate)) {
    return null;
  }

  const topProducts = payload.affiliate.topProducts;
  if (!Array.isArray(topProducts)) {
    return null;
  }

  const first = topProducts[0];
  if (!isRecord(first)) {
    return null;
  }

  if (typeof first.productName === 'string') {
    return first.productName;
  }

  if (typeof first.name === 'string') {
    return first.name;
  }

  return null;
}

function getResponseTotal(payload: unknown, fallback: number): number {
  if (isRecord(payload) && typeof payload.total === 'number') {
    return payload.total;
  }

  return fallback;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.message === 'string') {
    return payload.message;
  }

  return fallback;
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatScore(score: number | null | undefined, locale: string): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return '—';
  }

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(score);
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

function firstTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    for (const item of content) {
      const text = firstTextFromContent(item);
      if (text) return text;
    }
    return '';
  }

  if (isRecord(content)) {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.body === 'string') return content.body;
    if (typeof content.caption === 'string') return content.caption;
  }

  return '';
}

function getSocialPreview(post: SocialPost, locale: string): string {
  const localizedText =
    locale === 'ar'
      ? post.tweetsAr?.[0]?.text || firstTextFromContent(post.contentAr) || post.tweetsEn?.[0]?.text || firstTextFromContent(post.contentEn)
      : post.tweetsEn?.[0]?.text || firstTextFromContent(post.contentEn) || post.tweetsAr?.[0]?.text || firstTextFromContent(post.contentAr);
  const rawText = localizedText || firstTextFromContent(post.content);
  const text = rawText.trim();

  if (!text) {
    return '—';
  }

  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

function makeRandomIdempotencyPart(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(36)).join('-');
  }

  return `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function makeIdempotencyKey(draftId: string, action: DraftAction): string {
  return `affiliate-os-${action}-${draftId}-${makeRandomIdempotencyPart()}`.slice(0, 128);
}

function canEvaluateDraft(draft: ProductDraft): boolean {
  return draft.status === 'APPROVED';
}

function canPublishDraft(draft: ProductDraft): boolean {
  return draft.status === 'APPROVED';
}

export default function AffiliateOsPage() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [data, setData] = useState<DashboardData>({
    drafts: [],
    approvedDrafts: [],
    socialPosts: [],
    aiRuns: [],
    activeRuns: 0,
    totalClicks: 0,
    topProductName: null,
  });
  const [pendingSocialCount, setPendingSocialCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: ToastType; msg: string } | null>(null);
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

  const showToast = useCallback((type: ToastType, msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [draftsRes, approvedDraftsRes, socialRes, overviewRes, analyticsRes, aiRunsRes] =
        await Promise.all([
          adminFetch(`${API_BASE}/admin/product-drafts?limit=10`),
          adminFetch(`${API_BASE}/admin/product-drafts?status=APPROVED&limit=50`),
          adminFetch(`${API_BASE}/admin/approvals/social?status=PENDING_APPROVAL`),
          adminFetch(`${API_BASE}/admin/ai-os/overview`),
          adminFetch(`${API_BASE}/admin/analytics`),
          adminFetch(`${API_BASE}/admin/ai-os/runs?limit=5`),
        ]);

      const [draftsPayload, approvedDraftsPayload, socialPayload, overviewPayload, analyticsPayload, aiRunsPayload] =
        await Promise.all([
          draftsRes.json().catch(() => null),
          approvedDraftsRes.json().catch(() => null),
          socialRes.json().catch(() => null),
          overviewRes.json().catch(() => null),
          analyticsRes.json().catch(() => null),
          aiRunsRes.json().catch(() => null),
        ]);

      const failedResponse = [
        { response: draftsRes, payload: draftsPayload },
        { response: approvedDraftsRes, payload: approvedDraftsPayload },
        { response: socialRes, payload: socialPayload },
        { response: overviewRes, payload: overviewPayload },
        { response: analyticsRes, payload: analyticsPayload },
        { response: aiRunsRes, payload: aiRunsPayload },
      ].find(({ response }) => !response.ok);

      if (failedResponse) {
        throw new Error(
          getErrorMessage(failedResponse.payload, `HTTP ${failedResponse.response.status}`),
        );
      }

      const drafts = extractItems(draftsPayload, isProductDraft);
      const approvedDrafts = extractItems(approvedDraftsPayload, isProductDraft);
      const socialPosts = extractItems(socialPayload, isSocialPost);
      const aiRuns = extractItems(aiRunsPayload, isAiRun);

      setPendingSocialCount(getResponseTotal(socialPayload, socialPosts.length));
      setData({
        drafts,
        approvedDrafts,
        socialPosts: socialPosts.slice(0, 10),
        aiRuns,
        activeRuns: getNumericField(overviewPayload, ['aiOs', 'runsRunning']),
        totalClicks: getNumericField(analyticsPayload, ['affiliate', 'totalClicks']),
        topProductName: getTopProductName(analyticsPayload),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchAllData(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchAllData]);

  useEffect(() => {
    const interval = setInterval(() => { void fetchAllData(); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  async function runDraftAction(draft: ProductDraft, action: DraftAction) {
    const actionKey = `${draft.id}:${action}`;
    const idempotencyKey = getActionIdempotencyKey(draft.id, action);
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/product-drafts/${draft.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      clearActionIdempotencyKey(draft.id, action);
      showToast('success', t('actionCompleted'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runSocialAction(postId: string, action: 'approve') {
    const actionKey = `${postId}:${action}`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/social/${postId}/${action}`, {
        method: 'POST',
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t('actionCompleted'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePublishApprovedProducts() {
    setActionLoading('publish-approved-products');

    try {
      let successCount = 0;
      let failureCount = 0;
      let firstFailureReason: string | null = null;

      for (const draft of data.approvedDrafts) {
        try {
          const idempotencyKey = getActionIdempotencyKey(draft.id, 'publish');
          const res = await adminFetch(`${API_BASE}/admin/product-drafts/${draft.id}/publish`, {
            method: 'POST',
            body: JSON.stringify({ idempotencyKey }),
          });
          const payload: unknown = await res.json().catch(() => null);

          if (res.ok) {
            successCount++;
            clearActionIdempotencyKey(draft.id, 'publish');
          } else {
            failureCount++;
            firstFailureReason ??= getErrorMessage(payload, `HTTP ${res.status}`);
          }
        } catch (err) {
          failureCount++;
          firstFailureReason ??= err instanceof Error ? err.message : t('loadFailed');
        }
      }

      const countsMessage = `${t('publishedCount')}: ${formatNumber(successCount, locale)} — ${t('failedCount')}: ${formatNumber(failureCount, locale)}`;
      showToast(
        failureCount === 0 ? 'success' : 'error',
        firstFailureReason ? `${countsMessage} — ${t('firstFailureReason')}: ${firstFailureReason}` : countsMessage,
      );
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  const pendingDraftsCount = data.drafts.filter((draft) => draft.status === 'NEEDS_REVIEW').length;
  const isBusy = loading || actionLoading !== null;

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">{t('affiliateOs')}</h1>
        <button
          type="button"
          onClick={() => { void fetchAllData(); }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span aria-hidden="true" className={`ti ti-refresh text-sm ${loading ? 'animate-spin' : ''}`} />
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
          <span aria-hidden="true" className={`ti ${toast.type === 'success' ? 'ti-check' : 'ti-alert-circle'} text-base`} />
          {toast.msg}
        </div>
      )}

      <main className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        {error && (
          <section className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="ti ti-alert-circle text-red-600 text-lg flex-shrink-0" />
              <p className="text-sm text-red-700 truncate">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => { void fetchAllData(); }}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 transition-colors"
            >
              {t('retry')}
            </button>
          </section>
        )}

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            icon="ti-package-import"
            label={t('pendingDrafts')}
            value={`${formatNumber(pendingDraftsCount, locale)} / ${formatNumber(data.approvedDrafts.length, locale)}`}
            hint={t('approvedDrafts')}
          />
          <StatCard
            icon="ti-brand-x"
            label={t('pendingSocial')}
            value={formatNumber(pendingSocialCount, locale)}
          />
          <StatCard
            icon="ti-brain"
            label={t('activeRuns')}
            value={formatNumber(data.activeRuns, locale)}
          />
          <StatCard
            icon="ti-click"
            label={t('totalClicks')}
            value={formatNumber(data.totalClicks, locale)}
            hint={data.topProductName ? <>{t('topProduct')}: <bdi dir="auto">{data.topProductName}</bdi></> : undefined}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel
            title={t('productDrafts')}
            icon="ti-package-import"
            footerHref="/admin/discovery"
            footerLabel={t('viewAll')}
            dir={dir}
          >
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.drafts.length === 0 ? (
              <StateBlock icon="ti-inbox" title={t('noDrafts')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('product')}</TableHeader>
                      <TableHeader>{t('status')}</TableHeader>
                      <TableHeader>{t('trendScore')}</TableHeader>
                      <TableHeader>{t('actions')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {data.drafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-linen/40 transition-colors">
                        <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-72 truncate">
                          <bdi dir="auto">{draft.title}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={draft.status} />
                        </td>
                        <td className="px-4 py-3 text-charcoal tabular-nums">
                          {formatScore(draft.trendScore, locale)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ActionButton
                              icon="ti-sparkles"
                              label={t('evaluate')}
                              loading={actionLoading === `${draft.id}:evaluate`}
                              disabled={isBusy || !canEvaluateDraft(draft)}
                              title={!canEvaluateDraft(draft) ? t('actionUnavailable') : undefined}
                              onClick={() => { void runDraftAction(draft, 'evaluate'); }}
                            />
                            <ActionButton
                              icon="ti-send"
                              label={t('publish')}
                              loading={actionLoading === `${draft.id}:publish`}
                              disabled={isBusy || !canPublishDraft(draft)}
                              title={!canPublishDraft(draft) ? t('actionUnavailable') : undefined}
                              onClick={() => { void runDraftAction(draft, 'publish'); }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title={t('socialPosts')}
            icon="ti-messages"
            footerHref="/admin/approvals"
            footerLabel={t('viewAll')}
            dir={dir}
          >
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.socialPosts.length === 0 ? (
              <StateBlock icon="ti-brand-x" title={t('noSocialPosts')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('platform')}</TableHeader>
                      <TableHeader>{t('preview')}</TableHeader>
                      <TableHeader>{t('status')}</TableHeader>
                      <TableHeader>{t('actions')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {data.socialPosts.map((post) => (
                      <tr key={post.id} className="hover:bg-linen/40 transition-colors">
                        <td className="px-4 py-3 text-charcoal font-medium"><bdi dir="auto">{post.platform}</bdi></td>
                        <td className="px-4 py-3 text-stone text-xs min-w-56 max-w-72 truncate" dir="auto">
                          <bdi dir="auto">{getSocialPreview(post, locale)}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={post.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ActionButton
                              icon="ti-check"
                              label={t('approve')}
                              loading={actionLoading === `${post.id}:approve`}
                              disabled={isBusy}
                              onClick={() => { void runSocialAction(post.id, 'approve'); }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </section>

        <section className="bg-white rounded-xl border border-beige overflow-hidden">
          <div className="px-5 py-4 border-b border-beige flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="ti ti-activity text-sage" />
              <h2 className="text-sm font-semibold text-charcoal">{t('aiActivity')}</h2>
            </div>
            <Link href="/admin/ai-os/runs" className="text-xs text-sage hover:text-sage-deep transition-colors">
              {t('viewAll')}
            </Link>
          </div>

          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.aiRuns.length === 0 ? (
            <StateBlock icon="ti-brain" title={t('noAiRuns')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-beige bg-linen/50">
                    <TableHeader>{t('name')}</TableHeader>
                    <TableHeader>{t('type')}</TableHeader>
                    <TableHeader>{t('status')}</TableHeader>
                    <TableHeader>{t('createdAt')}</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {data.aiRuns.map((run) => (
                    <tr key={run.id} className="hover:bg-linen/40 transition-colors">
                      <td className="px-4 py-3 text-charcoal font-medium"><bdi dir="auto">{run.name}</bdi></td>
                      <td className="px-4 py-3 text-stone"><bdi dir="auto">{run.type}</bdi></td>
                      <td className="px-4 py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-stone text-xs tabular-nums">
                        {formatDate(run.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-beige p-5">
          <div className="flex items-center gap-2 mb-4">
            <span aria-hidden="true" className="ti ti-bolt text-sage" />
            <h2 className="text-sm font-semibold text-charcoal">{t('quickActions')}</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionButton
              icon="ti-package-export"
              label={t('publishApprovedProducts')}
              loading={actionLoading === 'publish-approved-products'}
              disabled={isBusy || data.approvedDrafts.length === 0}
              title={data.approvedDrafts.length === 0 ? t('actionUnavailable') : undefined}
              variant="primary"
              onClick={() => { void handlePublishApprovedProducts(); }}
            />
            <ActionButton
              icon="ti-refresh"
              label={t('refreshAll')}
              loading={loading}
              disabled={isBusy}
              onClick={() => { void fetchAllData(); }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-beige p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-stone">{label}</p>
        <span aria-hidden="true" className={`ti ${icon} text-lg text-sage`} />
      </div>
      <p className="text-2xl font-medium text-charcoal tabular-nums truncate">{value}</p>
      {hint && <p className="text-[10px] text-stone mt-1.5 truncate">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  icon,
  footerHref,
  footerLabel,
  dir,
  children,
}: {
  title: string;
  icon: string;
  footerHref: '/admin/discovery' | '/admin/approvals';
  footerLabel: string;
  dir: 'rtl' | 'ltr';
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-beige overflow-hidden">
      <div className="px-5 py-4 border-b border-beige flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`ti ${icon} text-sage`} />
          <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        </div>
      </div>
      {children}
      <div className="px-5 py-3 border-t border-beige">
        <Link
          href={footerHref}
          className="inline-flex items-center gap-1 text-xs text-sage hover:text-sage-deep transition-colors"
        >
          <span>{footerLabel}</span>
          <span aria-hidden="true" className={`ti ${dir === 'rtl' ? 'ti-chevron-left' : 'ti-chevron-right'} text-xs`} />
        </Link>
      </div>
    </div>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th scope="col" className="px-4 py-3 text-start text-xs font-medium text-stone whitespace-nowrap">{children}</th>;
}

function StateBlock({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="min-h-48 flex flex-col items-center justify-center text-center gap-3 px-6 py-10">
      <span aria-hidden="true" className={`ti ${icon} text-3xl text-stone/50`} />
      <p className="text-sm text-stone">{title}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('admin');
  const classes: Record<string, string> = {
    NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    PUBLISHED: 'bg-blue-50 text-blue-700 border-blue-200',
    SCHEDULED: 'bg-blue-50 text-blue-700 border-blue-200',
    RUNNING: 'bg-sage/10 text-sage-deep border-sage/20',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    NEEDS_EDIT: 'bg-lavender/20 text-lavender-text border-lavender/30',
    ARCHIVED: 'bg-stone/10 text-stone border-stone/20',
    CANCELLED: 'bg-stone/10 text-stone border-stone/20',
  };

  const labels: Record<string, string> = {
    NEEDS_REVIEW: t('statusNeedsReview'),
    PENDING_APPROVAL: t('statusPendingApproval'),
    PENDING: t('statusPending'),
    APPROVED: t('statusApproved'),
    COMPLETED: t('statusCompleted'),
    PUBLISHED: t('statusPublished'),
    SCHEDULED: t('statusScheduled'),
    RUNNING: t('statusRunning'),
    REJECTED: t('statusRejected'),
    FAILED: t('statusFailed'),
    NEEDS_EDIT: t('statusNeedsEdit'),
    ARCHIVED: t('statusArchived'),
    CANCELLED: t('statusCancelled'),
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
        classes[status] ?? 'bg-linen text-stone border-beige'
      }`}
    >
      {labels[status] ?? t('statusUnknown')}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  title,
  variant = 'secondary',
}: ActionButtonProps) {
  const classes =
    variant === 'primary'
      ? 'bg-sage hover:bg-sage-deep text-cream border border-sage'
      : 'bg-linen hover:bg-beige text-charcoal border border-beige';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      <span aria-hidden="true" className={`ti ${loading ? 'ti-loader-2 animate-spin' : icon} text-sm`} />
      <span>{label}</span>
    </button>
  );
}
