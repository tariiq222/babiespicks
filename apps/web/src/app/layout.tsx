import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    template: '%s | BabiesPicks',
    default: 'BabiesPicks - مراجعات منتجات الأمومة والطفل',
  },
  description: 'منصة سعودية ذكية لمراجعة منتجات الأمومة والطفل بالذكاء الاصطناعي',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
