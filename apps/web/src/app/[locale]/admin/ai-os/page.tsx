'use client';

import { useState, useCallback, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { adminFetch } from '@/shared/lib/admin-fetch';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface OverviewStats {
  aiOs: {
    totalRuns: number;
    runsCompleted: number;
    runsFailed: number;
    runsRunning: number;
    runsPending: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  legacy: {
    totalJobs: number;
    completedJobs: number;
  };
  combined: {
    totalRuns: number;
    completedRuns: number;
  };
  queue?: {
    implementation: 'in-process' | 'bullmq';
    pending: number;
    active: number;
    failed: number;
  };
}

interface NewRunForm {
  name: string;
  type: string;
  input?: unknown;
}

interface ContentPageSearchItem {
  id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  locales: string[];
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Run types that are placeholders / future work */
const PLACEHOLDER_TYPES = ['CONTENT_SPRINT'];

/** UI type label for social pipeline — maps to backend MANUAL + action=social_pipeline */
const SOCIAL_PIPELINE_UI = 'SOCIAL_PIPELINE_UI';

const RUN_TYPE_OPTIONS = [
  { value: 'PRODUCT_PIPELINE', label: 'ذكاء المنتجات', real: true },
  { value: 'CONTENT_PIPELINE', label: 'المحتوى', real: true },
  { value: 'SOCIAL_PIPELINE_UI', label: 'سوشيال ميديا', real: true },
  { value: 'DISCOVERY', label: 'اكتشاف المنتجات', real: true },
  { value: 'CONTENT_SPRINT', label: 'سبرنت المحتوى', real: false },
];

const MAIN_WORKFLOW_CARDS = [
  {
    value: 'PRODUCT_PIPELINE',
    icon: 'ti-package-export',
    title: 'حلل منتج',
    subtitle: 'Product intelligence',
    desc: 'أدخل رابط المنتج ليجلب النظام البيانات ويحلل المراجعات ويصدر الحكم.',
  },
  {
    value: 'CONTENT_PIPELINE',
    icon: 'ti-writing',
    title: 'أنشئ محتوى',
    subtitle: 'Content pipeline',
    desc: 'اكتب موضوعاً ليبني النظام خطة SEO ومحتوى ثنائي اللغة جاهزاً للمراجعة.',
  },
  {
    value: 'DISCOVERY',
    icon: 'ti-radar-2',
    title: 'اكتشف منتجات',
    subtitle: 'Amazon / Noon discovery',
    desc: 'شغّل اكتشاف منتجات جديد من Amazon أو Noon أو الاثنين ثم عالجها عبر خط المنتجات.',
  },
  {
    value: SOCIAL_PIPELINE_UI,
    icon: 'ti-share-3',
    title: 'جهز منشورات سوشيال',
    subtitle: 'Social pipeline',
    desc: 'اختر صفحة محتوى ليجهز النظام منشورات X/Twitter وتيليجرام.',
  },
];

const COMING_NEXT = [
  {
    icon: 'ti-calendar-plus',
    title: 'سبرنت المحتوى',
    desc: 'تخطيط دفعات محتوى كاملة من فكرة إلى نشر',
    status: 'قريباً',
  },
  {
    icon: 'ti-photo',
    title: 'مكتبة الوسائط',
    desc: 'إدارة الصور والفيديوهات المولَّدة',
    status: 'قريباً',
  },
];

/* ─── Shared badge ───────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot?: boolean }> = {
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
      {status}
    </span>
  );
}

/* ─── Stat card ──────────────────────────────────────────────────────────── */

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = 'sage',
  href,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'sage' | 'terracotta' | 'lavender';
  href?: string;
}) {
  const accentCls = {
    sage: 'text-sage',
    terracotta: 'text-terracotta',
    lavender: 'text-lavender-text',
  }[accent];

  if (href) {
    return (
      <Link
        href={href}
        className="bg-white rounded-xl border border-beige p-5 transition-colors hover:border-sage/40 group cursor-pointer"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-stone">{label}</p>
          <span className={`ti ${icon} text-lg ${accentCls}`} />
        </div>
        <p className="text-2xl font-medium text-charcoal tabular-nums">{value}</p>
        {sub && <p className="text-[10px] text-stone mt-1.5">{sub}</p>}
        <p className="text-[10px] text-sage mt-1.5 group-hover:underline">
          عرض التفاصيل ←
        </p>
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-beige p-5 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-stone">{label}</p>
        <span className={`ti ${icon} text-lg ${accentCls}`} />
      </div>
      <p className="text-2xl font-medium text-charcoal tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-stone mt-1.5">{sub}</p>}
    </div>
  );
}

/* ─── Queue status card ──────────────────────────────────────────────────── */

function QueueStatusCard({
  implementation,
  pending,
  active,
  failed,
}: {
  implementation: 'in-process' | 'bullmq';
  pending: number;
  active: number;
  failed: number;
}) {
  if (implementation === 'bullmq') {
    return (
      <div className="bg-sage/5 border border-sage/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-sage/10 flex items-center justify-center">
            <span className="ti ti-server text-sm text-sage" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-charcoal truncate">طابور المعالجة</p>
            <p className="text-[10px] text-sage font-medium">Redis / BullMQ نشط</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-sage animate-pulse flex-shrink-0" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-semibold text-charcoal tabular-nums">{pending}</p>
            <p className="text-[10px] text-stone">بانتظار</p>
          </div>
          <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-semibold text-charcoal tabular-nums">{active}</p>
            <p className="text-[10px] text-stone">نشط</p>
          </div>
          <div className="bg-white/70 rounded-lg px-3 py-2 text-center">
            <p className={`text-lg font-semibold tabular-nums ${failed > 0 ? 'text-red-500' : 'text-charcoal'}`}>
              {failed}
            </p>
            <p className="text-[10px] text-stone">فاشل</p>
          </div>
        </div>
          <div className="mt-3 pt-3 border-t border-sage/15 flex items-start gap-1.5">
          <span className="ti ti-rocket text-[10px] text-sage mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-stone leading-relaxed">
            إعادة المحاولة التلقائية عبر BullMQ مفعّلة الآن — خطوط المنتجات والمحتوى والاكتشاف والسوشيال ميديا مُنفَّذة فعلياً.
          </p>
        </div>
      </div>
    );
  }

  // in-process
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
          <span className="ti ti-alert-triangle text-sm text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800 truncate">طابور المعالجة</p>
          <p className="text-[10px] text-amber-600 font-medium">غير مستمر — للتطوير فقط</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-3">
        <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
          تنفيذ في الذاكرة
        </span>
        <span className="text-[10px] bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
          لا يُستخدم في الإنتاج
        </span>
      </div>
        <div className="mt-3 pt-3 border-t border-amber-200 flex items-start gap-1.5">
          <span className="ti ti-info-circle text-[10px] text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-amber-600 leading-relaxed">
            BullMQ / Redis متاح في الإنتاج — وضع in-process للتطوير فقط
          </p>
        </div>
    </div>
  );
}

