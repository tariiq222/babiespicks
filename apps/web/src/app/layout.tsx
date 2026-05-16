import type { Metadata } from 'next';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
