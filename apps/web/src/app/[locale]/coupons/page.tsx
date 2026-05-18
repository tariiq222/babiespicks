import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getAlternates } from '@/shared/lib/metadata';
import { CouponsClient } from './coupons-client';

export async function generateMetadata(): Promise<Metadata> {
  return {
    alternates: getAlternates('/coupons'),
  };
}

export default async function CouponsPage() {
  const t = await getTranslations('coupons');

  return (
    <main>
      <section
        style={{ background: 'var(--color-hero-start)', borderBottom: '0.5px solid var(--color-cat-hero-border)' }}
        className="px-5 md:px-8 lg:px-12 py-10 md:py-16"
      >
        <div className="max-w-7xl mx-auto">
          <nav aria-label="breadcrumb" className="text-[12px] mb-4 flex items-center gap-1" style={{ color: 'var(--color-cat-hero-text)' }}>
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">الرئيسية</Link></li>
              <li aria-hidden="true" className="opacity-60">←</li>
              <li aria-current="page" className="text-sage-deep">الكوبونات</li>
            </ol>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-cream grid place-items-center shrink-0">
              <i className="ti ti-discount-outline text-sage text-[28px] md:text-[32px]"></i>
            </div>
            <div>
              <h1 className="text-[28px] md:text-[40px] leading-[1.3] text-sage-deep">{t('heroTitle')}</h1>
              <p className="text-[13px] md:text-[14px] mt-2" style={{ color: 'var(--color-cat-hero-text)' }}>
                {t('heroSubtitle')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 md:px-8 lg:px-12 py-10 max-w-7xl mx-auto">
        <CouponsClient />
      </section>
    </main>
  );
}