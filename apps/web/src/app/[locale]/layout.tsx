export const dynamic = 'force-dynamic';

import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { PublicShell } from '@/shared/components/public-shell';
import { SiteHeader } from '@/shared/components/site-header';
import { SiteFooter } from '@/shared/components/site-footer';
import { ChatWidget } from '@/shared/components/chat-widget';
import { GlitchTipInit } from '@/shared/components/glitchtip-init';
import { AnalyticsScripts } from '@/shared/components/analytics-scripts';
import {ShoppingContextProvider} from '@/shared/components/shopping-context-provider';
import {getSavedShoppingPreferences} from '@/server/shopping-preferences';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const saved = await getSavedShoppingPreferences();

  return (
    <>
      <GlitchTipInit />
      <AnalyticsScripts measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      <NextIntlClientProvider messages={messages}>
        <ShoppingContextProvider saved={saved}>
        <PublicShell
          header={<SiteHeader />}
          footer={<SiteFooter />}
        >
          {children}
        </PublicShell>
        {process.env.DEPLOY_API_KEY && <ChatWidget />}
        </ShoppingContextProvider>
      </NextIntlClientProvider>
    </>
  );
}
