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
  discoveryReason?: string | null;
  createdAt?: string | null;
}

interface TrendSignal {
  id: string;
  source?: string | null;
  title?: string | null;
  rawTitle?: string | null;
  trendScore?: number | null;
  discoveryReason?: string | null;
  status: string;
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

interface ScheduledJob {
  id: string;
  key: string;
  name: string;
  handler: string;
  status: string;
  cronExpression?: string | null;
  timezone?: string | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  createdAt?: string | null;
  _count?: { runs: number };
}

interface Connector {
  platform: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
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
  error?: string | null;
  output?: {
    discovered?: number | null;
    total?: number | null;
    succeeded?: number | null;
    failed?: number | null;
    source?: string;
  } | Record<string, unknown> | null;
}

interface OfferEnrichment {
  id: string;
  sourceProductDraftId: string;
  offerTitle: string | null;
  targetAudience: string | null;
  keyBenefits: unknown | null;
  painPoints: unknown | null;
  objections: unknown | null;
  positioningAngle: string | null;
  contentAngles: unknown | null;
  suggestedHooks: unknown | null;
  keywords: unknown | null;
  confidenceScore: number | null;
  enrichmentReason: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ContentDraft {
  id: string;
  sourceOfferEnrichmentId: string;
  contentType: string;
  title: string | null;
  body: string | null;
  angle: string | null;
  callToAction: string | null;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface PublicOfferDraft {
  id: string;
  sourceContentDraftId: string;
  slug: string;
  title: string;
  summary?: string | null;
  heroCopy?: string | null;
  benefits?: string[] | null;
  faq?: Array<{ question: string; answer: string }> | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  status: string;
  readyForNextPhase: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface ReviewItem {
  id: string;
  contentDraftId: string;
  reviewStatus: string;
  reviewNotes: string | null;
  revisionRequested: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  contentDraft?: {
    id: string;
    contentType: string;
    title: string | null;
    body: string | null;
    angle: string | null;
    status: string;
  };
}

interface DashboardData {
  trendSignals: TrendSignal[];
  drafts: ProductDraft[];
  offerEnrichments: OfferEnrichment[];
  contentDrafts: ContentDraft[];
  reviewItems: ReviewItem[];
  publicOfferDrafts: PublicOfferDraft[];
  socialPosts: SocialPost[];
  scheduledJobs: ScheduledJob[];
  connectors: Connector[];
  contentApprovals: ContentApproval[];
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

function isTrendSignal(value: unknown): value is TrendSignal {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
}

function isSocialPost(value: unknown): value is SocialPost {
  return isRecord(value) && typeof value.id === 'string' && typeof value.platform === 'string';
}

function isScheduledJob(value: unknown): value is ScheduledJob {
  return isRecord(value) && typeof value.id === 'string' && typeof value.key === 'string';
}

function isAiRun(value: unknown): value is AiRun {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isContentApproval(value: unknown): value is ContentApproval {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
}

function isOfferEnrichment(value: unknown): value is OfferEnrichment {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
}

function isContentDraft(value: unknown): value is ContentDraft {
  return isRecord(value) && typeof value.id === 'string' && typeof value.contentType === 'string';
}

function isReviewItem(value: unknown): value is ReviewItem {
  return isRecord(value) && typeof value.id === 'string' && typeof value.reviewStatus === 'string';
}

function isPublicOfferDraft(value: unknown): value is PublicOfferDraft {
  return isRecord(value) && typeof value.id === 'string' && typeof value.status === 'string';
}

function extractItems<T>(payload: unknown, guard: (value: unknown) => value is T): T[] {
  if (Array.isArray(payload)) {
    return payload.filter(guard);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const candidates = [payload.items, payload.data, payload.drafts, payload.signals, payload.trendSignals, payload.runs];
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

function getTrendSignalTitle(signal: TrendSignal): string {
  return signal.title || signal.rawTitle || signal.id;
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
    trendSignals: [],
    drafts: [],
    offerEnrichments: [],
    contentDrafts: [],
    reviewItems: [],
    publicOfferDrafts: [],
    contentApprovals: [],
    socialPosts: [],
    scheduledJobs: [],
    connectors: [],
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
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewItem | null>(null);
  const [selectedPublicOfferDraft, setSelectedPublicOfferDraft] = useState<PublicOfferDraft | null>(null);
  const [publicOfferDraftFilter, setPublicOfferDraftFilter] = useState<string>('ALL');
  const [reviewFilter, setReviewFilter] = useState<string>('ALL');
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
      const [
        trendSignalsRes,
        draftsRes,
        enrichmentsRes,
        contentDraftsRes,
        contentRes,
        socialRes,
        overviewRes,
        analyticsRes,
        aiRunsRes,
        reviewItemsRes,
        publicOfferDraftsRes,
        scheduledJobsRes,
        connectorsRes,
      ] = await Promise.all([
        adminFetch(`${API_BASE}/admin/trend-signals?limit=50`),
        adminFetch(`${API_BASE}/admin/product-drafts?limit=${PRODUCT_DRAFT_PAGE_SIZE}&offset=0`),
        adminFetch(`${API_BASE}/admin/offer-enrichments?limit=50`),
        adminFetch(`${API_BASE}/admin/content-drafts?limit=50`),
        adminFetch(`${API_BASE}/admin/approvals`),
        adminFetch(`${API_BASE}/admin/approvals/social?status=PENDING_APPROVAL`),
        adminFetch(`${API_BASE}/admin/ai-os/overview`),
        adminFetch(`${API_BASE}/admin/analytics`),
        adminFetch(`${API_BASE}/admin/ai-os/runs?limit=5`),
        adminFetch(`${API_BASE}/admin/review-workspace?limit=50`),
        adminFetch(`${API_BASE}/admin/public-offer-drafts?limit=50`),
        adminFetch(`${API_BASE}/admin/scheduled-jobs?limit=50`),
        adminFetch(`${API_BASE}/admin/connectors`),
      ]);

      const [
        trendSignalsPayload,
        draftsPayload,
        enrichmentsPayload,
        contentDraftsPayload,
        contentPayload,
        socialPayload,
        overviewPayload,
        analyticsPayload,
        aiRunsPayload,
        reviewItemsPayload,
        publicOfferDraftsPayload,
        scheduledJobsPayload,
        connectorsPayload,
      ] = await Promise.all([
        trendSignalsRes.json().catch(() => null),
        draftsRes.json().catch(() => null),
        enrichmentsRes.json().catch(() => null),
        contentDraftsRes.json().catch(() => null),
        contentRes.json().catch(() => null),
        socialRes.json().catch(() => null),
        overviewRes.json().catch(() => null),
        analyticsRes.json().catch(() => null),
        aiRunsRes.json().catch(() => null),
        reviewItemsRes.json().catch(() => null),
        publicOfferDraftsRes.json().catch(() => null),
        scheduledJobsRes.json().catch(() => null),
        connectorsRes.json().catch(() => null),
      ]);

      const failedResponse = [
        { response: trendSignalsRes, payload: trendSignalsPayload },
        { response: draftsRes, payload: draftsPayload },
        { response: enrichmentsRes, payload: enrichmentsPayload },
        { response: contentDraftsRes, payload: contentDraftsPayload },
        { response: contentRes, payload: contentPayload },
        { response: socialRes, payload: socialPayload },
        { response: overviewRes, payload: overviewPayload },
        { response: reviewItemsRes, payload: reviewItemsPayload },
        { response: publicOfferDraftsRes, payload: publicOfferDraftsPayload },
        { response: scheduledJobsRes, payload: scheduledJobsPayload },
      ].find(({ response }) => !response.ok);

      if (failedResponse) {
        throw new Error(
          getErrorMessage(failedResponse.payload, `HTTP ${failedResponse.response.status}`),
        );
      }

      const trendSignals = extractItems(trendSignalsPayload, isTrendSignal);
      const drafts = extractItems(draftsPayload, isProductDraft);
      const offerEnrichments = extractItems(enrichmentsPayload, isOfferEnrichment);
      const contentDrafts = extractItems(contentDraftsPayload, isContentDraft);
      const contentApprovals = extractItems(contentPayload, isContentApproval).filter(canReviewContent);
      const socialPosts = extractItems(socialPayload, isSocialPost);
      const aiRuns = extractItems(aiRunsPayload, isAiRun);

      const reviewItems = extractItems(reviewItemsPayload, isReviewItem);
      const publicOfferDrafts = extractItems(publicOfferDraftsPayload, isPublicOfferDraft);
      const scheduledJobs = extractItems(scheduledJobsPayload, isScheduledJob);
      const connectors: Connector[] = Array.isArray(connectorsPayload) ? connectorsPayload : [];

      setPendingSocialCount(getResponseTotal(socialPayload, socialPosts.length));
      setDraftPagination({
        offset: drafts.length,
        hasMore: drafts.length === PRODUCT_DRAFT_PAGE_SIZE,
        loadingMore: false,
      });
      setData({
        trendSignals,
        drafts,
        offerEnrichments,
        contentDrafts,
        reviewItems,
        publicOfferDrafts,
        contentApprovals,
        socialPosts,
        scheduledJobs,
        connectors,
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

  async function triggerPipeline(kind: 'amazon_discovery' | 'noon_discovery' | 'product_pipeline' | 'content_pipeline') {
    const actionKey = `trigger:${kind}`;
    setActionLoading(actionKey);
    let runId: string | null = null;
    try {
      const res = await adminFetch(`${API_BASE}/admin/affiliate-os/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const payload: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      runId = payload?.runId ?? null;
      showToast('success', t('triggerStarted'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
      setActionLoading(null);
      return;
    }

    // Poll the run until it leaves PENDING/RUNNING, then show a summary toast.
    if (!runId) { setActionLoading(null); return; }
    const start = Date.now();
    const POLL_MAX_MS = 5 * 60 * 1000;
    const POLL_INTERVAL_MS = 4000;
    const poll = async () => {
      if (Date.now() - start > POLL_MAX_MS) { setActionLoading(null); return; }
      try {
        const r = await adminFetch(`${API_BASE}/admin/ai-os/runs/${runId}`);
        if (r.ok) {
          const j: any = await r.json().catch(() => null);
          const status = j?.status as string | undefined;
          if (status && status !== 'PENDING' && status !== 'RUNNING') {
            const out = j?.output ?? {};
            const total = Number(out.total ?? 0);
            const succeeded = Number(out.succeeded ?? 0);
            const failed = Number(out.failed ?? 0);
            if (status === 'COMPLETED') {
              showToast(
                'success',
                total === 0
                  ? t('triggerNoCandidates')
                  : `${t('triggerCompleted')}: ${succeeded}/${total}${failed > 0 ? ` (${failed} ${t('runFailed').toLowerCase()})` : ''}`,
              );
            } else {
              showToast('error', j?.error || t('triggerFailedShort'));
            }
            void fetchAllData();
            setActionLoading(null);
            return;
          }
        }
      } catch { /* swallow & retry */ }
      setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
    };
    void poll();
  }

  async function createDraftFromTrendSignal(signalId: string) {
    const actionKey = `trend:${signalId}:create-draft`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(`${API_BASE}/admin/product-drafts/from-trend-signal`, {
        method: 'POST',
        body: JSON.stringify({ trendSignalId: signalId }),
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t('trendSignalDraftCreated'));
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

  async function runEnrichmentAction(enrichment: OfferEnrichment, action: 'generate-content') {
    const actionKey = `enrichment:${enrichment.id}:${action}`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(
        `${API_BASE}/admin/offer-enrichments/${enrichment.id}/generate-content`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
      );
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t('contentGenerationStarted'));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runDraftContentAction(draft: ContentDraft, action: 'approve' | 'edit' | 'reject') {
    const actionKey = `draft:${draft.id}:${action}`;
    setActionLoading(actionKey);

    const body =
      action === 'reject'
        ? { reason: t('defaultRejectReason') }
        : undefined;

    try {
      const res = await adminFetch(`${API_BASE}/admin/content-drafts/${draft.id}/${action}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t(`contentDraftSuccess.${action}`));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  async function runReviewAction(itemId: string, action: 'approve' | 'reject' | 'requestRevision') {
    const actionKey = `review:${itemId}:${action}`;
    setActionLoading(actionKey);

    try {
      const res = await adminFetch(
        `${API_BASE}/admin/review-workspace/${itemId}/${action === 'requestRevision' ? 'request-revision' : action}`,
        {
          method: 'POST',
          body: action === 'reject' ? JSON.stringify({ notes: t('defaultRejectReason') }) : undefined,
        },
      );
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(getErrorMessage(payload, `HTTP ${res.status}`));
      }

      showToast('success', t(`reviewActionSuccess.${action}`));
      void fetchAllData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('loadFailed'));
    } finally {
      setActionLoading(null);
    }
  }

  const pendingDraftsCount = data.drafts.filter(canReviewDraft).length;
  const isBusy = loading || actionLoading !== null;

  const filteredReviewItems =
    reviewFilter === 'ALL' ? data.reviewItems : data.reviewItems.filter((item) => item.reviewStatus === reviewFilter);

  const filteredPublicOfferDrafts =
    publicOfferDraftFilter === 'ALL'
      ? data.publicOfferDrafts
      : data.publicOfferDrafts.filter((d) => d.status === publicOfferDraftFilter);

  const runPublicOfferDraftAction = async (id: string, action: 'approve' | 'reject') => {
    if (actionLoading) return;
    setActionLoading(id);
    setToast(null);
    try {
      const key = `${action}:${id}`;
      const stored = actionIdempotencyKeysRef.current.get(key);
      const idempotencyKey = stored ?? crypto.randomUUID();
      if (!stored) actionIdempotencyKeysRef.current.set(key, idempotencyKey);

      const res = await adminFetch(`${API_BASE}/admin/public-offer-drafts/${id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey }),
      });

      if (res.ok) {
        setToast({ type: 'success', msg: t(`publicOfferDraftActionSuccess.${action}`) });
        await fetchAllData();
        setSelectedPublicOfferDraft(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast({ type: 'error', msg: (data as { message?: string }).message || t('actionFailed') });
      }
    } catch {
      setToast({ type: 'error', msg: t('actionFailed') });
    } finally {
      setActionLoading(null);
    }
  };

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

      {selectedReviewItem && (
        <div
          className="fixed inset-0 z-40 bg-charcoal/30 backdrop-blur-sm"
          onClick={() => { setSelectedReviewItem(null); }}
          aria-hidden="true"
        />
      )}
      {selectedReviewItem && (
        <div
          className={`fixed top-0 right-0 z-50 h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto ${dir === 'rtl' ? 'left-0' : 'right-0'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-drawer-title"
        >
          <div className="sticky top-0 z-10 bg-white border-b border-beige px-6 py-4 flex items-center justify-between">
            <div>
              <h2 id="review-drawer-title" className="text-base font-semibold text-charcoal">{t('reviewDetails')}</h2>
              <p className="text-xs text-stone mt-0.5">{selectedReviewItem.contentDraft?.title || '—'}</p>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedReviewItem(null); }}
              className="text-stone hover:text-charcoal p-2 rounded-lg hover:bg-linen transition-colors"
              aria-label={t('close')}
            >
              <span aria-hidden="true" className="ti ti-x text-lg" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Content Details */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone">{t('contentDetails')}</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-stone">{t('contentType')}</p>
                  <p className="font-medium text-charcoal"><bdi dir="auto">{selectedReviewItem.contentDraft?.contentType || '—'}</bdi></p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-stone">{t('angle')}</p>
                  <p className="font-medium text-charcoal"><bdi dir="auto">{selectedReviewItem.contentDraft?.angle || '—'}</bdi></p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-xs text-stone">{t('title')}</p>
                  <p className="font-medium text-charcoal"><bdi dir="auto">{selectedReviewItem.contentDraft?.title || '—'}</bdi></p>
                </div>
                <div className="space-y-1 col-span-2">
                  <p className="text-xs text-stone">{t('body')}</p>
                  <p className="text-charcoal leading-relaxed"><bdi dir="auto">{selectedReviewItem.contentDraft?.body || '—'}</bdi></p>
                </div>
              </div>
            </section>

            {/* Review Status */}
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone">{t('reviewStatus')}</h3>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedReviewItem.reviewStatus} />
                {selectedReviewItem.reviewNotes && (
                  <p className="text-sm text-stone italic">&quot;{selectedReviewItem.reviewNotes}&quot;</p>
                )}
              </div>
              {selectedReviewItem.reviewedAt && (
                <p className="text-xs text-stone">
                  {t('reviewedOn')} {formatDate(selectedReviewItem.reviewedAt, locale)}
                  {selectedReviewItem.reviewedBy && ` ${t('by')} ${selectedReviewItem.reviewedBy}`}
                </p>
              )}
            </section>

            {/* Revision Notes (if revision requested) */}
            {selectedReviewItem.reviewStatus === 'REVISION_REQUESTED' && selectedReviewItem.revisionRequested && (
              <section className="space-y-3 bg-linen/50 rounded-xl p-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone">{t('revisionRequested')}</h3>
                <p className="text-sm text-charcoal">{selectedReviewItem.reviewNotes || t('noRevisionNotes')}</p>
              </section>
            )}

            {/* Actions */}
            {selectedReviewItem.reviewStatus === 'PENDING' && (
              <section className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone">{t('takeAction')}</h3>
                <div className="flex flex-wrap gap-3">
                  <ActionButton
                    icon="ti-check"
                    label={t('approve')}
                    loading={actionLoading === `review:${selectedReviewItem.id}:approve`}
                    disabled={isBusy}
                    variant="primary"
                    onClick={() => { void runReviewAction(selectedReviewItem.id, 'approve'); setSelectedReviewItem(null); }}
                  />
                  <ActionButton
                    icon="ti-edit"
                    label={t('requestRevision')}
                    loading={actionLoading === `review:${selectedReviewItem.id}:requestRevision`}
                    disabled={isBusy}
                    onClick={() => { void runReviewAction(selectedReviewItem.id, 'requestRevision'); setSelectedReviewItem(null); }}
                  />
                  <ActionButton
                    icon="ti-x"
                    label={t('reject')}
                    loading={actionLoading === `review:${selectedReviewItem.id}:reject`}
                    disabled={isBusy}
                    variant="danger"
                    onClick={() => { void runReviewAction(selectedReviewItem.id, 'reject'); setSelectedReviewItem(null); }}
                  />
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {selectedPublicOfferDraft && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedPublicOfferDraft(null)}>
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" />
          <div
            dir={dir}
            className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-slide-in-right rtl:animate-slide-in-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white border-b border-beige px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-charcoal">{t('publicOfferDraftDetails')}</h2>
              <button onClick={() => setSelectedPublicOfferDraft(null)} className="p-1 hover:bg-linen rounded-lg transition-colors">
                <i className="ti ti-x text-charcoal" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">{t('title')}</h3>
                <p className="text-sm text-charcoal">{selectedPublicOfferDraft.title || '—'}</p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">{t('slug')}</h3>
                <p className="text-xs font-mono text-charcoal/60">{selectedPublicOfferDraft.slug || '—'}</p>
              </section>
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">{t('publicOfferDraftStatus')}</h3>
                <StatusBadge status={selectedPublicOfferDraft.status} />
              </section>
              {selectedPublicOfferDraft.summary && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">Summary</h3>
                  <p className="text-sm text-charcoal">{selectedPublicOfferDraft.summary}</p>
                </section>
              )}
              {selectedPublicOfferDraft.heroCopy && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">Hero Copy</h3>
                  <p className="text-sm text-charcoal">{selectedPublicOfferDraft.heroCopy}</p>
                </section>
              )}
              {selectedPublicOfferDraft.seoTitle && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">SEO Title</h3>
                  <p className="text-sm text-charcoal">{selectedPublicOfferDraft.seoTitle}</p>
                </section>
              )}
              {selectedPublicOfferDraft.seoDescription && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">SEO Description</h3>
                  <p className="text-sm text-charcoal text-xs">{selectedPublicOfferDraft.seoDescription}</p>
                </section>
              )}
              {selectedPublicOfferDraft.benefits && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">Benefits</h3>
                  <pre className="text-xs bg-linen rounded-lg p-3 overflow-auto">{JSON.stringify(selectedPublicOfferDraft.benefits, null, 2)}</pre>
                </section>
              )}
              {selectedPublicOfferDraft.faq && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-sage mb-2">FAQ</h3>
                  <pre className="text-xs bg-linen rounded-lg p-3 overflow-auto">{JSON.stringify(selectedPublicOfferDraft.faq, null, 2)}</pre>
                </section>
              )}
              <section className="flex flex-wrap gap-2 pt-2 border-t border-beige">
                {selectedPublicOfferDraft.status !== 'APPROVED' && selectedPublicOfferDraft.status !== 'REJECTED' && (
                  <ActionButton
                    icon="ti-check"
                    label={t('approve')}
                    loading={actionLoading === `pod:${selectedPublicOfferDraft.id}:approve`}
                    disabled={isBusy}
                    onClick={() => { void runPublicOfferDraftAction(selectedPublicOfferDraft.id, 'approve'); }}
                  />
                )}
                {selectedPublicOfferDraft.status === 'APPROVED' && (
                  <ActionButton
                    icon="ti-world"
                    label={t('publish')}
                    loading={actionLoading === `pod:${selectedPublicOfferDraft.id}:publish`}
                    disabled={isBusy}
                    onClick={async () => {
                      if (actionLoading) return;
                      setActionLoading(`pod:${selectedPublicOfferDraft.id}:publish`);
                      setToast(null);
                      try {
                        const res = await adminFetch(`${API_BASE}/admin/public-offer-drafts/${selectedPublicOfferDraft.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                        if (res.ok) {
                          setToast({ type: 'success', msg: t('published') });
                          await fetchAllData();
                          setSelectedPublicOfferDraft(null);
                        } else {
                          const d = await res.json().catch(() => ({}));
                          setToast({ type: 'error', msg: (d as { message?: string }).message || t('actionFailed') });
                        }
                      } catch { setToast({ type: 'error', msg: t('actionFailed') }); } finally { setActionLoading(null); }
                    }}
                  />
                )}
                <ActionButton
                  icon="ti-x"
                  label={t('reject')}
                  loading={actionLoading === `pod:${selectedPublicOfferDraft.id}:reject`}
                  disabled={isBusy || selectedPublicOfferDraft.status === 'REJECTED'}
                  variant="danger"
                  onClick={() => { void runPublicOfferDraftAction(selectedPublicOfferDraft.id, 'reject'); }}
                />
              </section>
            </div>
          </div>
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

        <section className="rounded-2xl border border-beige bg-white px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="ti ti-bolt text-base text-sage" />
              <h2 className="text-sm font-semibold text-charcoal">{t('pipelineControls')}</h2>
            </div>
            <span className="text-xs text-stone">{t('pipelineControlsHint')}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {([
              { kind: 'amazon_discovery', label: t('runAmazonDiscovery'), icon: 'ti-search' },
              { kind: 'noon_discovery', label: t('runNoonDiscovery'), icon: 'ti-search' },
              { kind: 'product_pipeline', label: t('runProductPipeline'), icon: 'ti-package' },
              { kind: 'content_pipeline', label: t('runContentPipeline'), icon: 'ti-file-text' },
            ] as const).map((btn) => {
              const isLoading = actionLoading === `trigger:${btn.kind}`;
              return (
                <button
                  key={btn.kind}
                  type="button"
                  onClick={() => { void triggerPipeline(btn.kind); }}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 justify-center rounded-lg border border-beige bg-linen/30 hover:bg-sage/10 hover:border-sage/30 px-3 py-2.5 text-xs font-medium text-charcoal transition-colors disabled:opacity-50"
                >
                  <span aria-hidden="true" className={`ti ${isLoading ? 'ti-loader animate-spin' : btn.icon} text-sm`} />
                  {btn.label}
                </button>
              );
            })}
          </div>
        </section>

        {data.aiRuns.length > 0 && (
          <section className="rounded-2xl border border-beige bg-white px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="ti ti-activity text-base text-sage" />
                <h2 className="text-sm font-semibold text-charcoal">{t('recentAiRuns')}</h2>
              </div>
              <span className="text-xs text-stone">
                {t('activeRuns')}: {data.activeRuns ?? 0}
              </span>
            </div>
            <div className="space-y-1.5">
              {data.aiRuns.slice(0, 5).map((run) => {
                const statusColor =
                  run.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
                  : run.status === 'FAILED' ? 'bg-red-100 text-red-700'
                  : run.status === 'RUNNING' ? 'bg-amber-100 text-amber-700'
                  : 'bg-stone-100 text-stone-600';
                const out = (run.output && typeof run.output === 'object' ? run.output : null) as Record<string, unknown> | null;
                const summary =
                  run.status === 'FAILED' && run.error
                    ? String(run.error)
                    : out
                    ? [
                        out.discovered != null ? `${t('runDiscovered')}: ${String(out.discovered)}` : null,
                        out.total != null ? `${t('runCandidates')}: ${String(out.total)}` : null,
                        out.succeeded != null ? `${t('runSucceeded')}: ${String(out.succeeded)}` : null,
                        out.failed != null && Number(out.failed) > 0 ? `${t('runFailed')}: ${String(out.failed)}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : '';
                return (
                  <div key={run.id} className="flex flex-col gap-1 px-3 py-2 rounded-lg bg-linen/30 hover:bg-linen/50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${statusColor}`}>{run.status}</span>
                        <span className="text-xs font-medium text-charcoal truncate">{run.name || run.type}</span>
                      </div>
                      <span className="text-[11px] text-stone whitespace-nowrap">
                        {run.createdAt ? new Date(run.createdAt).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    {summary && (
                      <p className={`text-[11px] ${run.status === 'FAILED' ? 'text-red-600' : 'text-stone'} ms-[68px] truncate`} title={summary}>
                        {summary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

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

        <Panel title={`${t('trendSignals')} (${formatNumber(data.trendSignals.length, locale)})`} icon="ti-radar-2">
          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.trendSignals.length === 0 ? (
            <StateBlock icon="ti-radar-off" title={t('noTrendSignals')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('trendSignalsTableCaption')}</caption>
                <thead>
                  <tr className="border-b border-beige bg-linen/50">
                    <TableHeader>{t('source')}</TableHeader>
                    <TableHeader>{t('title')}</TableHeader>
                    <TableHeader>{t('trendScore')}</TableHeader>
                    <TableHeader>{t('discoveryReason')}</TableHeader>
                    <TableHeader>{t('status')}</TableHeader>
                    <TableHeader>{t('createdAt')}</TableHeader>
                    <TableHeader>{t('actions')}</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {data.trendSignals.map((signal) => (
                    <tr key={signal.id} className="hover:bg-linen/40 transition-colors">
                      <td className="px-4 py-3 text-stone whitespace-nowrap"><bdi dir="auto">{signal.source || '—'}</bdi></td>
                      <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-72 truncate">
                        <bdi dir="auto">{getTrendSignalTitle(signal)}</bdi>
                      </td>
                      <td className="px-4 py-3 text-charcoal tabular-nums">
                        {formatScore(signal.trendScore, locale)}
                      </td>
                      <td className="px-4 py-3 text-stone text-xs min-w-56 max-w-md truncate" dir="auto">
                        <bdi dir="auto">{signal.discoveryReason || '—'}</bdi>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={signal.status} />
                      </td>
                      <td className="px-4 py-3 text-stone text-xs tabular-nums">
                        {formatDate(signal.createdAt, locale)}
                      </td>
                      <td className="px-4 py-3">
                        <ActionButton
                          icon="ti-package-import"
                          label={t('createDraft')}
                          loading={actionLoading === `trend:${signal.id}:create-draft`}
                          disabled={isBusy}
                          variant="primary"
                          onClick={() => {
                            void createDraftFromTrendSignal(signal.id);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

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
                        <TableHeader>{t('discoveryReason')}</TableHeader>
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
                          <td className="px-4 py-3 text-stone text-xs min-w-56 max-w-md truncate" dir="auto">
                            <bdi dir="auto">{draft.discoveryReason || '—'}</bdi>
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

          <Panel title={t('offerEnrichments')} icon="ti-sparkles">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.offerEnrichments.length === 0 ? (
              <StateBlock icon="ti-sparkles" title={t('noOfferEnrichments')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('offerEnrichmentsTableCaption')}</caption>
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('offerTitle')}</TableHeader>
                      <TableHeader>{t('targetAudience')}</TableHeader>
                      <TableHeader>{t('confidence')}</TableHeader>
                      <TableHeader>{t('status')}</TableHeader>
                      <TableHeader>{t('enrichmentActions')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {data.offerEnrichments.map((enrichment) => (
                      <tr key={enrichment.id} className="hover:bg-linen/40 transition-colors">
                        <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-md truncate">
                          <bdi dir="auto">{enrichment.offerTitle || '—'}</bdi>
                        </td>
                        <td className="px-4 py-3 text-stone text-xs min-w-48 max-w-sm truncate">
                          <bdi dir="auto">{enrichment.targetAudience || '—'}</bdi>
                        </td>
                        <td className="px-4 py-3 text-stone">
                          <bdi dir="auto">{formatScore(enrichment.confidenceScore, locale)}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={enrichment.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <ActionButton
                              icon="ti-file-text"
                              label={t('generateContent')}
                              loading={actionLoading === `enrichment:${enrichment.id}:generate-content`}
                              disabled={isBusy || enrichment.status !== 'COMPLETED'}
                              title={enrichment.status !== 'COMPLETED' ? t('actionUnavailable') : undefined}
                              variant="primary"
                              onClick={() => {
                                void runEnrichmentAction(enrichment, 'generate-content');
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

          <Panel title={t('contentDrafts')} icon="ti-layout-list">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.contentDrafts.length === 0 ? (
              <StateBlock icon="ti-layout-list" title={t('noContentDrafts')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('contentDraftsTableCaption')}</caption>
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('title')}</TableHeader>
                      <TableHeader>{t('contentType')}</TableHeader>
                      <TableHeader>{t('angle')}</TableHeader>
                      <TableHeader>{t('status')}</TableHeader>
                      <TableHeader>{t('draftActions')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {data.contentDrafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-linen/40 transition-colors">
                        <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-md truncate">
                          <bdi dir="auto">{draft.title || '—'}</bdi>
                        </td>
                        <td className="px-4 py-3 text-stone"><bdi dir="auto">{draft.contentType ?? '—'}</bdi></td>
                        <td className="px-4 py-3 text-stone text-xs min-w-48 max-w-sm truncate">
                          <bdi dir="auto">{draft.angle || '—'}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={draft.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <ActionButton
                              icon="ti-check"
                              label={t('approve')}
                              loading={actionLoading === `draft:${draft.id}:approve`}
                              disabled={isBusy || draft.status !== 'PENDING_APPROVAL'}
                              title={draft.status !== 'PENDING_APPROVAL' ? t('actionUnavailable') : undefined}
                              variant="primary"
                              onClick={() => {
                                void runDraftContentAction(draft, 'approve');
                              }}
                            />
                            <ActionButton
                              icon="ti-edit"
                              label={t('edit')}
                              loading={actionLoading === `draft:${draft.id}:edit`}
                              disabled={isBusy || (draft.status !== 'DRAFT' && draft.status !== 'PENDING_APPROVAL')}
                              onClick={() => {
                                void runDraftContentAction(draft, 'edit');
                              }}
                            />
                            <ActionButton
                              icon="ti-x"
                              label={t('reject')}
                              loading={actionLoading === `draft:${draft.id}:reject`}
                              disabled={isBusy || draft.status !== 'PENDING_APPROVAL'}
                              title={draft.status !== 'PENDING_APPROVAL' ? t('actionUnavailable') : undefined}
                              variant="danger"
                              onClick={() => {
                                void runDraftContentAction(draft, 'reject');
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

          <Panel title={t('reviewItems')} icon="ti-clipboard-check">
            {loading ? (
              <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
            ) : data.reviewItems.length === 0 ? (
              <StateBlock icon="ti-clipboard-check" title={t('noReviewItems')} />
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-2 border-b border-beige bg-linen/30">
                  <label htmlFor="review-filter" className="text-xs text-stone">{t('filterBy')}:</label>
                  <select
                    id="review-filter"
                    value={reviewFilter}
                    onChange={(e) => { setReviewFilter(e.target.value); }}
                    className="text-xs border border-beige rounded px-2 py-1 bg-white text-charcoal focus:outline-none focus:ring-1 focus:ring-sage"
                  >
                    <option value="ALL">{t('allStatuses')}</option>
                    <option value="PENDING">{t('statusPendingApproval')}</option>
                    <option value="APPROVED">{t('statusApproved')}</option>
                    <option value="REJECTED">{t('statusRejected')}</option>
                    <option value="REVISION_REQUESTED">{t('statusRevisionRequested')}</option>
                  </select>
                  <span className="text-xs text-stone">{filteredReviewItems.length} {t('items')}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">{t('reviewItemsTableCaption')}</caption>
                    <thead>
                      <tr className="border-b border-beige bg-linen/50">
                        <TableHeader>{t('title')}</TableHeader>
                        <TableHeader>{t('contentType')}</TableHeader>
                        <TableHeader>{t('angle')}</TableHeader>
                        <TableHeader>{t('reviewStatus')}</TableHeader>
                        <TableHeader>{t('reviewActions')}</TableHeader>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige">
                      {filteredReviewItems.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-linen/40 transition-colors cursor-pointer"
                          onClick={() => { setSelectedReviewItem(item); }}
                        >
                          <td className="px-4 py-3 text-charcoal font-medium min-w-56 max-w-md truncate">
                            <bdi dir="auto">{item.contentDraft?.title || '—'}</bdi>
                          </td>
                          <td className="px-4 py-3 text-stone"><bdi dir="auto">{item.contentDraft?.contentType ?? '—'}</bdi></td>
                          <td className="px-4 py-3 text-stone text-xs min-w-48 max-w-sm truncate">
                            <bdi dir="auto">{item.contentDraft?.angle || '—'}</bdi>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={item.reviewStatus} />
                          </td>
                          <td className="px-4 py-3" onClick={(e) => { e.stopPropagation(); }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionButton
                                icon="ti-check"
                                label={t('approve')}
                                loading={actionLoading === `review:${item.id}:approve`}
                                disabled={isBusy || item.reviewStatus !== 'PENDING'}
                                title={item.reviewStatus !== 'PENDING' ? t('actionUnavailable') : undefined}
                                variant="primary"
                                onClick={() => {
                                  void runReviewAction(item.id, 'approve');
                                }}
                              />
                              <ActionButton
                                icon="ti-edit"
                                label={t('requestRevision')}
                                loading={actionLoading === `review:${item.id}:requestRevision`}
                                disabled={isBusy || item.reviewStatus !== 'PENDING'}
                                onClick={() => {
                                  void runReviewAction(item.id, 'requestRevision');
                                }}
                              />
                              <ActionButton
                                icon="ti-x"
                                label={t('reject')}
                                loading={actionLoading === `review:${item.id}:reject`}
                                disabled={isBusy || item.reviewStatus !== 'PENDING'}
                                title={item.reviewStatus !== 'PENDING' ? t('actionUnavailable') : undefined}
                                variant="danger"
                                onClick={() => {
                                  void runReviewAction(item.id, 'reject');
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        </section>

        <Panel title={t('publicOfferDrafts')} icon="ti-world">
          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.publicOfferDrafts.length === 0 ? (
            <StateBlock icon="ti-file-text" title={t('noPublicOfferDrafts')} />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 gap-2">
                <select
                  value={publicOfferDraftFilter}
                  onChange={(e) => setPublicOfferDraftFilter(e.target.value)}
                  className="text-xs border border-beige rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-sage"
                >
                  <option value="ALL">{t('allStatuses')}</option>
                  <option value="DRAFT">{t('draft')}</option>
                  <option value="PENDING_APPROVAL">{t('pendingApproval')}</option>
                  <option value="APPROVED">{t('approved')}</option>
                  <option value="REJECTED">{t('rejected')}</option>
                </select>
                <span className="text-xs text-stone">{filteredPublicOfferDrafts.length} {t('items')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t('publicOfferDraftsTableCaption')}</caption>
                  <thead>
                    <tr className="border-b border-beige bg-linen/50">
                      <TableHeader>{t('title')}</TableHeader>
                      <TableHeader>{t('slug')}</TableHeader>
                      <TableHeader>{t('publicOfferDraftStatus')}</TableHeader>
                      <TableHeader>{t('created')}</TableHeader>
                      <TableHeader>{t('actions')}</TableHeader>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {filteredPublicOfferDrafts.map((draft) => (
                      <tr key={draft.id} className="hover:bg-linen/30 transition-colors">
                        <td className="px-3 py-2 font-medium">{draft.title || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-charcoal/60">{draft.slug || '—'}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={draft.status} />
                        </td>
                        <td className="px-3 py-2 text-charcoal/60">{draft.createdAt ? new Date(draft.createdAt).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setSelectedPublicOfferDraft(draft)}
                            className="text-xs text-sage hover:text-sage/80 underline"
                          >
                            {t('view')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

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

        <Panel title={t('scheduledJobs')} icon="ti-clock">
          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.scheduledJobs.length === 0 ? (
            <StateBlock icon="ti-calendar" title={t('noScheduledJobs')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t('scheduledJobsTableCaption')}</caption>
                <thead>
                  <tr className="border-b border-beige bg-linen/50">
                    <TableHeader>{t('name')}</TableHeader>
                    <TableHeader>{t('handler')}</TableHeader>
                    <TableHeader>{t('status')}</TableHeader>
                    <TableHeader>{t('cronExpression')}</TableHeader>
                    <TableHeader>{t('nextRun')}</TableHeader>
                    <TableHeader>{t('lastRun')}</TableHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {data.scheduledJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-linen/30 transition-colors">
                      <td className="px-3 py-2 font-medium">{job.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-charcoal/60">{job.handler}</td>
                      <td className="px-3 py-2"><StatusBadge status={job.status} /></td>
                      <td className="px-3 py-2 font-mono text-xs text-charcoal/60">{job.cronExpression || '—'}</td>
                      <td className="px-3 py-2 text-charcoal/60 text-xs">{job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 text-charcoal/60 text-xs">{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={t('connectors')} icon="ti-plug">
          {loading ? (
            <StateBlock icon="ti-loader-2 animate-spin" title={t('running')} />
          ) : data.connectors.length === 0 ? (
            <StateBlock icon="ti-plug" title={t('noConnectors')} />
          ) : (
            <div className="flex flex-wrap gap-4">
              {data.connectors.map((connector) => (
                <div key={connector.platform} className="flex items-center gap-3 rounded-lg border border-beige bg-linen/30 px-4 py-3 min-w-48">
                  <div className={`w-2.5 h-2.5 rounded-full ${connector.enabled ? 'bg-green-500' : 'bg-stone-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-charcoal capitalize">{connector.platform}</p>
                    <p className="text-xs text-charcoal/50">{connector.enabled ? t('connected') : t('disconnected')}</p>
                  </div>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${connector.enabled ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-400'}`}>
                    {connector.enabled ? t('active') : t('inactive')}
                  </span>
                </div>
              ))}
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
      {labels[status] ?? status}
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
