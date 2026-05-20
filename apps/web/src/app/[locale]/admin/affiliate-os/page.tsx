'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { adminFetch } from '@/shared/lib/admin-fetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PRODUCT_DRAFT_PAGE_SIZE = 100;

type ProductDraftStatus =
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_EDIT'
  | 'PUBLISHED'
  | 'ARCHIVED';

type DraftAction = 'approve' | 'reject' | 'needs-edit';
type ContentAction = 'approve' | 'schedule' | 'revise' | 'reject';
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

interface ContentApproval {
  id: string;
  slug?: string | null;
  type?: string | null;
  status: string;
  titleAr?: string | null;
  titleEn?: string | null;
  seoScore?: number | null;
  qualityScore?: number | null;
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
  contentApprovals: ContentApproval[];
  socialPosts: SocialPost[];
  aiRuns: AiRun[];
  activeRuns: number;
  totalClicks: number;
  topProductName: string | null;
}

interface DraftPaginationState {
  offset: number;
  hasMore: boolean;
  loadingMore: boolean;
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
  variant?: 'primary' | 'secondary' | 'danger';
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

function isContentApproval(value: unknown): value is ContentApproval {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
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

function getDefaultScheduleDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.toISOString();
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
      ? post.tweetsAr?.[0]?.text ||
        firstTextFromContent(post.contentAr) ||
        post.tweetsEn?.[0]?.text ||
        firstTextFromContent(post.contentEn)
      : post.tweetsEn?.[0]?.text ||
        firstTextFromContent(post.contentEn) ||
        post.tweetsAr?.[0]?.text ||
        firstTextFromContent(post.contentAr);
  const rawText = localizedText || firstTextFromContent(post.content);
  const text = rawText.trim();

  if (!text) {
    return '—';
  }

  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

function getContentTitle(item: ContentApproval, locale: string): string {
  const title = locale === 'ar' ? item.titleAr || item.titleEn : item.titleEn || item.titleAr;
  return title || item.slug || item.id;
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
  return `affiliate-os-approval-${action}-${draftId}-${makeRandomIdempotencyPart()}`.slice(0, 128);
}

function canReviewDraft(draft: ProductDraft): boolean {
  return draft.status === 'NEEDS_REVIEW' || draft.status === 'NEEDS_EDIT';
}

function canReviewContent(item: ContentApproval): boolean {
  return item.status === 'PENDING_APPROVAL' || item.status === 'QUALITY_CHECK' || item.status === 'REVISION_REQUESTED';
}

export default function AffiliateOsPage() {
  const t = useTranslations('admin');
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const [data, setData] = useState<DashboardData>({
    drafts: [],
    contentApprovals: [],
    socialPosts: [],
    aiRuns: [],
    activeRuns: 0,
    totalClicks: 0,
    topProductName: null,
  });
  const [pendingSocialCount, setPendingSocialCount] = useState(0);
  const [draftPagination, setDraftPagination] = useState<DraftPaginationState>({
    offset: 0,
    hasMore: false,
    loadingMore: false,
  });
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
      const [draftsRes, contentRes, socialRes, overviewRes, analyticsRes, aiRunsRes] =
        await Promise.all([
          adminFetch(`${API_BASE}/admin/product-drafts?limit=${PRODUCT_DRAFT_PAGE_SIZE}&offset=0`),
          adminFetch(`${API_BASE}/admin/approvals`),
          adminFetch(`${API_BASE}/admin/approvals/social?status=PENDING_APPROVAL`),
          adminFetch(`${API_BASE}/admin/ai-os/overview`),
          adminFetch(`${API_BASE}/admin/analytics`),
          adminFetch(`${API_BASE}/admin/ai-os/runs?limit=5`),
        ]);

      const [draftsPayload, contentPayload, socialPayload, overviewPayload, analyticsPayload, aiRunsPayload] =
        await Promise.all([
          draftsRes.json().catch(() => null),
          contentRes.json().catch(() => null),
          socialRes.json().catch(() => null),
          overviewRes.json().catch(() => null),
          analyticsRes.json().catch(() => null),
          aiRunsRes.json().catch(() => null),
        ]);

      const failedResponse = [
        { response: draftsRes, payload: draftsPayload },
        { response: contentRes, payload: contentPayload },
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
      const contentApprovals = extractItems(contentPayload, isContentApproval).filter(canReviewContent);
      const socialPosts = extractItems(socialPayload, isSocialPost);
      const aiRuns = extractItems(aiRunsPayload, isAiRun);

      setPendingSocialCount(getResponseTotal(socialPayload, socialPosts.length));
      setDraftPagination({
        offset: drafts.length,
        hasMore: drafts.length === PRODUCT_DRAFT_PAGE_SIZE,
        loadingMore: false,
      });
      setData({
        drafts,
        contentApprovals,
        socialPosts,
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

  async function loadMoreDrafts() {
    const nextOffset = draftPagination.offset;
    setDraftPagination((current) => ({ ...current, loadingMore: true }));

    try {
      const res = await adminFetch(
        `${API_BASE}/admin/product-drafts?limit=${PRODUCT_DRAFT_PAGE_SIZE}&offset=${nextOffset}`,
      );
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      const nextDrafts = extractItems(payload, isProductDraft);
      setData((current) => ({
        ...current,
        drafts: [...current.drafts, ...nextDrafts],
      }));
      setDraftPagination({
        offset: nextOffset + nextDrafts.length,
        hasMore: nextDrafts.length === PRODUCT_DRAFT_PAGE_SIZE,
        loadingMore: false,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
      setDraftPagination((current) => ({ ...current, loadingMore: false }));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchAllData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAllData]);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchAllData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  async function runDraftAction(draft: ProductDraft, action: DraftAction) {
    const actionKey = `product:${draft.id}:${action}`;
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
      showToast('success', t(`productApprovalSuccess.${action}`));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runContentAction(item: ContentApproval, action: ContentAction) {
    const actionKey = `content:${item.id}:${action}`;
    setActionLoading(actionKey);

    const body =
      action === 'schedule'
        ? { scheduledAt: getDefaultScheduleDate() }
        : action === 'revise'
          ? { notes: t('defaultReviseNote') }
          : action === 'reject'
            ? { reason: t('defaultRejectReason') }
            : undefined;

    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/${item.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t(`contentApprovalSuccess.${action}`));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runSocialApproveAndSchedule(postId: string) {
    const actionKey = `social:${postId}:approve`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/social/${postId}/approve-and-schedule`, {
        method: 'POST',
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t('socialApproveScheduleSuccess'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runSocialReject(postId: string) {
    const actionKey = `social:${postId}:reject`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/social/${postId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('defaultSocialRejectReason') }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t('socialRejectSuccess'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  const pendingDraftsCount = data.drafts.filter(canReviewDraft).length;
  const isBusy = loading || actionLoading !== null;

  return (
    <div className="min-h-screen flex flex-col" dir={dir}>
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sage">{t('singleAdminSurface')}</p>
          <h1 className="text-sm font-medium text-charcoal">{t('affiliateOs')}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            void fetchAllData();
          }}
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

      <div className="flex-1 px-6 py-6 space-y-6 overflow-auto">
        <section className="rounded-2xl border border-sage/25 bg-sage/10 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="ti ti-automation text-xl text-sage mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-charcoal">{t('automationBannerTitle')}</h2>
                <p className="text-sm leading-6 text-stone max-w-3xl">{t('automationBannerBody')}</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-sage/20 bg-white px-3 py-1 text-xs font-semibold text-sage-deep">
              {t('approvalOnlyMode')}
            </span>
          </div>
        </section>

        {error && (
          <section className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="ti ti-alert-circle text-red-600 text-lg flex-shrink-0" />
              <p className="text-sm text-red-700 truncate">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchAllData();
              }}
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
            value={formatNumber(pendingDraftsCount, locale)}
            hint={t('approvalActionsOnly')}
          />
          <StatCard
            icon="ti-file-check"
            label={t('pendingContent')}
            value={formatNumber(data.contentApprovals.length, locale)}
            hint={t('contentApprovalsFromApi')}
          />
          <StatCard
            icon="ti-brand-x"
            label={t('pendingSocial')}
            value={formatNumber(pendingSocialCount, locale)}
            hint={t('socialApprovalSchedules')}
          />
          <StatCard
            icon="ti-click"
            label={t('totalClicks')}
            value={formatNumber(data.totalClicks, locale)}
            hint={data.topProductName ? <>{t('topProduct')}: <bdi dir="auto">{data.topProductName}</bdi></> : undefined}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Panel title={`${t('productDrafts')} (${formatNumber(data.drafts.length, locale)})`} icon="ti-package-import">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.drafts.length === 0 ? (
              <StateBlock icon="ti-inbox" title={t('noDrafts')} />
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('productDraftsTableCaption')}</caption>
                    <thead>
                      <tr className="border-b border-beige bg-linen/50">
                        <TableHeader>{t('product')}</TableHeader>
                        <TableHeader>{t('status')}</TableHeader>
                        <TableHeader>{t('trendScore')}</TableHeader>
                        <TableHeader>{t('approvalDecision')}</TableHeader>
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
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionButton
                                icon="ti-check"
                                label={t('approve')}
                                loading={actionLoading === `product:${draft.id}:approve`}
                                disabled={isBusy || !canReviewDraft(draft)}
                                title={!canReviewDraft(draft) ? t('actionUnavailable') : undefined}
                                variant="primary"
                                onClick={() => {
                                  void runDraftAction(draft, 'approve');
                                }}
                              />
                              <ActionButton
                                icon="ti-edit"
                                label={t('needsEdit')}
                                loading={actionLoading === `product:${draft.id}:needs-edit`}
                                disabled={isBusy || !canReviewDraft(draft)}
                                title={!canReviewDraft(draft) ? t('actionUnavailable') : undefined}
                                onClick={() => {
                                  void runDraftAction(draft, 'needs-edit');
                                }}
                              />
                              <ActionButton
                                icon="ti-x"
                                label={t('reject')}
                                loading={actionLoading === `product:${draft.id}:reject`}
                                disabled={isBusy || !canReviewDraft(draft)}
                                title={!canReviewDraft(draft) ? t('actionUnavailable') : undefined}
                                variant="danger"
                                onClick={() => {
                                  void runDraftAction(draft, 'reject');
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {draftPagination.hasMore && (
                  <div className="border-t border-beige px-5 py-4">
                    <ActionButton
                      icon="ti-list-plus"
                      label={t('loadMoreDrafts')}
                      loading={draftPagination.loadingMore}
                      disabled={isBusy || draftPagination.loadingMore}
                      onClick={() => {
                        void loadMoreDrafts();
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title={t('contentApprovals')} icon="ti-file-check">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.contentApprovals.length === 0 ? (
              <StateBlock icon="ti-file-check" title={t('noContentApprovals')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('contentApprovalsTableCaption')}</caption>
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('content')}</TableHeader>
                      <TableHeader>{t('type')}</TableHeader>
                      <TableHeader>{t('status')}</TableHeader>
                      <TableHeader>{t('approvalDecision')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {data.contentApprovals.map((item) => (
                      <tr key={item.id} className="hover:bg-linen/40 transition-colors">
                        <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-72 truncate">
                          <bdi dir="auto">{getContentTitle(item, locale)}</bdi>
                        </td>
                        <td className="px-4 py-3 text-stone"><bdi dir="auto">{item.type ?? '—'}</bdi></td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <ActionButton
                              icon="ti-check"
                              label={t('approve')}
                              loading={actionLoading === `content:${item.id}:approve`}
                              disabled={isBusy}
                              variant="primary"
                              onClick={() => {
                                void runContentAction(item, 'approve');
                              }}
                            />
                            <ActionButton
                              icon="ti-calendar-time"
                              label={t('approveAndSchedule')}
                              loading={actionLoading === `content:${item.id}:schedule`}
                              disabled={isBusy}
                              onClick={() => {
                                void runContentAction(item, 'schedule');
                              }}
                            />
                            <ActionButton
                              icon="ti-edit"
                              label={t('revise')}
                              loading={actionLoading === `content:${item.id}:revise`}
                              disabled={isBusy}
                              onClick={() => {
                                void runContentAction(item, 'revise');
                              }}
                            />
                            <ActionButton
                              icon="ti-x"
                              label={t('reject')}
                              loading={actionLoading === `content:${item.id}:reject`}
                              disabled={isBusy}
                              variant="danger"
                              onClick={() => {
                                void runContentAction(item, 'reject');
                              }}
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

        <Panel title={t('socialPosts')} icon="ti-messages">
          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.socialPosts.length === 0 ? (
            <StateBlock icon="ti-brand-x" title={t('noSocialPosts')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('socialPostsTableCaption')}</caption>
                <thead>
                  <tr className="border-b border-beige bg-linen/50">
                    <TableHeader>{t('platform')}</TableHeader>
                    <TableHeader>{t('preview')}</TableHeader>
                    <TableHeader>{t('status')}</TableHeader>
                    <TableHeader>{t('approvalDecision')}</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {data.socialPosts.map((post) => (
                    <tr key={post.id} className="hover:bg-linen/40 transition-colors">
                      <td className="px-4 py-3 text-charcoal font-medium"><bdi dir="auto">{post.platform}</bdi></td>
                      <td className="px-4 py-3 text-stone text-xs min-w-56 max-w-xl truncate" dir="auto">
                        <bdi dir="auto">{getSocialPreview(post, locale)}</bdi>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={post.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <ActionButton
                            icon="ti-calendar-check"
                            label={t('approveAndSchedule')}
                            loading={actionLoading === `social:${post.id}:approve`}
                            disabled={isBusy}
                            variant="primary"
                            onClick={() => {
                              void runSocialApproveAndSchedule(post.id);
                            }}
                          />
                          <ActionButton
                            icon="ti-x"
                            label={t('reject')}
                            loading={actionLoading === `social:${post.id}:reject`}
                            disabled={isBusy}
                            variant="danger"
                            onClick={() => {
                              void runSocialReject(post.id);
                            }}
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

        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Panel title={t('aiActivity')} icon="ti-activity">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.aiRuns.length === 0 ? (
              <StateBlock icon="ti-brain" title={t('noAiRuns')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('aiActivityTableCaption')}</caption>
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
          </Panel>

          <section className="bg-white rounded-xl border border-beige p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="ti ti-shield-check text-sage" />
              <h2 className="text-sm font-semibold text-charcoal">{t('opsStatus')}</h2>
            </div>
            <StatusLine icon="ti-automation" label={t('automationStatus')} value={t('automationStatusValue')} />
            <StatusLine icon="ti-share-off" label={t('socialPublishPolicy')} value={t('socialPublishPolicyValue')} />
            <StatusLine icon="ti-settings-off" label={t('settingsPolicy')} value={t('settingsPolicyValue')} />
            <div className="pt-2">
              <ActionButton
                icon="ti-refresh"
                label={t('refreshAll')}
                loading={loading}
                disabled={isBusy}
                onClick={() => {
                  void fetchAllData();
                }}
              />
            </div>
          </section>
        </section>
      </div>
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
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-beige overflow-hidden">
      <div className="px-5 py-4 border-b border-beige flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`ti ${icon} text-sage`} />
          <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
        </div>
      </div>
      {children}
    </section>
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

function StatusLine({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-linen/70 px-4 py-3">
      <span aria-hidden="true" className={`ti ${icon} text-sage mt-0.5`} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-charcoal">{label}</p>
        <p className="text-xs leading-5 text-stone">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('admin');
  const classes: Record<string, string> = {
    NEEDS_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
    PENDING_APPROVAL: 'bg-amber-50 text-amber-700 border-amber-200',
    QUALITY_CHECK: 'bg-amber-50 text-amber-700 border-amber-200',
    REVISION_REQUESTED: 'bg-lavender/20 text-lavender-text border-lavender/30',
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
    QUALITY_CHECK: t('statusQualityCheck'),
    REVISION_REQUESTED: t('statusRevisionRequested'),
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
  const classes = {
    primary: 'bg-sage hover:bg-sage-deep text-cream border border-sage',
    secondary: 'bg-linen hover:bg-beige text-charcoal border border-beige',
    danger: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200',
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}
    >
      <span aria-hidden="true" className={`ti ${loading ? 'ti-loader-2 animate-spin' : icon} text-sm`} />
      <span>{label}</span>
    </button>
  );
}
