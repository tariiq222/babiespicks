import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { SiteHeader } from '@/shared/components/site-header';
import { SiteFooter } from '@/shared/components/site-footer';
import { LeadMagnetBanner } from '@/shared/components/lead-magnet-banner';
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
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <head>
        <meta name="verify-admitad" content="ff8299968f" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"
        />
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
      </head>
      <body
        className={`bg-cream text-charcoal leading-[1.7] ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
        style={{ fontFamily: "'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif" }}
      >
        <GlitchTipInit />
        <NextIntlClientProvider messages={messages}>
          <SiteHeader />
          {children}
          <LeadMagnetBanner />
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
