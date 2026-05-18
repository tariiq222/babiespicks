import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { PublicShell } from '@/shared/components/public-shell';
import { SiteHeader } from '@/shared/components/site-header';
import { SiteFooter } from '@/shared/components/site-footer';
import { GlitchTipInit } from '@/shared/components/glitchtip-init';
import Script from 'next/script';

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

  return (
    <>
      <GlitchTipInit />
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-89JKJ8W16L"
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-89JKJ8W16L');
        `}
      </Script>
      <NextIntlClientProvider messages={messages}>
        <PublicShell
          header={<SiteHeader />}
          footer={<SiteFooter />}
        >
          {children}
        </PublicShell>
      </NextIntlClientProvider>
    </>
  );
}