import { notFound } from 'next/navigation';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { getAlternates } from '@/shared/lib/metadata';
import { StoreCouponsClient } from './store-coupons-client';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';
const API_URL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.babiespicks.com';

const STORE_MAP: Record<string, { id: string; name: string }> = {
  'amazon-sa': { id: 'amazon-sa', name: 'أمازون السعودية' },
  noon: { id: 'noon', name: 'نون' },
  mumzworld: { id: 'mumzworld', name: 'مامز ورلد' },
  jarir: { id: 'jarir', name: 'جرير' },
};

interface Props {
  params: Promise<{ locale: string; storeSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, storeSlug } = await params;
  const store = STORE_MAP[storeSlug];
  if (!store) return {};
  const t = await getTranslations('coupons');
  return {
    alternates: getAlternates(`/coupons/${storeSlug}`, locale),
    title: t('storeMetaTitle', { store: store.name }),
    description: t('storeMetaDesc', { store: store.name }),
  };
}

async function getStoreBySlug(slug: string) {
  try {
    const res = await fetch(`${API_URL}/stores/${slug}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function StoreCouponsPage({ params }: Props) {
  const { locale, storeSlug } = await params;
  const storeData = await getStoreBySlug(storeSlug);
  const store = storeData?.data || STORE_MAP[storeSlug];
  const t = await getTranslations('coupons');

  if (!store && !STORE_MAP[storeSlug]) {
    notFound();
  }

  const storeName = store?.name || STORE_MAP[storeSlug]?.name || storeSlug;
  const storeLogoUrl = store?.logoUrl || null;

  return (
    <main>
      <section
        style={{ background: 'var(--color-hero-start)', borderBottom: '0.5px solid var(--color-cat-hero-border)' }}
        className="px-5 md:px-8 lg:px-12 py-10 md:py-16"
      >
        <div className="max-w-7xl mx-auto">
          <nav aria-label={t('storeBreadcrumbAria')} className="text-[12px] mb-4 flex items-center gap-1" style={{ color: 'var(--color-cat-hero-text)' }}>
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">{t('breadcrumbHome')}</Link></li>
              <li aria-hidden="true" className="opacity-60"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
              <li><Link href="/coupons" className="hover:text-sage-deep">{t('heroTitle')}</Link></li>
              <li aria-hidden="true" className="opacity-60"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
              <li aria-current="page" className="text-sage-deep">{storeName}</li>
            </ol>
          </nav>
          <div className="flex items-center gap-4">
            {storeLogoUrl ? (
              <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden bg-cream">
                  <Image src={storeLogoUrl} alt={storeName} fill sizes="64px" className="object-contain" unoptimized />
                </div>
            ) : (
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-cream grid place-items-center shrink-0">
                <i className="ti ti-store text-sage text-[28px] md:text-[32px]"></i>
              </div>
            )}
            <div>
              <h1 className="text-[28px] md:text-[40px] leading-[1.3] text-sage-deep">
                {storeName}
              </h1>
              <p className="text-[13px] md:text-[14px] mt-2" style={{ color: 'var(--color-cat-hero-text)' }}>
                {t('storeCouponsMeta', { store: storeName })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 md:px-8 lg:px-12 py-10 max-w-7xl mx-auto">
        <StoreCouponsClient storeSlug={storeSlug} locale={locale} />
      </section>
    </main>
  );
}