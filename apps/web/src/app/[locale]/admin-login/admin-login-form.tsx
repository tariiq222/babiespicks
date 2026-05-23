'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function AdminLoginForm({ locale }: { locale: string }) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const response = await fetch('/api/admin-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username: String(formData.get('username') || ''),
          password: String(formData.get('password') || ''),
        }),
      }).catch(() => null);

      if (!response?.ok) {
        setError(t('invalidLogin'));
        return;
      }

      router.replace(`/${locale}/admin/dify-flow`);
      router.refresh();
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label className="mb-2 block text-sm font-medium text-charcoal" htmlFor="admin-username">
          {t('username')}
        </label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className="w-full rounded-xl border border-beige bg-cream/40 px-4 py-3 text-charcoal outline-none transition focus:border-sage focus:bg-white focus:ring-2 focus:ring-sage/15"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-charcoal" htmlFor="admin-password">
          {t('password')}
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-xl border border-beige bg-cream/40 px-4 py-3 text-charcoal outline-none transition focus:border-sage focus:bg-white focus:ring-2 focus:ring-sage/15"
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-sage px-4 py-3 text-sm font-semibold text-cream shadow-sm transition hover:bg-sage-dark disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isPending ? t('loggingIn') : t('submitLogin')}
      </button>
    </form>
  );
}
