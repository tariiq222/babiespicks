'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { adminFetch } from '@/shared/lib/admin-fetch';

// ─── Types ────────────────────────────────────────────────────────────────────

// Website content
type ContentStatus =
  | 'PENDING_APPROVAL'
  | 'QUALITY_CHECK'
  | 'REVISION_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED';

type ContentType = 'BEST_LIST' | 'PRODUCT_REVIEW' | 'BUYING_GUIDE';

interface ApprovalItem {
  id: string;
  slug: string;
  type: ContentType;
  status: ContentStatus;
  seoScore: number | null;
  qualityScore: number | null;
  revisionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  titleAr: string | null;
  titleEn: string | null;
  bodyAr: string | null;
  bodyEn: string | null;
  seoTitleAr: string | null;
  seoTitleEn: string | null;
  seoDescAr: string | null;
  seoDescEn: string | null;
}

// Social posts
type SocialPostStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'FAILED';

interface TweetContent {
  text: string;
  mediaUrl?: string;
}

interface SocialPost {
  id: string;
  status: SocialPostStatus;
  productId: string | null;
  contentPageId: string | null;
  tweetsAr: TweetContent[];
  tweetsEn: TweetContent[];
  hashtagsAr: string[] | null;
  hashtagsEn: string[] | null;
  complianceScore: number | null;
  complianceNotes: string | null;
  scheduledAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

type MainTab = 'website' | 'social';
type WebsiteTab = 'PENDING_APPROVAL' | 'QUALITY_CHECK' | 'REVISION_REQUESTED';
type SocialActiveTab = 'PENDING_APPROVAL' | 'APPROVED' | 'SCHEDULED';
type BodyLang = 'ar' | 'en';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const WEBSITE_TABS: { id: WebsiteTab; label: string; icon: string }[] = [
  { id: 'PENDING_APPROVAL', label: 'بانتظار الموافقة', icon: 'ti-clock-hour-4' },
  { id: 'QUALITY_CHECK', label: 'فحص الجودة', icon: 'ti-shield-check' },
  { id: 'REVISION_REQUESTED', label: 'طلب تعديل', icon: 'ti-pencil' },
];

const SOCIAL_TABS: { id: SocialActiveTab; label: string; icon: string }[] = [
  { id: 'PENDING_APPROVAL', label: 'بانتظار الموافقة', icon: 'ti-clock-hour-4' },
  { id: 'APPROVED', label: 'موافق عليها', icon: 'ti-check' },
  { id: 'SCHEDULED', label: 'مجدولة', icon: 'ti-calendar-event' },
];

const CONTENT_TYPE_LABEL: Record<ContentType, { ar: string; classes: string }> = {
  BEST_LIST: { ar: 'قائمة أفضل', classes: 'bg-sage/15 text-sage-deep' },
  PRODUCT_REVIEW: { ar: 'مراجعة منتج', classes: 'bg-lavender/20 text-lavender-text' },
  BUYING_GUIDE: { ar: 'دليل الشراء', classes: 'bg-terracotta/10 text-terracotta' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function seoColor(score: number | null): string {
  if (score === null) return 'text-stone';
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function seoBg(score: number | null): string {
  if (score === null) return 'bg-linen text-stone';
  if (score >= 85) return 'bg-emerald-50 text-emerald-700';
  if (score >= 70) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

function complianceBg(score: number | null): string {
  if (score === null) return 'bg-linen text-stone';
  if (score >= 85) return 'bg-emerald-50 text-emerald-700';
  if (score >= 70) return 'bg-amber-50 text-amber-700';
  return 'bg-red-50 text-red-600';
}

function complianceColor(score: number | null): string {
  if (score === null) return 'text-stone';
  if (score >= 85) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function socialStatusBadge(status: SocialPostStatus): { label: string; classes: string } {
  switch (status) {
    case 'PENDING_APPROVAL':
      return { label: 'بانتظار الموافقة', classes: 'bg-amber-50 text-amber-700' };
    case 'APPROVED':
      return { label: 'موافق عليه', classes: 'bg-emerald-50 text-emerald-700' };
    case 'SCHEDULED':
      return { label: 'مجدول', classes: 'bg-blue-50 text-blue-700' };
    case 'PUBLISHED':
      return { label: 'منشور', classes: 'bg-sage/15 text-sage-deep' };
    case 'REJECTED':
      return { label: 'مرفوض', classes: 'bg-red-50 text-red-600' };
    case 'FAILED':
      return { label: 'فشل النشر', classes: 'bg-red-100 text-red-700' };
    default:
      return { label: 'مسودة', classes: 'bg-linen text-stone' };
  }
}

// ─── Safe-array helpers ───────────────────────────────────────────────────────

/** Cast value to T[] safely — returns [] for null/undefined/non-iterable. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [];
}

/**
 * Extract ApprovalItem[] from any backend response shape:
 * - ApprovalItem[] directly
 * - { items: ApprovalItem[] }
 * - any other shape → []
 */
function extractApprovalItems(payload: unknown): ApprovalItem[] {
  if (Array.isArray(payload)) return payload as ApprovalItem[];
  if (payload != null && typeof payload === 'object' && 'items' in payload) {
    return asArray<ApprovalItem>((payload as Record<string, unknown>).items);
  }
  return [];
}

/**
 * Extract SocialPost[] from any backend response shape.
 */
function extractSocialPosts(payload: unknown): SocialPost[] {
  if (Array.isArray(payload)) return payload as SocialPost[];
  if (payload != null && typeof payload === 'object' && 'items' in payload) {
    return asArray<SocialPost>((payload as Record<string, unknown>).items);
  }
  return [];
}

/**
 * Normalize a raw backend item to the UI's ApprovalItem shape.
 * Handles both old field names (bodyAr/bodyEn, seoTitleAr/seoTitleEn) and
 * new backend names (contentAr/contentEn, metaTitleAr/metaTitleEn,
 * metaDescAr/metaDescEn).
 */
function normalizeApprovalItem(raw: Partial<ApprovalItem> & { id: string }): ApprovalItem {
  return {
    id: raw.id,
    slug: raw.slug ?? '',
    type: raw.type ?? 'BEST_LIST',
    status: raw.status ?? 'PENDING_APPROVAL',
    seoScore: raw.seoScore ?? null,
    qualityScore: raw.qualityScore ?? null,
    revisionNotes: raw.revisionNotes ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
    titleAr: raw.titleAr ?? null,
    titleEn: raw.titleEn ?? null,
    // New backend may return contentAr/contentEn — map to bodyAr/bodyEn
    bodyAr: raw.bodyAr ?? ((raw as Record<string, unknown>).contentAr as string | null) ?? null,
    bodyEn: raw.bodyEn ?? ((raw as Record<string, unknown>).contentEn as string | null) ?? null,
    // New backend may return metaTitleAr/metaTitleEn — map to seoTitleAr/seoTitleEn
    seoTitleAr: raw.seoTitleAr ?? ((raw as Record<string, unknown>).metaTitleAr as string | null) ?? null,
    seoTitleEn: raw.seoTitleEn ?? ((raw as Record<string, unknown>).metaTitleEn as string | null) ?? null,
    seoDescAr: raw.seoDescAr ?? ((raw as Record<string, unknown>).metaDescAr as string | null) ?? null,
    seoDescEn: raw.seoDescEn ?? ((raw as Record<string, unknown>).metaDescEn as string | null) ?? null,
  };
}

/**
 * Normalize a raw SocialPost from any schema variant.
 * Supports:
 * - Already-normalized shape (tweetsAr/tweetsEn already set — no-op)
 * - New schema: content: { text, mediaUrl }, hashtags: string[]
 */
function normalizeSocialPost(raw: Partial<SocialPost> & { id: string }): SocialPost {
  // Already in UI shape — return as-is (idempotent)
  if (raw.tweetsAr != null || raw.tweetsEn != null) return raw as SocialPost;

  const rawRecord = raw as Record<string, unknown>;

  const normalizeContent = (c: unknown): TweetContent[] => {
    if (Array.isArray(c)) return c as TweetContent[];
    if (c != null && typeof c === 'object') return [c as TweetContent];
    return [];
  };

  return {
    id: raw.id,
    status: raw.status ?? 'DRAFT',
    productId: raw.productId ?? null,
    contentPageId: raw.contentPageId ?? null,
    tweetsAr: normalizeContent(rawRecord.contentAr ?? rawRecord.content),
    tweetsEn: normalizeContent(rawRecord.contentEn),
    hashtagsAr: asArray<string>(rawRecord.hashtagsAr ?? rawRecord.hashtags),
    hashtagsEn: asArray<string>(rawRecord.hashtagsEn),
    complianceScore: raw.complianceScore ?? null,
    complianceNotes: raw.complianceNotes ?? null,
    scheduledAt: raw.scheduledAt ?? null,
    approvedAt: raw.approvedAt ?? null,
    approvedBy: raw.approvedBy ?? null,
    createdAt: raw.createdAt ?? '',
    updatedAt: raw.updatedAt ?? '',
  };
}

// ─── Tweet Card ───────────────────────────────────────────────────────────────

function TweetCard({ tweet, index }: { tweet: TweetContent; index: number }) {
  return (
    <div className="bg-white border border-beige rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-sage/20 flex items-center justify-center flex-shrink-0">
          <span className="text-sage text-sm font-medium">ب</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal">BabiesPicks</p>
          <p className="text-xs text-stone">@babiespicks_sa</p>
        </div>
        {index > 0 && (
          <span className="mr-auto text-xs bg-linen text-stone px-2 py-0.5 rounded-full">
            تغريدة {index + 1}
          </span>
        )}
      </div>
      <p className="text-sm text-charcoal leading-relaxed whitespace-pre-wrap">{tweet.text}</p>
      {tweet.mediaUrl && (
        <div className="relative rounded-lg overflow-hidden border border-beige bg-linen h-32">
          <Image
            src={tweet.mediaUrl}
            alt="صورة التغريدة"
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <div className="flex items-center gap-5 text-stone">
        <span className="ti ti-message-circle text-sm" />
        <span className="ti ti-repeat text-sm" />
        <span className="ti ti-heart text-sm" />
        <span className="ti ti-upload text-sm" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  // ── Main tab ───────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('website');

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Website state ──────────────────────────────────────────────────────────
  const [webItems, setWebItems] = useState<ApprovalItem[]>([]);
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState<string | null>(null);
  const [webTab, setWebTab] = useState<WebsiteTab>('PENDING_APPROVAL');
  const [webSelectedId, setWebSelectedId] = useState<string | null>(null);
  const [bodyLang, setBodyLang] = useState<BodyLang>('ar');
  const [webActionLoading, setWebActionLoading] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [reviseNotes, setReviseNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // ── Social state ───────────────────────────────────────────────────────────
  const [socialItems, setSocialItems] = useState<SocialPost[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialCounts, setSocialCounts] = useState<Record<string, number>>({});
  const [socialTab, setSocialTab] = useState<SocialActiveTab>('PENDING_APPROVAL');
  const [socialSelectedId, setSocialSelectedId] = useState<string | null>(null);
  const [langTab, setLangTab] = useState<BodyLang>('ar');
  const [socialActionLoading, setSocialActionLoading] = useState(false);
  const [showSocialSchedule, setShowSocialSchedule] = useState(false);
  const [socialScheduleDate, setSocialScheduleDate] = useState('');
  const [showSocialReject, setShowSocialReject] = useState(false);
  const [socialRejectReason, setSocialRejectReason] = useState('');

  // ── Fetch: website ─────────────────────────────────────────────────────────

  const fetchWebItems = useCallback(async () => {
    setWebLoading(true);
    try {
      const res = await Promise.race([
        adminFetch(`${API_BASE}/admin/approvals`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('انتهت مهلة الاتصال — حاول مرة أخرى')), 10_000),
        ),
      ]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const items = extractApprovalItems(raw).map(normalizeApprovalItem);
      setWebItems(items);
    } catch (err) {
      setWebError(err instanceof Error ? err.message : 'فشل تحميل البيانات');
    } finally {
      setWebLoading(false);
    }
  }, []);

  // ── Fetch: social ──────────────────────────────────────────────────────────

  const fetchSocialItems = useCallback(async () => {
    setSocialLoading(true);
    try {
      const withTimeout = (p: Promise<Response>) =>
        Promise.race([
          p,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('انتهت مهلة الاتصال — حاول مرة أخرى')), 10_000),
          ),
        ]);

      const [pendingRes, approvedRes, scheduledRes] = await Promise.all([
        withTimeout(adminFetch(`${API_BASE}/admin/approvals/social?status=PENDING_APPROVAL`)),
        withTimeout(adminFetch(`${API_BASE}/admin/approvals/social?status=APPROVED`)),
        withTimeout(adminFetch(`${API_BASE}/admin/approvals/social?status=SCHEDULED`)),
      ]);

      if (!pendingRes.ok || !approvedRes.ok || !scheduledRes.ok) {
        throw new Error('فشل تحميل البيانات');
      }

      const [pendingData, approvedData, scheduledData] = await Promise.all([
        pendingRes.json(),
        approvedRes.json(),
        scheduledRes.json(),
      ]);

      const pendingItems = extractSocialPosts(pendingData).map(normalizeSocialPost);
      const approvedItems = extractSocialPosts(approvedData).map(normalizeSocialPost);
      const scheduledItems = extractSocialPosts(scheduledData).map(normalizeSocialPost);

      setSocialItems([...pendingItems, ...approvedItems, ...scheduledItems]);
      setSocialCounts(
        (pendingData as Record<string, unknown>)?.counts as Record<string, number> ?? {},
      );
    } catch (err) {
      setSocialError(err instanceof Error ? err.message : 'فشل تحميل البيانات');
    } finally {
      setSocialLoading(false);
    }
  }, []);

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => { await fetchWebItems(); })();
  }, [fetchWebItems]);

  // Load social only when that tab is active
  useEffect(() => {
    if (mainTab === 'social' && socialItems.length === 0 && !socialLoading && !socialError) {
      (async () => { await fetchSocialItems(); })();
    }
  }, [mainTab, socialItems.length, socialLoading, socialError, fetchSocialItems]);

  // ── Reset website forms ────────────────────────────────────────────────────

  const resetWebForms = () => {
    setShowSchedulePicker(false);
    setScheduleDate('');
    setShowReviseForm(false);
    setReviseNotes('');
    setShowRejectForm(false);
    setRejectReason('');
  };

  // ── Website actions ────────────────────────────────────────────────────────

  const runWebAction = async (
    id: string,
    endpoint: string,
    body?: Record<string, unknown>,
    successMsg = 'تمت العملية بنجاح',
  ) => {
    setWebActionLoading(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/${id}/${endpoint}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      showToast('success', successMsg);
      resetWebForms();
      setWebSelectedId(null);
      await fetchWebItems();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setWebActionLoading(false);
    }
  };

  const handleWebApprove = (id: string) => runWebAction(id, 'approve', undefined, 'تمت الموافقة على المحتوى ✅');
  const handleWebPostpone = (id: string) => runWebAction(id, 'postpone', undefined, 'تم تأجيل المحتوى ⏸️');
  const handleWebSchedule = (id: string) => {
    if (!scheduleDate) return;
    runWebAction(id, 'schedule', { scheduledAt: scheduleDate }, 'تمت جدولة المحتوى ⏰');
  };
  const handleWebRevise = (id: string) => {
    if (!reviseNotes.trim()) return;
    runWebAction(id, 'revise', { notes: reviseNotes.trim() }, 'تم إرسال طلب التعديل ✏️');
  };
  const handleWebReject = (id: string) => {
    runWebAction(
      id,
      'reject',
      rejectReason.trim() ? { reason: rejectReason.trim() } : undefined,
      'تم رفض المحتوى ❌',
    );
  };

  // ── Social actions ─────────────────────────────────────────────────────────

  const resetSocialForms = () => {
    setShowSocialSchedule(false);
    setSocialScheduleDate('');
    setShowSocialReject(false);
    setSocialRejectReason('');
  };

  const runSocialAction = async (
    postId: string,
    endpoint: string,
    body?: Record<string, unknown>,
    successMsg = 'تمت العملية بنجاح',
  ) => {
    setSocialActionLoading(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/social/${postId}/${endpoint}`, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      showToast('success', successMsg);
      resetSocialForms();
      setSocialSelectedId(null);
      await fetchSocialItems();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSocialActionLoading(false);
    }
  };

  const handleSocialApprove = (id: string) => runSocialAction(id, 'approve', undefined, 'تمت الموافقة ✅');
  const handleSocialSchedule = (id: string) => {
    if (!socialScheduleDate) return;
    runSocialAction(id, 'schedule', { scheduledAt: socialScheduleDate }, 'تمت الجدولة ⏰');
  };
  const handleSocialReject = (id: string) =>
    runSocialAction(
      id,
      'reject',
      socialRejectReason.trim() ? { reason: socialRejectReason.trim() } : undefined,
      'تم الرفض ❌',
    );

  const handlePublishAll = async () => {
    setSocialActionLoading(true);
    try {
      const res = await adminFetch(`${API_BASE}/admin/approvals/social/publish-approved`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as { published: number; failed: number };
      showToast(
        result.failed === 0 ? 'success' : 'error',
        `نُشر ${result.published} — فشل ${result.failed}`,
      );
      await fetchSocialItems();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setSocialActionLoading(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const webFiltered = webItems.filter((i) => i.status === webTab);
  const webSelected = webSelectedId ? webItems.find((i) => i.id === webSelectedId) ?? null : null;
  const webTabCounts: Record<WebsiteTab, number> = {
    PENDING_APPROVAL: webItems.filter((i) => i.status === 'PENDING_APPROVAL').length,
    QUALITY_CHECK: webItems.filter((i) => i.status === 'QUALITY_CHECK').length,
    REVISION_REQUESTED: webItems.filter((i) => i.status === 'REVISION_REQUESTED').length,
  };

  const socialFiltered = socialItems.filter((i) => i.status === socialTab);
  const socialSelected = socialSelectedId
    ? socialItems.find((i) => i.id === socialSelectedId) ?? null
    : null;
  const socialTabCounts: Record<SocialActiveTab, number> = {
    PENDING_APPROVAL: socialCounts['PENDING_APPROVAL'] ?? 0,
    APPROVED: socialCounts['APPROVED'] ?? 0,
    SCHEDULED: socialCounts['SCHEDULED'] ?? 0,
  };
  const selectedTweets = socialSelected
    ? langTab === 'ar'
      ? socialSelected.tweetsAr ?? []
      : socialSelected.tweetsEn ?? []
    : [];
  const selectedHashtags = socialSelected
    ? langTab === 'ar'
      ? socialSelected.hashtagsAr ?? []
      : socialSelected.hashtagsEn ?? []
    : [];

  const pendingWebCount = webTabCounts.PENDING_APPROVAL;
  const pendingSocialCount = socialTabCounts.PENDING_APPROVAL;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">الموافقات</h1>
        <button
          onClick={mainTab === 'website' ? fetchWebItems : fetchSocialItems}
          disabled={mainTab === 'website' ? webLoading : socialLoading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span
            className={`ti ti-refresh text-sm ${
              (mainTab === 'website' ? webLoading : socialLoading) ? 'animate-spin' : ''
            }`}
          />
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

      {/* ── Main Tab Bar ── */}
      <div className="bg-white border-b border-beige px-6 flex gap-1 flex-shrink-0">
        <MainTabButton
          id="website"
          label="محتوى الموقع"
          icon="ti-world"
          active={mainTab === 'website'}
          badge={pendingWebCount > 0 ? pendingWebCount : undefined}
          onClick={() => {
            setMainTab('website');
            setWebSelectedId(null);
            resetWebForms();
          }}
        />
        <MainTabButton
          id="social"
          label="السوشال ميديا"
          icon="ti-brand-twitter"
          active={mainTab === 'social'}
          badge={pendingSocialCount > 0 ? pendingSocialCount : undefined}
          onClick={() => {
            setMainTab('social');
            setSocialSelectedId(null);
            resetSocialForms();
          }}
        />
        {/* Publish all button in header area when on social/approved */}
        {mainTab === 'social' && socialTab === 'APPROVED' && socialTabCounts.APPROVED > 0 && (
          <div className="mr-auto flex items-center pb-1">
            <button
              onClick={handlePublishAll}
              disabled={socialActionLoading}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="ti ti-send text-xs" />
              نشر الموافق عليها ({socialTabCounts.APPROVED})
            </button>
          </div>
        )}
      </div>

      {/* ── WEBSITE TAB ── */}
      {mainTab === 'website' && (
        <>
          {/* Sub-tabs */}
          <div className="bg-white border-b border-beige px-6 flex gap-1 flex-shrink-0">
            {WEBSITE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setWebTab(tab.id);
                  setWebSelectedId(null);
                  resetWebForms();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs transition-colors border-b-2 -mb-px ${
                  webTab === tab.id
                    ? 'border-sage text-charcoal font-medium'
                    : 'border-transparent text-stone hover:text-charcoal'
                }`}
              >
                <span className={`ti ${tab.icon} text-sm`} />
                <span>{tab.label}</span>
                {webTabCounts[tab.id] > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-4 rounded-full text-[10px] font-medium px-1 ${
                      webTab === tab.id ? 'bg-sage text-cream' : 'bg-linen text-stone'
                    }`}
                  >
                    {webTabCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left list panel */}
            <div className="w-80 flex-shrink-0 border-l border-beige bg-white flex flex-col overflow-hidden">
              {webLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-stone">جارٍ التحميل...</span>
                </div>
              ) : webError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
                  <span className="ti ti-alert-circle text-2xl text-terracotta" />
                  <p className="text-xs text-stone text-center">{webError}</p>
                  <button onClick={fetchWebItems} className="text-xs text-sage hover:text-charcoal underline">
                    إعادة المحاولة
                  </button>
                </div>
              ) : webFiltered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
                  <span className="ti ti-inbox text-3xl text-stone/40" />
                  <p className="text-xs text-stone text-center">لا توجد عناصر في هذه القائمة</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-beige">
                  {webFiltered.map((item) => {
                    const isSelected = item.id === webSelectedId;
                    const typeConfig = CONTENT_TYPE_LABEL[item.type];
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setWebSelectedId(item.id === webSelectedId ? null : item.id);
                          resetWebForms();
                        }}
                        className={`w-full text-right px-4 py-4 transition-colors flex flex-col gap-2 ${
                          isSelected
                            ? 'bg-sage/8 border-r-2 border-sage'
                            : 'hover:bg-linen/60 border-r-2 border-transparent'
                        }`}
                      >
                        <p className="text-sm font-medium text-charcoal leading-snug line-clamp-2">
                          {item.titleAr ?? item.slug}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${typeConfig.classes}`}>
                            {typeConfig.ar}
                          </span>
                          <span className="text-[10px] text-stone">{formatDate(item.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] font-medium tabular-nums ${seoColor(item.seoScore)}`}>
                            SEO: {item.seoScore !== null ? item.seoScore : '—'}
                          </span>
                          <span className="text-[10px] text-stone">
                            جودة: {item.qualityScore !== null ? item.qualityScore : '—'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right detail panel */}
            <div className="flex-1 overflow-y-auto bg-cream">
              {!webSelected ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                  <span className="ti ti-file-search text-5xl text-stone/30" />
                  <p className="text-sm text-stone">اختر محتوى من القائمة لعرض التفاصيل</p>
                </div>
              ) : (
                <div className="p-6 space-y-6 max-w-3xl">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg font-medium text-charcoal leading-snug">
                        {webSelected.titleAr ?? webSelected.slug}
                      </h2>
                      <p className="text-sm text-stone mt-0.5">{webSelected.titleEn ?? ''}</p>
                      <p className="text-xs font-mono text-stone/70 mt-1">{webSelected.slug}</p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded ${CONTENT_TYPE_LABEL[webSelected.type].classes}`}>
                      {CONTENT_TYPE_LABEL[webSelected.type].ar}
                    </span>
                  </div>

                  {/* Score cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`rounded-xl px-5 py-4 ${seoBg(webSelected.seoScore)}`}>
                      <p className="text-xs opacity-70 mb-1">درجة SEO</p>
                      <p className="text-3xl font-medium tabular-nums">
                        {webSelected.seoScore !== null ? webSelected.seoScore : '—'}
                      </p>
                      <p className="text-xs opacity-60 mt-1">
                        {webSelected.seoScore === null
                          ? 'غير محسوب'
                          : webSelected.seoScore >= 85
                          ? 'ممتاز'
                          : webSelected.seoScore >= 70
                          ? 'جيد — يحتاج تحسيناً'
                          : 'ضعيف — يجب تحسينه'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-beige px-5 py-4">
                      <p className="text-xs text-stone mb-1">درجة الجودة</p>
                      <p className="text-3xl font-medium text-charcoal tabular-nums">
                        {webSelected.qualityScore !== null ? webSelected.qualityScore : '—'}
                      </p>
                      <p className="text-xs text-stone mt-1">{formatDate(webSelected.updatedAt)}</p>
                    </div>
                  </div>

                  {/* SEO meta */}
                  {(webSelected.seoTitleAr || webSelected.seoTitleEn || webSelected.seoDescAr || webSelected.seoDescEn) && (
                    <div className="bg-white rounded-xl border border-beige p-5 space-y-3">
                      <h3 className="text-xs font-medium text-charcoal mb-3">بيانات SEO</h3>
                      {webSelected.seoTitleAr && (
                        <div>
                          <p className="text-[10px] text-stone mb-0.5">عنوان SEO (عربي)</p>
                          <p className="text-sm text-charcoal">{webSelected.seoTitleAr}</p>
                        </div>
                      )}
                      {webSelected.seoTitleEn && (
                        <div>
                          <p className="text-[10px] text-stone mb-0.5">SEO Title (English)</p>
                          <p className="text-sm text-charcoal" dir="ltr">{webSelected.seoTitleEn}</p>
                        </div>
                      )}
                      {webSelected.seoDescAr && (
                        <div>
                          <p className="text-[10px] text-stone mb-0.5">وصف SEO (عربي)</p>
                          <p className="text-xs text-stone leading-relaxed">{webSelected.seoDescAr}</p>
                        </div>
                      )}
                      {webSelected.seoDescEn && (
                        <div>
                          <p className="text-[10px] text-stone mb-0.5">SEO Description (English)</p>
                          <p className="text-xs text-stone leading-relaxed" dir="ltr">{webSelected.seoDescEn}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Revision notes */}
                  {webSelected.revisionNotes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="ti ti-pencil text-amber-600 text-sm" />
                        <p className="text-xs font-medium text-amber-800">ملاحظات التعديل</p>
                      </div>
                      <p className="text-sm text-amber-700 leading-relaxed whitespace-pre-wrap">
                        {webSelected.revisionNotes}
                      </p>
                    </div>
                  )}

                  {/* Content preview */}
                  <div className="bg-white rounded-xl border border-beige overflow-hidden">
                    <div className="flex border-b border-beige">
                      <button
                        onClick={() => setBodyLang('ar')}
                        className={`px-5 py-3 text-sm transition-colors ${
                          bodyLang === 'ar'
                            ? 'border-b-2 border-sage text-charcoal font-medium'
                            : 'text-stone hover:text-charcoal'
                        }`}
                      >
                        عربي
                      </button>
                      <button
                        onClick={() => setBodyLang('en')}
                        className={`px-5 py-3 text-sm transition-colors ${
                          bodyLang === 'en'
                            ? 'border-b-2 border-sage text-charcoal font-medium'
                            : 'text-stone hover:text-charcoal'
                        }`}
                      >
                        English
                      </button>
                    </div>
                    <div className="p-5 max-h-72 overflow-y-auto">
                      {bodyLang === 'ar' ? (
                        webSelected.bodyAr ? (
                          <div
                            className="text-sm text-charcoal leading-relaxed prose prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: webSelected.bodyAr }}
                          />
                        ) : (
                          <p className="text-sm text-stone italic">لا يوجد محتوى عربي</p>
                        )
                      ) : webSelected.bodyEn ? (
                        <div
                          className="text-sm text-charcoal leading-relaxed prose prose-sm max-w-none"
                          dir="ltr"
                          dangerouslySetInnerHTML={{ __html: webSelected.bodyEn }}
                        />
                      ) : (
                        <p className="text-sm text-stone italic" dir="ltr">No English content</p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="bg-white rounded-xl border border-beige p-5 space-y-4">
                    <h3 className="text-xs font-medium text-charcoal">الإجراءات</h3>
                    <div className="flex flex-wrap gap-3">
                      <ActionBtn
                        onClick={() => handleWebApprove(webSelected.id)}
                        loading={webActionLoading}
                        icon="ti-check"
                        label="موافقة"
                        classes="bg-emerald-600 hover:bg-emerald-700 text-white"
                      />
                      <ActionBtn
                        onClick={() => {
                          setShowSchedulePicker(!showSchedulePicker);
                          setShowReviseForm(false);
                          setShowRejectForm(false);
                        }}
                        loading={webActionLoading}
                        icon="ti-calendar-event"
                        label="جدولة"
                        classes={showSchedulePicker ? 'bg-blue-600 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'}
                      />
                      <ActionBtn
                        onClick={() => {
                          setShowReviseForm(!showReviseForm);
                          setShowSchedulePicker(false);
                          setShowRejectForm(false);
                        }}
                        loading={webActionLoading}
                        icon="ti-pencil"
                        label="تعديل"
                        classes={showReviseForm ? 'bg-amber-500 text-white' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'}
                      />
                      <ActionBtn
                        onClick={() => {
                          setShowRejectForm(!showRejectForm);
                          setShowSchedulePicker(false);
                          setShowReviseForm(false);
                        }}
                        loading={webActionLoading}
                        icon="ti-x"
                        label="رفض"
                        classes={showRejectForm ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'}
                      />
                      <ActionBtn
                        onClick={() => handleWebPostpone(webSelected.id)}
                        loading={webActionLoading}
                        icon="ti-player-pause"
                        label="تأجيل"
                        classes="bg-stone/10 hover:bg-stone/20 text-stone"
                      />
                    </div>

                    {showSchedulePicker && (
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                        <p className="text-xs font-medium text-blue-800">اختر موعد النشر</p>
                        <input
                          type="datetime-local"
                          value={scheduleDate}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <button
                          onClick={() => handleWebSchedule(webSelected.id)}
                          disabled={webActionLoading || !scheduleDate}
                          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                        >
                          {webActionLoading ? 'جارٍ الجدولة...' : 'تأكيد الجدولة'}
                        </button>
                      </div>
                    )}

                    {showReviseForm && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
                        <p className="text-xs font-medium text-amber-800">ملاحظات التعديل</p>
                        <textarea
                          value={reviseNotes}
                          onChange={(e) => setReviseNotes(e.target.value)}
                          placeholder="اكتب ملاحظاتك للكاتب..."
                          rows={3}
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                        />
                        <button
                          onClick={() => handleWebRevise(webSelected.id)}
                          disabled={webActionLoading || !reviseNotes.trim()}
                          className="w-full rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                        >
                          {webActionLoading ? 'جارٍ الإرسال...' : 'إرسال طلب التعديل'}
                        </button>
                      </div>
                    )}

                    {showRejectForm && (
                      <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
                        <p className="text-xs font-medium text-red-800">سبب الرفض (اختياري)</p>
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="اكتب سبب الرفض..."
                          rows={2}
                          className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                        />
                        <button
                          onClick={() => handleWebReject(webSelected.id)}
                          disabled={webActionLoading}
                          className="w-full rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                        >
                          {webActionLoading ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
                        </button>
                      </div>
                    )}

                    {webActionLoading && (
                      <div className="flex items-center gap-2 text-xs text-stone">
                        <span className="ti ti-loader animate-spin text-sm" />
                        جارٍ تنفيذ الإجراء...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── SOCIAL TAB ── */}
      {mainTab === 'social' && (
        <>
          {/* Sub-tabs */}
          <div className="bg-white border-b border-beige px-6 flex gap-1 flex-shrink-0">
            {SOCIAL_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setSocialTab(tab.id);
                  setSocialSelectedId(null);
                  resetSocialForms();
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs transition-colors border-b-2 -mb-px ${
                  socialTab === tab.id
                    ? 'border-sage text-charcoal font-medium'
                    : 'border-transparent text-stone hover:text-charcoal'
                }`}
              >
                <span className={`ti ${tab.icon} text-sm`} />
                <span>{tab.label}</span>
                {socialTabCounts[tab.id] > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-4 rounded-full text-[10px] font-medium px-1 ${
                      socialTab === tab.id ? 'bg-sage text-cream' : 'bg-linen text-stone'
                    }`}
                  >
                    {socialTabCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left list panel */}
            <div className="w-80 flex-shrink-0 border-l border-beige bg-white flex flex-col overflow-hidden">
              {socialLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-xs text-stone">جارٍ التحميل...</span>
                </div>
              ) : socialError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
                  <span className="ti ti-alert-circle text-2xl text-terracotta" />
                  <p className="text-xs text-stone text-center">{socialError}</p>
                  <button onClick={fetchSocialItems} className="text-xs text-sage hover:text-charcoal underline">
                    إعادة المحاولة
                  </button>
                </div>
              ) : socialFiltered.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4">
                  <span className="ti ti-brand-twitter text-3xl text-stone/40" />
                  <p className="text-xs text-stone text-center">لا توجد عناصر في هذه القائمة</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto divide-y divide-beige">
                  {socialFiltered.map((item) => {
                    const isSelected = item.id === socialSelectedId;
                    const badge = socialStatusBadge(item.status);
                    const firstTweetAr = item.tweetsAr?.[0];
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSocialSelectedId(item.id === socialSelectedId ? null : item.id);
                          resetSocialForms();
                        }}
                        className={`w-full text-right px-4 py-4 transition-colors flex flex-col gap-2 ${
                          isSelected
                            ? 'bg-sage/8 border-r-2 border-sage'
                            : 'hover:bg-linen/60 border-r-2 border-transparent'
                        }`}
                      >
                        <p className="text-sm font-medium text-charcoal leading-snug line-clamp-2">
                          {firstTweetAr?.text ?? 'بدون نص'}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${badge.classes}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-stone">{formatDate(item.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="ti ti-shield-check text-xs text-stone" />
                          <span className={`text-[11px] font-medium tabular-nums ${complianceColor(item.complianceScore)}`}>
                            امتثال: {item.complianceScore !== null ? item.complianceScore : '—'}
                          </span>
                          <span className="text-[10px] text-stone">
                            {item.tweetsAr?.length ?? 0} تغريدة
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right detail panel */}
            <div className="flex-1 overflow-y-auto bg-cream">
              {!socialSelected ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                  <span className="ti ti-brand-twitter text-5xl text-stone/30" />
                  <p className="text-sm text-stone">اختر منشوراً من القائمة لعرض التفاصيل</p>
                </div>
              ) : (
                <div className="p-6 space-y-6 max-w-2xl">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-brand-twitter text-blue-500 text-lg" />
                        <h2 className="text-base font-medium text-charcoal">
                          خيط تغريدات ({socialSelected.tweetsAr?.length ?? 0} تغريدة)
                        </h2>
                      </div>
                      <p className="text-xs font-mono text-stone/70 mt-1">{socialSelected.id}</p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded ${socialStatusBadge(socialSelected.status).classes}`}>
                      {socialStatusBadge(socialSelected.status).label}
                    </span>
                  </div>

                  {/* Score cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`rounded-xl px-5 py-4 ${complianceBg(socialSelected.complianceScore)}`}>
                      <p className="text-xs opacity-70 mb-1">درجة الامتثال</p>
                      <p className="text-3xl font-medium tabular-nums">
                        {socialSelected.complianceScore !== null ? socialSelected.complianceScore : '—'}
                      </p>
                      <p className="text-xs opacity-60 mt-1">
                        {socialSelected.complianceScore === null
                          ? 'غير محسوبة'
                          : socialSelected.complianceScore >= 85
                          ? 'ممتازة'
                          : socialSelected.complianceScore >= 70
                          ? 'جيدة'
                          : 'تحتاج مراجعة'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-beige px-5 py-4">
                      <p className="text-xs text-stone mb-1">عدد التغريدات</p>
                      <div className="flex items-end gap-2">
                        <p className="text-3xl font-medium text-charcoal tabular-nums">
                          {socialSelected.tweetsAr?.length ?? 0}
                        </p>
                        <p className="text-xs text-stone pb-1">
                          عربي / {socialSelected.tweetsEn?.length ?? 0} إنجليزي
                        </p>
                      </div>
                      <p className="text-xs text-stone mt-1">{formatDate(socialSelected.createdAt)}</p>
                    </div>
                  </div>

                  {/* Compliance notes */}
                  {socialSelected.complianceNotes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="ti ti-shield-exclamation text-amber-600 text-sm" />
                        <p className="text-xs font-medium text-amber-800">ملاحظات الامتثال</p>
                      </div>
                      <p className="text-sm text-amber-700 leading-relaxed whitespace-pre-wrap">
                        {socialSelected.complianceNotes}
                      </p>
                    </div>
                  )}

                  {/* Tweets preview */}
                  <div className="bg-white rounded-xl border border-beige overflow-hidden">
                    <div className="flex border-b border-beige">
                      <button
                        onClick={() => setLangTab('ar')}
                        className={`px-5 py-3 text-sm transition-colors ${
                          langTab === 'ar'
                            ? 'border-b-2 border-sage text-charcoal font-medium'
                            : 'text-stone hover:text-charcoal'
                        }`}
                      >
                        عربي ({socialSelected.tweetsAr?.length ?? 0})
                      </button>
                      <button
                        onClick={() => setLangTab('en')}
                        className={`px-5 py-3 text-sm transition-colors ${
                          langTab === 'en'
                            ? 'border-b-2 border-sage text-charcoal font-medium'
                            : 'text-stone hover:text-charcoal'
                        }`}
                      >
                        English ({socialSelected.tweetsEn?.length ?? 0})
                      </button>
                    </div>
                    <div
                      className="p-4 space-y-3 max-h-96 overflow-y-auto"
                      dir={langTab === 'ar' ? 'rtl' : 'ltr'}
                    >
                      {selectedTweets.length === 0 ? (
                        <p className="text-sm text-stone text-center py-6">لا توجد تغريدات</p>
                      ) : (
                        selectedTweets.map((tweet, idx) => (
                          <TweetCard key={idx} tweet={tweet} index={idx} />
                        ))
                      )}
                    </div>
                    {selectedHashtags.length > 0 && (
                      <div className="border-t border-beige px-4 py-3">
                        <p className="text-xs text-stone mb-2">الهاشتاقات</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedHashtags.map((tag, idx) => (
                            <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {tag.startsWith('#') ? tag : `#${tag}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Social actions — PENDING */}
                  {socialSelected.status === 'PENDING_APPROVAL' && (
                    <div className="bg-white rounded-xl border border-beige p-5 space-y-4">
                      <h3 className="text-xs font-medium text-charcoal">الإجراءات</h3>
                      <div className="flex flex-wrap gap-3">
                        <ActionBtn
                          onClick={() => handleSocialApprove(socialSelected.id)}
                          loading={socialActionLoading}
                          icon="ti-check"
                          label="موافقة"
                          classes="bg-emerald-600 hover:bg-emerald-700 text-white"
                        />
                        <ActionBtn
                          onClick={() => {
                            setShowSocialSchedule(!showSocialSchedule);
                            setShowSocialReject(false);
                          }}
                          loading={socialActionLoading}
                          icon="ti-calendar-event"
                          label="جدولة"
                          classes={showSocialSchedule ? 'bg-blue-600 text-white' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'}
                        />
                        <ActionBtn
                          onClick={() => {
                            setShowSocialReject(!showSocialReject);
                            setShowSocialSchedule(false);
                          }}
                          loading={socialActionLoading}
                          icon="ti-x"
                          label="رفض"
                          classes={showSocialReject ? 'bg-red-600 text-white' : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'}
                        />
                      </div>

                      {showSocialSchedule && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                          <p className="text-xs font-medium text-blue-800">اختر موعد النشر</p>
                          <input
                            type="datetime-local"
                            value={socialScheduleDate}
                            onChange={(e) => setSocialScheduleDate(e.target.value)}
                            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-blue-300"
                          />
                          <button
                            onClick={() => handleSocialSchedule(socialSelected.id)}
                            disabled={socialActionLoading || !socialScheduleDate}
                            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                          >
                            {socialActionLoading ? 'جارٍ الجدولة...' : 'تأكيد الجدولة'}
                          </button>
                        </div>
                      )}

                      {showSocialReject && (
                        <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-3">
                          <p className="text-xs font-medium text-red-800">سبب الرفض (اختياري)</p>
                          <textarea
                            value={socialRejectReason}
                            onChange={(e) => setSocialRejectReason(e.target.value)}
                            placeholder="اكتب سبب الرفض..."
                            rows={2}
                            className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-charcoal placeholder-stone focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                          />
                          <button
                            onClick={() => handleSocialReject(socialSelected.id)}
                            disabled={socialActionLoading}
                            className="w-full rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 transition-colors disabled:opacity-50"
                          >
                            {socialActionLoading ? 'جارٍ الرفض...' : 'تأكيد الرفض'}
                          </button>
                        </div>
                      )}

                      {socialActionLoading && (
                        <div className="flex items-center gap-2 text-xs text-stone">
                          <span className="ti ti-loader animate-spin text-sm" />
                          جارٍ تنفيذ الإجراء...
                        </div>
                      )}
                    </div>
                  )}

                  {/* APPROVED: publish button */}
                  {socialSelected.status === 'APPROVED' && (
                    <div className="bg-white rounded-xl border border-beige p-5">
                      <h3 className="text-xs font-medium text-charcoal mb-4">الإجراءات</h3>
                      <button
                        onClick={handlePublishAll}
                        disabled={socialActionLoading}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-50"
                      >
                        <span className="ti ti-brand-twitter text-base" />
                        نشر على تويتر الآن
                      </button>
                    </div>
                  )}

                  {/* SCHEDULED: date info */}
                  {socialSelected.status === 'SCHEDULED' && socialSelected.scheduledAt && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="flex items-center gap-2">
                        <span className="ti ti-calendar-event text-blue-600 text-sm" />
                        <p className="text-sm font-medium text-blue-800">
                          مجدول للنشر: {formatDate(socialSelected.scheduledAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function MainTabButton({
  id,
  label,
  icon,
  active,
  badge,
  onClick,
}: {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      key={id}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${
        active
          ? 'border-sage text-charcoal font-medium'
          : 'border-transparent text-stone hover:text-charcoal'
      }`}
    >
      <span className={`ti ${icon} text-base`} />
      <span>{label}</span>
      {badge !== undefined && (
        <span
          className={`inline-flex items-center justify-center min-w-[20px] h-5 rounded-full text-[11px] font-medium px-1.5 ${
            active ? 'bg-sage text-cream' : 'bg-linen text-stone'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ActionBtn({
  onClick,
  loading,
  icon,
  label,
  classes,
}: {
  onClick: () => void;
  loading: boolean;
  icon: string;
  label: string;
  classes: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 rounded-lg text-sm font-medium px-4 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${classes}`}
    >
      <span className={`ti ${icon} text-base`} />
      {label}
    </button>
  );
}
