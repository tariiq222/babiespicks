import type { Metadata, Viewport } from 'next';
import { getLocale } from 'next-intl/server';
import { IBM_Plex_Sans_Arabic, Inter } from 'next/font/google';
import './globals.css';

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ['400', '500'],
  subsets: ['arabic'],
  variable: '--font-ibm-plex-sans-arabic',
  display: 'swap',
});

const inter = Inter({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    template: '%s | BabiesPicks',
    default: 'BabiesPicks - عروض منتجات الأطفال',
  },
  description: 'عروض منتجات الأطفال وأسعارها والكوبونات المنشورة.',
  metadataBase: new URL('https://babiespicks.com'),
  openGraph: {
    type: 'website',
    siteName: 'BabiesPicks',
    locale: 'ar_SA',
    alternateLocale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
  authors: [{ name: 'BabiesPicks' }],
  creator: 'BabiesPicks',
  publisher: 'BabiesPicks',
  icons: {
    icon: '/babiespicks-logo.png?v=1',
    shortcut: '/babiespicks-logo.png?v=1',
    apple: '/babiespicks-logo.png?v=1',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'BabiesPicks',
  },
};

export const viewport: Viewport = {
  themeColor: '#6B8E7F',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} data-scroll-behavior="smooth">
      <head>
        <meta name="verify-admitad" content="ff8299968f" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css"
        />
      </head>
      <body
        className={`bg-cream text-charcoal leading-[1.7] ${dir === 'rtl' ? 'text-right' : 'text-left'} ${ibmPlexSansArabic.variable} ${inter.variable}`}
        style={{ fontFamily: "var(--font-ibm-plex-sans-arabic), var(--font-inter), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
