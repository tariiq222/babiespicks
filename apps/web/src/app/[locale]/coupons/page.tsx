import { getTranslations } from 'next-intl/server';
import { PageHero } from '@/shared/components/page-hero';
import type { Metadata } from 'next';
import { getAlternates } from '@/shared/lib/metadata';
import { CouponsClient } from './coupons-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations('coupons');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/coupons', locale),
  };
}

export default async function CouponsPage() {
  const t = await getTranslations('coupons');

  return (
    <main id="main">
      <PageHero title={t('heroTitle')} subtitle={t('heroSubtitle')} icon="ti-discount" tone="deal" crumbsLabel={t('breadcrumbAria')} crumbs={[{ label: t('breadcrumbHome'), href: '/' }, { label: t('heroTitle') }]} />

      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8 lg:px-12">
        <CouponsClient />
      </section>
    </main>
  );
}