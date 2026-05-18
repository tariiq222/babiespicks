import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | BabiesPicks',
    default: 'BabiesPicks - مراجعات منتجات الأمومة والطفل',
  },
  description: 'منصة سعودية ذكية لمراجعة منتجات الأمومة والطفل بالذكاء الاصطناعي. نراجع كل منتج بخمسة معايير ونعطيكِ رأياً واضحاً.',
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
  themeColor: '#6B8E7F',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
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
      </head>
      <body
        className={`bg-cream text-charcoal leading-[1.7] ${dir === 'rtl' ? 'text-right' : 'text-left'}`}
        style={{ fontFamily: "'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}