'use client';

import { type FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AdminLoginPage() {
  const locale = useLocale();
  const t = useTranslations('admin');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password) {
      setError(t('adminLoginPasswordRequired'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        setError(response.status === 401 ? t('adminLoginInvalid') : t('adminLoginUnavailable'));
        return;
      }

      router.replace(getSafeNextPath(searchParams.get('next'), locale));
    } catch {
      setError(t('adminLoginUnavailable'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream px-6 py-12" dir={dir}>
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <form onSubmit={handleSubmit} className="w-full rounded-3xl border border-beige bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-2">
            <span aria-hidden="true" className="ti ti-lock text-2xl text-sage" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">{t('singleAdminSurface')}</p>
            <h1 className="text-2xl font-semibold text-charcoal">{t('adminLoginTitle')}</h1>
            <p className="text-sm leading-6 text-stone">{t('adminLoginBody')}</p>
          </div>

          <label htmlFor="admin-password" className="mb-2 block text-sm font-medium text-charcoal">
            {t('adminLoginPasswordLabel')}
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-xl border border-beige bg-cream/40 px-4 py-3 text-sm text-charcoal outline-none transition-colors placeholder:text-stone/60 focus:border-sage focus:bg-white"
            placeholder={t('adminLoginPasswordPlaceholder')}
            aria-describedby={error ? 'admin-login-error' : undefined}
          />

          {error && (
            <p id="admin-login-error" role="alert" className="mt-3 text-sm leading-6 text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-sage px-4 py-3 text-sm font-semibold text-cream transition-colors hover:bg-sage-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden="true" className={`ti ${loading ? 'ti-loader-2 animate-spin' : 'ti-login'} text-base`} />
            <span>{loading ? t('adminLoginSubmitting') : t('adminLoginButton')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function getSafeNextPath(next: string | null, locale: string) {
  const fallback = `/${locale}/admin/affiliate-os`;
  if (!next) return fallback;

  try {
    const base = 'https://babiespicks.local';
    const parsed = new URL(next, base);
    const adminRoot = `/${locale}/admin`;
    const isSameOrigin = parsed.origin === base;
    const isSameLocaleAdminPath = parsed.pathname === adminRoot || parsed.pathname.startsWith(`${adminRoot}/`);
    const isLoginPath = parsed.pathname === `${adminRoot}/login`;

    if (!isSameOrigin || !isSameLocaleAdminPath || isLoginPath) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
