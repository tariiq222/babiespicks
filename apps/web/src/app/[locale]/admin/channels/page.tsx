'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/shared/lib/admin-fetch';

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

interface ChannelStatus {
  channel: 'twitter' | 'telegram';
  configured: boolean;
  missingEnvVars?: string[];
  identity?: string;
  error?: string;
}

interface TestResult {
  channel: 'twitter' | 'telegram';
  success: boolean;
  message?: string;
  identity?: string;
}

interface StatusResponse {
  channels: ChannelStatus[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                             */
/* ------------------------------------------------------------------ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/* ------------------------------------------------------------------ */
/* Channel Card                                                          */
/* ------------------------------------------------------------------ */

interface ChannelCardProps {
  channel: 'twitter' | 'telegram';
  status: ChannelStatus | undefined;
  onTest: (channel: 'twitter' | 'telegram') => Promise<void>;
  testing: boolean;
}

const CHANNEL_META: Record<
  'twitter' | 'telegram',
  { label: string; icon: string; iconBg: string; envVars: string[]; guidance: string }
> = {
  twitter: {
    label: 'X / Twitter',
    icon: 'ti-brand-twitter-filled',
    iconBg: 'bg-[#1DA1F2]/10 text-[#1DA1F2]',
    envVars: ['TWITTER_BEARER_TOKEN', 'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'],
    guidance:
      'احصل على بيانات اعتماد تطبيق Twitter من developer.twitter.com. يجب أن يكون التطبيق لديه صلاحية "Read and Write" لنشر التغريدات.',
  },
  telegram: {
    label: 'تيليجرام',
    icon: 'ti-brand-telegram',
    iconBg: 'bg-[#26A5E4]/10 text-[#26A5E4]',
    envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID'],
    guidance:
      'أنشئ بوت من @BotFather في تيليجرام واحصل على TOKEN. أضف البوت إلى قناتك وأرسل رسالة على الأقل، ثم استخدم channel ID أو @username للقناة.',
  },
};

function ChannelCard({ channel, status, onTest, testing }: ChannelCardProps) {
  const meta = CHANNEL_META[channel];
  const isConfigured = status?.configured === true;
  const isTesting = testing === true;

  return (
    <div className="bg-white rounded-xl border border-beige overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-beige">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${meta.iconBg}`}>
          <span className={`ti ${meta.icon} text-xl`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-charcoal">{meta.label}</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isConfigured ? 'bg-emerald-400' : 'bg-stone/30'
              }`}
            />
            <span className="text-[11px] text-stone">
              {isConfigured ? 'مُهيأ' : 'غير مُهيأ'}
            </span>
          </div>
        </div>
      </div>

      {/* Status area */}
      <div className="px-5 py-4 space-y-4">
        {/* Identity */}
        {isConfigured && status?.identity && (
          <div className="flex items-center gap-2">
            <span className="ti ti-check-circle text-emerald-500 text-sm" />
            <span className="text-xs text-emerald-700 font-medium">{status.identity}</span>
          </div>
        )}

        {/* Error */}
        {isConfigured && status?.error && (
          <div className="flex items-start gap-2 bg-red-50 rounded-lg px-3 py-2.5">
            <span className="ti ti-alert-circle text-red-400 text-sm mt-0.5 shrink-0" />
            <p className="text-xs text-red-600">{status.error}</p>
          </div>
        )}

        {/* Missing env vars */}
        {!isConfigured && status?.missingEnvVars && status.missingEnvVars.length > 0 && (
          <div className="bg-amber-50 rounded-lg px-3 py-3 space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="ti ti-alert-triangle text-amber-500 text-sm" />
              <p className="text-xs font-medium text-amber-700">متغيرات البيئة المطلوبة</p>
            </div>
            <ul className="space-y-0.5 pr-5">
              {status.missingEnvVars.map((v) => (
                <li key={v} className="text-[11px] text-amber-600 font-mono">
                  • {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Env var reference when configured */}
        {isConfigured && (
          <div className="bg-linen rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-stone mb-1.5">متغيرات البيئة المطلوبة:</p>
            <ul className="space-y-0.5">
              {meta.envVars.map((v) => (
                <li key={v} className="text-[10px] text-stone/70 font-mono">
                  • {v}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Guidance */}
        <div className="bg-sage/5 rounded-lg px-3 py-3">
          <p className="text-[10px] text-stone leading-relaxed">{meta.guidance}</p>
        </div>

        {/* Test button */}
        <button
          type="button"
          onClick={() => onTest(channel)}
          disabled={isTesting}
          className="w-full flex items-center justify-center gap-2 rounded-lg text-sm font-medium py-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed border border-beige hover:border-sage hover:bg-sage/5 text-charcoal"
        >
          {isTesting ? (
            <>
              <span className="ti ti-loader-2 text-sm animate-spin text-stone" />
              <span>جارٍ الاختبار...</span>
            </>
          ) : (
            <>
              <span className="ti ti-player-play text-sm text-sage" />
              <span>اختبار الاتصال</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast                                                                  */
/* ------------------------------------------------------------------ */

interface ToastProps {
  type: 'success' | 'error';
  message: string;
}

function Toast({ type, message }: ToastProps) {
  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
        type === 'success' ? 'bg-sage text-cream' : 'bg-terracotta text-cream'
      }`}
    >
      <span className={`ti ${type === 'success' ? 'ti-check' : 'ti-x'} text-base`} />
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                   */
/* ------------------------------------------------------------------ */

export default function ChannelsPage() {
  const [statuses, setStatuses] = useState<Record<'twitter' | 'telegram', ChannelStatus | undefined>>({
    twitter: undefined,
    telegram: undefined,
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [testing, setTesting] = useState<'twitter' | 'telegram' | null>(null);
  const [toast, setToast] = useState<ToastProps | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/social-channels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StatusResponse = await res.json();

      const map: Record<'twitter' | 'telegram', ChannelStatus | undefined> = {
        twitter: undefined,
        telegram: undefined,
      };
      for (const ch of data.channels) {
        map[ch.channel] = ch;
      }
      setStatuses(map);
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'فشل تحميل الحالة');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchStatus();
      setLoading(false);
    })();
  }, [fetchStatus]);

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleTest(channel: 'twitter' | 'telegram') {
    setTesting(channel);
    try {
      const res = await adminFetch(`${API_BASE}/admin/social-channels/${channel}/test`, {
        method: 'POST',
      });
      const data: TestResult = await res.json();

      if (data.success) {
        showToast('success', `${channel === 'twitter' ? 'X/Twitter' : 'تيليجرام'}: ${data.message}`);
      } else {
        showToast('error', `${channel === 'twitter' ? 'X/Twitter' : 'تيليجرام'}: ${data.message}`);
      }

      // Refresh status after test
      await fetchStatus();
    } catch {
      showToast('error', 'فشل إرسال طلب الاختبار');
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 bg-white border-b border-beige flex items-center justify-between px-6 flex-shrink-0">
        <h1 className="text-sm font-medium text-charcoal">قنوات النشر الاجتماعي</h1>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-stone hover:text-charcoal transition-colors disabled:opacity-50"
        >
          <span className={`ti ti-refresh text-sm ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث</span>
        </button>
      </header>

      {/* Toast */}
      {toast && <Toast type={toast.type} message={toast.message} />}

      <div className="flex-1 px-6 py-6">
        {/* Intro */}
        <div className="bg-sage/5 rounded-xl border border-sage/20 px-5 py-4 mb-6 flex items-start gap-3">
          <span className="ti ti-info-circle text-sage text-lg mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-charcoal mb-0.5">قنوات النشر الاجتماعي</p>
            <p className="text-xs text-stone leading-relaxed">
              راجع حالة إعدادات قنوات X/Twitter وتيليجرام. لا يتم نشر أي محتوى أثناء الاختبار —
              فقط يتم التحقق من صحة بيانات الاعتماد.
            </p>
          </div>
        </div>

        {/* Error state */}
        {fetchError && (
          <div className="bg-red-50 rounded-xl border border-red-200 px-5 py-4 mb-6 flex items-center gap-3">
            <span className="ti ti-alert-circle text-red-400 text-lg" />
            <p className="text-sm text-red-600">{fetchError}</p>
            <button
              onClick={fetchStatus}
              className="mr-auto text-xs text-red-500 hover:text-red-700 underline"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Channel cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          {(['twitter', 'telegram'] as const).map((channel) => (
            <ChannelCard
              key={channel}
              channel={channel}
              status={statuses[channel]}
              onTest={handleTest}
              testing={testing === channel}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