/* ─── Coming Next card ───────────────────────────────────────────────────── */

function ComingCard({ icon, title, desc, status }: (typeof COMING_NEXT)[0]) {
  return (
    <div className="bg-linen/60 rounded-xl border border-beige p-4 opacity-80">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center">
          <span className={`ti ${icon} text-sm text-stone`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-charcoal truncate">{title}</p>
          <p className="text-[10px] text-stone leading-tight">{desc}</p>
        </div>
        <span className="text-[10px] bg-lavender text-lavender-text rounded-full px-2 py-0.5 flex-shrink-0">
          {status}
        </span>
      </div>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function AiOsOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [newRunType, setNewRunType] = useState('PRODUCT_PIPELINE');
  const [newRunName, setNewRunName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startSuccess, setStartSuccess] = useState<string | null>(null);

  /* CONTENT_PIPELINE fields */
  const [contentType, setContentType] = useState('BEST_LIST');
  const [topic, setTopic] = useState('');
  const [slug, setSlug] = useState('');
  const [productIds, setProductIds] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [contentTopicError, setContentTopicError] = useState<string | null>(null);

  /* DISCOVERY fields */
  const [discoverySource, setDiscoverySource] = useState<'amazon' | 'noon' | 'all'>('all');
  const [discoveryMaxProducts, setDiscoveryMaxProducts] = useState('10');
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  /* SOCIAL_PIPELINE_UI fields */
  const [contentPageId, setContentPageId] = useState('');
  const [platformTwitter, setPlatformTwitter] = useState(true);
  const [platformTelegram, setPlatformTelegram] = useState(false);
  const [socialPageError, setSocialPageError] = useState<string | null>(null);

  /* Content page picker state */
  const [cpSearchQuery, setCpSearchQuery] = useState('');
  const [cpSearchResults, setCpSearchResults] = useState<ContentPageSearchItem[]>([]);
  const [cpSearchLoading, setCpSearchLoading] = useState(false);
  const [cpSearchError, setCpSearchError] = useState<string | null>(null);
  const [cpShowManual, setCpShowManual] = useState(false);
  const [cpDropdownOpen, setCpDropdownOpen] = useState(false);

  /* ── Content page search ─────────────────────────────────────────── */

  const searchContentPages = useCallback(async (query: string) => {
    setCpSearchLoading(true);
    setCpSearchError(null);
    try {
      const url = `${API_BASE}/admin/content-pages?query=${encodeURIComponent(query)}&limit=20`;
      const res = await adminFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCpSearchResults(data.items ?? []);
    } catch (err) {
      setCpSearchError(err instanceof Error ? err.message : 'فشل البحث');
      setCpSearchResults([]);
    } finally {
      setCpSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (cpShowManual) {
      return undefined;
    }

    const trimmedQuery = cpSearchQuery.trim();
    const openTimer = setTimeout(() => setCpDropdownOpen(true), 0);
    const searchTimer = setTimeout(
      () => { void searchContentPages(trimmedQuery); },
      trimmedQuery.length > 0 ? 300 : 150,
    );

    return () => {
      clearTimeout(openTimer);
      clearTimeout(searchTimer);
    };
  }, [cpSearchQuery, cpShowManual, searchContentPages]);

  /* ── Fetch overview ─────────────────────────────────────────────── */

  const fetchOverview = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await adminFetch(`${API_BASE}/admin/ai-os/overview`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'فشل جلب البيانات');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const timer = setTimeout(() => { void fetchOverview(); }, 0);
    return () => clearTimeout(timer);
  }, [fetchOverview]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => { void fetchOverview(); }, 30_000);
    return () => clearInterval(id);
  }, [fetchOverview]);

  /* ── Start new run ──────────────────────────────────────────────── */

  async function handleStartRun(e: React.FormEvent) {
    e.preventDefault();
    setStartLoading(true);
    setStartError(null);
    setStartSuccess(null);
    setUrlError(null);
    setContentTopicError(null);
    setDiscoveryError(null);
    setSocialPageError(null);

    const isProductRun = newRunType === 'PRODUCT_PIPELINE';
    const isContentRun = newRunType === 'CONTENT_PIPELINE';
    const isDiscoveryRun = newRunType === 'DISCOVERY';
    const isSocialRun = newRunType === SOCIAL_PIPELINE_UI;

    // Client-side validation: PRODUCT_PIPELINE requires a URL
    if (isProductRun && !productUrl.trim()) {
      setUrlError('يُرجى إدخال رابط المنتج لبدء التشغيل');
      setStartLoading(false);
      return;
    }

    // Client-side validation: CONTENT_PIPELINE requires type + topic
    if (isContentRun) {
      if (!contentType.trim()) {
        setContentTopicError('يُرجى اختيار نوع المحتوى');
        setStartLoading(false);
        return;
      }
      if (!topic.trim()) {
        setContentTopicError('يُرجى إدخال عنوان الموضوع لبدء التشغيل');
        setStartLoading(false);
        return;
      }
    }

    // Client-side validation: SOCIAL_PIPELINE_UI requires contentPageId
    if (isSocialRun && !contentPageId.trim()) {
      setSocialPageError('يُرجى اختيار صفحة محتوى أولاً');
      setStartLoading(false);
      return;
    }

    // Client-side guard: at least one platform must be selected
    if (isSocialRun && !platformTwitter && !platformTelegram) {
      setSocialPageError('يُرجى اختيار منصة واحدة على الأقل (X/Twitter أو تيليجرام)');
      setStartLoading(false);
      return;
    }

    // Client-side validation: DISCOVERY maxProducts must be numeric; backend clamps to 1-50.
    if (isDiscoveryRun) {
      const parsedMaxProducts = Number(discoveryMaxProducts);
      if (!Number.isFinite(parsedMaxProducts)) {
        setDiscoveryError('يُرجى إدخال رقم صحيح لعدد المنتجات');
        setStartLoading(false);
        return;
      }
    }

    try {
      const typeLabels: Record<string, string> = {
        PRODUCT_PIPELINE: 'ذكاء المنتجات',
        CONTENT_PIPELINE: 'المحتوى',
        SOCIAL_PIPELINE_UI: 'سوشيال ميديا',
        DISCOVERY: 'اكتشاف المنتجات',
        CONTENT_SPRINT: 'سبرنت المحتوى',
      };
      const label = typeLabels[newRunType] ?? newRunType;
      const name = newRunName.trim() || `${label} — ${new Date().toLocaleDateString('ar-SA')}`;

      const body: NewRunForm = { name, type: newRunType };

      if (isProductRun) {
        const inputObj: Record<string, string> = { url: productUrl.trim() };
        if (storeSlug.trim()) inputObj.storeSlug = storeSlug.trim();
        body.input = JSON.stringify(inputObj);
      } else if (isContentRun) {
        const inputObj: Record<string, string | string[]> = {
          type: contentType.trim(),
          topic: topic.trim(),
        };
        if (slug.trim()) inputObj.slug = slug.trim();
        if (productIds.trim()) {
          inputObj.productIds = productIds.split(',').map((s) => s.trim()).filter(Boolean);
        }
        if (categoryId.trim()) inputObj.categoryId = categoryId.trim();
        body.input = JSON.stringify(inputObj);
      } else if (isDiscoveryRun) {
        const parsedMaxProducts = Math.floor(Number(discoveryMaxProducts));
        const maxProducts = Math.min(50, Math.max(1, parsedMaxProducts));
        body.input = {
          source: discoverySource,
          maxProducts,
        };
      } else if (isSocialRun) {
        // Maps to backend: type=MANUAL, input={ action: 'social_pipeline', contentPageId, platforms }
        const platforms: string[] = [];
        if (platformTwitter) platforms.push('twitter');
        if (platformTelegram) platforms.push('telegram');
        const inputObj: Record<string, string | string[]> = {
          action: 'social_pipeline',
          contentPageId: contentPageId.trim(),
        };
        if (platforms.length > 0) inputObj.platforms = platforms;
        body.type = 'MANUAL';
        body.input = JSON.stringify(inputObj);
      }

      const res = await adminFetch(`${API_BASE}/admin/ai-os/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);

      const enqueueRes = await adminFetch(`${API_BASE}/admin/ai-os/runs/${data.id}/enqueue`, {
        method: 'POST',
      });
      const enqueueData = await enqueueRes.json();
      if (!enqueueRes.ok) throw new Error(enqueueData.message || `HTTP ${enqueueRes.status}`);

      setStartSuccess(`تم إنشاء التشغيل وإدخاله للطابور — ${data.id}`);
      setToast({ type: 'success', msg: 'تم إنشاء التشغيل وإدخاله للطابور ✅' });
      setNewRunName('');
      setProductUrl('');
      setStoreSlug('');
      setDiscoverySource('all');
      setDiscoveryMaxProducts('10');
      setTopic('');
      setSlug('');
      setProductIds('');
      setCategoryId('');
      setContentPageId('');
      setPlatformTwitter(true);
      setPlatformTelegram(false);
      void fetchOverview();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ';
      setStartError(msg);
      setToast({ type: 'error', msg });
    } finally {
      setStartLoading(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  /* ── Derived ─────────────────────────────────────────────────────── */

  const isLoading = statsLoading;

  function selectRunType(type: string) {
    setNewRunType(type);
    setUrlError(null);
    setContentTopicError(null);
    setDiscoveryError(null);
    setSocialPageError(null);
    setStartError(null);
    setStartSuccess(null);
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-charcoal">منظومة الذكاء الاصطناعي</h1>
          <span className="text-xs text-stone bg-linen border border-beige rounded-full px-2 py-0.5">AI OS</span>
        </div>
        <button
          onClick={() => { void fetchOverview(); }}
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

        {/* ── Intro banner ── */}
        <div className="bg-white rounded-xl border border-beige px-6 py-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-sage/10 flex items-center justify-center flex-shrink-0">
            <span className="ti ti-brain text-lg text-sage" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-charcoal mb-1">غرفة القيادة — منظومة الذكاء الاصطناعي</h2>
            <p className="text-xs text-stone leading-relaxed">
              هنا تُدير تشغيلات الذكاء الاصطناعي. حالياً: خط ذكاء المنتجات، خط المحتوى، اكتشاف منتجات Amazon/Noon، وخط السوشيال ميديا مُنَفَّذة فعلياً. سبرنت المحتوى ومكتبة الوسائط مراحل مستقبلية.
            </p>
          </div>
        </div>

        {/* ── Stats row ── */}
        {statsError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="ti ti-alert-triangle text-red-500 text-lg" />
            <div>
              <p className="text-sm font-medium text-red-700">تعذّر جلب البيانات</p>
              <p className="text-xs text-red-600">{statsError}</p>
            </div>
            <button
              onClick={() => { void fetchOverview(); }}
              className="mr-auto text-xs text-red-700 underline hover:no-underline"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              icon="ti-brain"
              label="تشغيلات الذكاء"
              value={isLoading ? '—' : stats?.aiOs?.totalRuns ?? 0}
              sub="إجمالي التشغيلات"
              accent="sage"
              href="/admin/ai-os/runs"
            />
            <StatCard
              icon="ti-player-play"
              label="قيد التشغيل"
              value={isLoading ? '—' : stats?.aiOs?.runsRunning ?? 0}
              sub="تشغيلات نشطة"
              accent="lavender"
            />
            <StatCard
              icon="ti-clock"
              label="بانتظار البدء"
              value={isLoading ? '—' : stats?.aiOs?.runsPending ?? 0}
              sub="تشغيلات معلّقة"
              accent="terracotta"
            />
            <StatCard
              icon="ti-x"
              label="فاشلة"
              value={isLoading ? '—' : stats?.aiOs?.runsFailed ?? 0}
              sub="تحتاج مراجعة"
              accent="terracotta"
            />
            <StatCard
              icon="ti-check"
              label="مكتملة"
              value={isLoading ? '—' : stats?.aiOs?.runsCompleted ?? 0}
              sub="نجاح"
              accent="sage"
            />
          </div>
        )}

        {/* ── Queue status ── */}
        {!statsLoading && !statsError && stats?.queue && (
          <div>
            <h3 className="text-xs font-semibold text-stone mb-2 uppercase tracking-wide">حالة الطابور</h3>
            <QueueStatusCard
              implementation={stats.queue.implementation}
              pending={stats.queue.pending}
              active={stats.queue.active}
              failed={stats.queue.failed}
            />
          </div>
        )}

        {/* ── Start New Run ── */}
        <div className="bg-white rounded-xl border border-beige px-6 py-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-sage/10 flex items-center justify-center">
              <span className="ti ti-plus text-sm text-sage" />
            </div>
            <h3 className="text-sm font-semibold text-charcoal">إنشاء سجل تشغيل</h3>
          </div>

          <form onSubmit={handleStartRun} className="space-y-4">
            {/* Workflow cards */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-charcoal">اختر المهمة</legend>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {MAIN_WORKFLOW_CARDS.map((workflow) => {
                  const isSelected = newRunType === workflow.value;

                  return (
                    <button
                      key={workflow.value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectRunType(workflow.value)}
                      className={`group relative rounded-2xl border p-4 text-right transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${
                        isSelected
                          ? 'border-sage bg-sage/10 shadow-sm ring-2 ring-sage/20'
                          : 'border-beige bg-linen hover:border-sage/40 hover:bg-sage/5'
                      }`}
                    >
                      <span
                        className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${
                          isSelected ? 'bg-sage text-cream' : 'bg-white text-sage group-hover:bg-sage/10'
                        }`}
                      >
                        <span className={`ti ${workflow.icon} text-lg`} />
                      </span>
                      <span className="block text-sm font-semibold text-charcoal">{workflow.title}</span>
                      <span className="mt-1 block text-xs font-medium text-sage-deep">{workflow.subtitle}</span>
                      <span className="mt-2 block text-[11px] leading-relaxed text-stone">{workflow.desc}</span>
                      {isSelected && (
                        <span className="absolute left-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-sage text-cream">
                          <span className="ti ti-check text-xs" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-stone leading-relaxed">
                اختر مهمة واحدة، املأ الحقول، ثم أنشئ السجل وأدخله للطابور.
              </p>
            </fieldset>

            {/* Run name */}
            <div>
              <label htmlFor="run-name" className="block text-xs text-stone mb-1.5">اسم التشغيل (اختياري)</label>
              <input
                id="run-name"
                type="text"
                value={newRunName}
                onChange={(e) => setNewRunName(e.target.value)}
                placeholder="مثال: تحليل منتجات الأسبوع"
                className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
              />
            </div>

            {/* PRODUCT_PIPELINE fields — only shown when PRODUCT_PIPELINE is selected */}
            {newRunType === 'PRODUCT_PIPELINE' && (
              <div className="flex flex-col sm:flex-row gap-3 items-start">
                <div className="flex-1">
                  <label htmlFor="product-url" className="block text-xs text-stone mb-1.5">
                    رابط المنتج <span className="text-terracotta">*</span>
                  </label>
                  <input
                    id="product-url"
                    type="url"
                    value={productUrl}
                    onChange={(e) => { setProductUrl(e.target.value); setUrlError(null); }}
                    placeholder="https://www.amazon.sa/dp/..."
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow ${
                      urlError ? 'border-red-400 bg-red-50/40' : 'border-beige bg-linen'
                    }`}
                  />
                  {urlError && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                      <span className="ti ti-alert-triangle" />
                      {urlError}
                    </p>
                  )}
                </div>
                <div className="w-40">
                  <label htmlFor="store-slug" className="block text-xs text-stone mb-1.5">المتجر (اختياري)</label>
                  <input
                    id="store-slug"
                    type="text"
                    value={storeSlug}
                    onChange={(e) => setStoreSlug(e.target.value)}
                    placeholder="amazon, noon, ..."
                    className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                  />
                </div>
              </div>
            )}

            {/* DISCOVERY fields */}
            {newRunType === 'DISCOVERY' && (
              <div className="space-y-3">
                <div className="bg-sage/5 rounded-xl px-4 py-3 flex items-start gap-2 border border-sage/15">
                  <span className="ti ti-clock-hour-3 text-sage text-sm mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-sage-deep leading-relaxed">
                    الاكتشاف المجدول يعمل يومياً بالفعل: Amazon الساعة 3 صباحاً، وNoon الساعة 10 صباحاً. التشغيل اليدوي هنا ينشئ DISCOVERY AiRun ويدخله للطابور فوراً.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="w-full sm:w-48 flex-shrink-0">
                    <label htmlFor="discovery-source" className="block text-xs text-stone mb-1.5">
                      المصدر
                    </label>
                    <select
                      id="discovery-source"
                      value={discoverySource}
                      onChange={(e) => setDiscoverySource(e.target.value as 'amazon' | 'noon' | 'all')}
                      className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                    >
                      <option value="all">Amazon + Noon</option>
                      <option value="amazon">Amazon فقط</option>
                      <option value="noon">Noon فقط</option>
                    </select>
                  </div>
                  <div className="w-full sm:w-44 flex-shrink-0">
                    <label htmlFor="discovery-max-products" className="block text-xs text-stone mb-1.5">
                      عدد المنتجات
                    </label>
                    <input
                      id="discovery-max-products"
                      type="number"
                      min={1}
                      max={50}
                      value={discoveryMaxProducts}
                      onChange={(e) => { setDiscoveryMaxProducts(e.target.value); setDiscoveryError(null); }}
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow ${
                        discoveryError ? 'border-red-400 bg-red-50/40' : 'border-beige bg-linen'
                      }`}
                    />
                    <p className="text-[10px] text-stone mt-1">النطاق الآمن: 1–50، والافتراضي 10.</p>
                  </div>
                </div>
                {discoveryError && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <span className="ti ti-alert-triangle" />
                    {discoveryError}
                  </p>
                )}
              </div>
            )}

            {/* CONTENT_PIPELINE fields */}
            {newRunType === 'CONTENT_PIPELINE' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="w-40 flex-shrink-0">
                    <label htmlFor="content-type" className="block text-xs text-stone mb-1.5">
                      نوع المحتوى <span className="text-terracotta">*</span>
                    </label>
                    <select
                      id="content-type"
                      value={contentType}
                      onChange={(e) => { setContentType(e.target.value); setContentTopicError(null); }}
                      className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                    >
                      <option value="BEST_LIST">أفضل قائمة</option>
                      <option value="PRODUCT_REVIEW">مراجعة منتج</option>
                      <option value="BUYING_GUIDE">دليل شراء</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="topic" className="block text-xs text-stone mb-1.5">
                      الموضوع / العنوان <span className="text-terracotta">*</span>
                    </label>
                    <input
                      id="topic"
                      type="text"
                      value={topic}
                      onChange={(e) => { setTopic(e.target.value); setContentTopicError(null); }}
                      placeholder="مثال: أفضل منتجات الأطفال حديثي الولادة في السعودية"
                      className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                    />
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <div className="flex-1">
                    <label htmlFor="slug" className="block text-xs text-stone mb-1.5">Slug (اختياري)</label>
                    <input
                      id="slug"
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="best-baby-products-2026"
                      dir="ltr"
                      className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                    />
                  </div>
                  <div className="w-40 flex-shrink-0">
                    <label htmlFor="category-id" className="block text-xs text-stone mb-1.5">التصنيف (اختياري)</label>
                    <input
                      id="category-id"
                      type="text"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      placeholder="cat_..."
                      className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="product-ids" className="block text-xs text-stone mb-1.5">معرّفات المنتجات (اختياري)</label>
                  <input
                    id="product-ids"
                    type="text"
                    value={productIds}
                    onChange={(e) => setProductIds(e.target.value)}
                    placeholder="prod_xxx, prod_yyy, prod_zzz"
                    dir="ltr"
                    className="w-full rounded-lg border border-beige bg-linen px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow"
                  />
                  <p className="text-[10px] text-stone mt-1">معرّفات مفصولة بفواصل (comma-separated)</p>
                </div>
                {contentTopicError && (
                  <p className="text-[10px] text-red-500 flex items-center gap-1">
                    <span className="ti ti-alert-triangle" />
                    {contentTopicError}
                  </p>
                )}
              </div>
            )}

            {/* SOCIAL_PIPELINE_UI fields */}
            {newRunType === SOCIAL_PIPELINE_UI && (
              <div className="space-y-3">
                <div className="bg-sage/5 rounded-xl px-4 py-3 flex items-start gap-2">
                  <span className="ti ti-share text-sage text-sm mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-stone leading-relaxed">
                    قبل إنشاء تشغيل السوشيال ميديا، تأكد من إعداد قنوات النشر (X/Twitter وتيليجرام) في صفحة{' '}
                    <Link href="/admin/channels" className="text-sage underline hover:no-underline font-medium">
                      قنوات النشر
                    </Link>
                    .
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs text-stone">
                      صفحة المحتوى <span className="text-terracotta">*</span>
                    </label>
                    {!cpShowManual ? (
                      <button
                        type="button"
                        onClick={() => { setCpShowManual(true); setCpDropdownOpen(false); }}
                        className="flex items-center gap-1 text-[10px] text-sage hover:underline"
                      >
                        <span className="ti ti-edit text-[9px]" />
                        إدخال يدوي
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setCpShowManual(false); setCpSearchQuery(''); setCpSearchResults([]); }}
                        className="flex items-center gap-1 text-[10px] text-sage hover:underline"
                      >
                        <span className="ti ti-search text-[9px]" />
                        بحث
                      </button>
                    )}
                  </div>

                  {!cpShowManual ? (
                    <div className="relative">
                      <input
                        id="cp-search"
                        type="text"
                        value={cpSearchQuery}
                        onChange={(e) => { setCpSearchQuery(e.target.value); setSocialPageError(null); }}
                        onFocus={() => { if (cpSearchQuery.trim().length === 0) void searchContentPages(''); setCpDropdownOpen(true); }}
                        placeholder="ابحث بعنوان أو slug الصفحة..."
                        dir="rtl"
                        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow ${
                          socialPageError ? 'border-red-400 bg-red-50/40' : 'border-beige bg-linen'
                        }`}
                      />
                      {cpSearchLoading && (
                        <span className="ti ti-loader-2 animate-spin absolute left-3 top-1/2 -translate-y-1/2 text-stone text-sm" />
                      )}

                      {/* Dropdown */}
                      {cpDropdownOpen && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-beige rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {cpSearchError ? (
                            <p className="text-[10px] text-red-500 px-3 py-2">{cpSearchError}</p>
                          ) : cpSearchResults.length === 0 ? (
                            <p className="text-[10px] text-stone px-3 py-2">لا توجد نتائج</p>
                          ) : (
                            cpSearchResults.map((page) => (
                              <button
                                key={page.id}
                                type="button"
                                onClick={() => {
                                  setContentPageId(page.id);
                                  setCpDropdownOpen(false);
                                  setCpSearchQuery('');
                                  setSocialPageError(null);
                                }}
                                className="w-full text-right px-3 py-2 hover:bg-sage/5 transition-colors border-b border-beige/50 last:border-0"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-charcoal font-medium truncate">{page.title}</p>
                                    <p className="text-[10px] text-stone truncate dir-ltr text-left">{page.slug}</p>
                                  </div>
                                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sage/15 text-sage-deep">{page.type}</span>
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-stone/10 text-stone">{page.status}</span>
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <input
                      id="content-page-id"
                      type="text"
                      value={contentPageId}
                      onChange={(e) => { setContentPageId(e.target.value); setSocialPageError(null); }}
                      placeholder="page_xxx — انسخ معرّف صفحة المحتوى من قائمة الموافقات"
                      dir="ltr"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/30 transition-shadow ${
                        socialPageError ? 'border-red-400 bg-red-50/40' : 'border-beige bg-linen'
                      }`}
                    />
                  )}
                  {socialPageError && (
                    <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                      <span className="ti ti-alert-triangle" />
                      {socialPageError}
                    </p>
                  )}
                  {!cpShowManual && contentPageId && (
                    <p className="text-[10px] text-sage mt-1 flex items-center gap-1">
                      <span className="ti ti-check" />
                      تم اختيار صفحة: {contentPageId}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-stone mb-2">المنصات</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformTwitter}
                        onChange={(e) => setPlatformTwitter(e.target.checked)}
                        className="w-4 h-4 rounded border-beige text-sage focus:ring-sage/30"
                      />
                      <span className="ti ti-brand-twitter-filled text-[#1DA1F2]" />
                      <span className="text-sm text-charcoal">X / Twitter</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformTelegram}
                        onChange={(e) => setPlatformTelegram(e.target.checked)}
                        className="w-4 h-4 rounded border-beige text-sage focus:ring-sage/30"
                      />
                      <span className="ti ti-brand-telegram text-[#26A5E4]" />
                      <span className="text-sm text-charcoal">تيليجرام</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-stone mt-1.5">
                    X/Twitter: مُعدّ للنشر الفعلي. تيليجرام: مُعدّ للنشر الفعلي عند توفر البوت.
                  </p>
                </div>
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={startLoading}
                className="rounded-lg bg-sage hover:bg-sage-deep text-cream text-sm font-medium py-2.5 px-6 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {startLoading ? (
                  <>
                    <span className="ti ti-loader-2 animate-spin text-sm" />
                    جارٍ الإنشاء والإدخال...
                  </>
                ) : (
                  <>
                    <span className="ti ti-plus text-sm" />
                    إنشاء وإدخال للطابور
                  </>
                )}
              </button>

              {startError && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <span className="ti ti-alert-triangle text-red-500" />
                  {startError}
                </p>
              )}
              {startSuccess && (
                <p className="text-xs text-sage-deep flex items-center gap-1.5">
                  <span className="ti ti-check text-sage" />
                  {startSuccess}
                </p>
              )}
            </div>
          </form>

          <div className="mt-4 pt-4 border-t border-beige">
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/ai-os/runs"
                className="inline-flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors">
                <span className="ti ti-list text-sm" />
                عرض جميع التشغيلات
              </Link>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-beige/60 flex items-start gap-2">
            <span className="ti ti-info-circle text-xs text-stone mt-0.5 flex-shrink-0" />
            {newRunType === 'PRODUCT_PIPELINE' ? (
              <p className="text-[10px] text-sage-deep leading-relaxed">
                تشغيل <strong>ذكاء المنتجات</strong> يُنفِّذ خط المنتجات الحقيقي عند إدخاله في الطابور — جلب بيانات المنتج، تحليل المراجعات، وإصدار Verdict.
              </p>
            ) : newRunType === 'CONTENT_PIPELINE' ? (
              <p className="text-[10px] text-sage-deep leading-relaxed">
                تشغيل <strong>المحتوى</strong> يُنفِّذ خط المحتوى الحقيقي عند إدخاله في الطابور — الخطة SEO، كتابة المحتوى ثنائي اللغة، تدقيق SEO، وضمان الجودة.
              </p>
            ) : newRunType === 'DISCOVERY' ? (
              <p className="text-[10px] text-sage-deep leading-relaxed">
                تشغيل <strong>اكتشاف المنتجات</strong> يستدعي خط الاكتشاف الحقيقي عبر CoordinatorService لمصادر Amazon/Noon. التشغيلات المجدولة تعمل يومياً: Amazon 3 صباحاً، وNoon 10 صباحاً.
              </p>
            ) : newRunType === SOCIAL_PIPELINE_UI ? (
              <p className="text-[10px] text-sage-deep leading-relaxed">
                تشغيل <strong>سوشيال ميديا</strong> يُنشئ منشورات على X/Twitter وتيليجرام. تأكد من ضبط القنوات في{' '}
                <Link href="/admin/channels" className="underline hover:no-underline font-medium">
                  قنوات النشر
                </Link>{' '}
                أولاً.
              </p>
            ) : (
              <p className="text-[10px] text-stone leading-relaxed">
                تشغيلات{' '}
                {PLACEHOLDER_TYPES.map((t) => RUN_TYPE_OPTIONS.find((o) => o.value === t)?.label).join(' و')}
                {' '}لا تنفّذ خطاً إنتاجياً بعد. الخطوط الحقيقية حالياً هي ذكاء المنتجات، المحتوى، اكتشاف المنتجات، والسوشيال ميديا، بينما سبرنت المحتوى ومكتبة الوسائط مراحل مستقبلية.
              </p>
            )}
          </div>
        </div>

        {/* ── Coming Next ── */}
        <div>
          <h3 className="text-xs font-semibold text-stone mb-3 uppercase tracking-wide">القادمة قريباً</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {COMING_NEXT.map((item) => (
              <ComingCard key={item.title} {...item} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
