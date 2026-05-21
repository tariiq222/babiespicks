'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

function getSafeNextPath(locale: string) {
  if (typeof window === 'undefined') return `/${locale}/admin/affiliate-os`;

  const next = new URLSearchParams(window.location.search).get('next');
  const fallback = `/${locale}/admin/affiliate-os`;
  if (!next || next.includes('\\') || next.startsWith('//')) return fallback;
  if (!next.startsWith(`/${locale}/admin`)) return fallback;
  if (next.startsWith(`/${locale}/admin/login`)) return fallback;

  return next;
}

export default function AdminLoginPage() {
  const locale = useLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const t = useTranslations('admin');
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('submitting');
    setError(null);

    try {
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'same-origin',
      });

      if (!res.ok) {
        setError(res.status === 503 ? t('loginConfigError') : t('loginInvalid'));
        return;
      }

      router.replace(getSafeNextPath(locale));
    } catch {
      setError(t('loginFailed'));
    } finally {
      setStatus('idle');
    }
  }

  return (
    <div className="min-h-screen bg-cream px-6 py-12" dir={dir}>
      <div className="mx-auto flex max-w-md flex-col gap-6 rounded-3xl border border-beige bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sage">{t('singleOwnerLogin')}</p>
          <h1 className="text-2xl font-semibold text-charcoal">{t('loginTitle')}</h1>
          <p className="text-sm leading-6 text-stone">{t('loginSubtitle')}</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-charcoal">{t('password')}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-beige bg-cream/60 px-4 py-3 text-charcoal outline-none transition focus:border-sage focus:bg-white focus:ring-2 focus:ring-sage/15"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sage px-5 py-3 text-sm font-semibold text-cream transition hover:bg-sage-deep disabled:opacity-60"
          >
            <span aria-hidden="true" className={`ti ${status === 'submitting' ? 'ti-loader-2 animate-spin' : 'ti-lock'}`} />
            {status === 'submitting' ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
