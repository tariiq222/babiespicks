import { getStoreBySlug } from '@/server/queries';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { PageHero } from '@/shared/components/page-hero';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { getAlternates } from '@/shared/lib/metadata';
import { CouponsClient } from '../coupons-client';

interface Props {
  params: Promise<{ locale: string; storeSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, storeSlug } = await params;
  const store = await getStoreBySlug(storeSlug);
  if (!store) return {};
  const t = await getTranslations('coupons');
  return {
    alternates: getAlternates(`/coupons/${storeSlug}`, locale),
    title: t('storeMetaTitle', { store: store.name }),
    description: t('storeMetaDesc', { store: store.name }),
  };
}

export default async function StoreCouponsPage({ params }: Props) {
  const { locale, storeSlug } = await params;
  const storeData = await getStoreBySlug(storeSlug);
  const store = storeData;
  const t = await getTranslations('coupons');

  if (!store) {
    notFound();
  }

  const storeName = store.name;
  const storeLogoUrl = storeData?.logoUrl || null;

  return (
    <main id="main">
      <PageHero title={storeName} subtitle={t('storeCouponsMeta', { store: storeName })} icon="ti-building-store" tone="deal" crumbsLabel={t('storeBreadcrumbAria')} crumbs={[{ label: t('breadcrumbHome'), href: '/' }, { label: t('heroTitle'), href: '/coupons' }, { label: storeName }]} media={storeLogoUrl ? <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-white"><Image src={storeLogoUrl} alt={storeName} fill sizes="56px" className="object-contain" unoptimized /></span> : undefined} />

      <section className="px-5 md:px-8 lg:px-12 py-10 max-w-7xl mx-auto">
        <CouponsClient storeSlug={storeSlug} />
      </section>
    </main>
  );
}