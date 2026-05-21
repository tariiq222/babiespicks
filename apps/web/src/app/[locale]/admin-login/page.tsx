import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { hasValidAdminSession } from '@/shared/lib/admin-auth';

import { AdminLoginForm } from './admin-login-form';

export default async function AdminLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (await hasValidAdminSession()) {
    redirect(`/${locale}/admin/affiliate-os`);
  }

  const t = await getTranslations('admin');
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <main className="min-h-[70vh] bg-cream px-4 py-12" dir={dir}>
      <div className="mx-auto flex max-w-5xl items-center justify-center">
        <section className="w-full max-w-md rounded-[2rem] border border-beige bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage text-cream shadow-sm">
              <span aria-hidden="true" className="text-lg font-semibold">{t('brandInitial')}</span>
            </div>
            <p className="text-sm font-medium text-terracotta">{t('singleAdminSurface')}</p>
            <h1 className="mt-2 text-2xl font-semibold text-charcoal">{t('loginTitle')}</h1>
            <p className="mt-3 text-sm leading-6 text-stone">{t('loginSubtitle')}</p>
          </div>
          <AdminLoginForm locale={locale} />
        </section>
      </div>
    </main>
  );
}
