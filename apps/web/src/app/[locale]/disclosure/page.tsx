import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';
import { InfoCard, PageHero } from '@/shared/components/page-hero';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('disclosure');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/disclosure', locale),
  };
}

export default async function DisclosurePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations('disclosure');
  const tcommon = await getTranslations('common');

  return (
    <main id="main">
      <PageHero title={t('title')} subtitle={t('description')} icon="ti-discount" tone="deal" crumbsLabel={t('breadcrumbAria')} crumbs={[{ label: tcommon('home'), href: '/' }, { label: t('title') }]} />
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-8 md:px-8">
        <InfoCard title={t('title')} icon="ti-list-check" tone="deal"><ul><li>{t('bullet1')}</li><li>{t('bullet2')}</li><li>{t('bullet3')}</li><li>{t('bullet4')}</li><li>{t('bullet5')}</li></ul></InfoCard>
        <InfoCard title={t('howWeReviewLink')} icon="ti-star" tone="rating"><p>{t('howWeReviewText')}, <Link href="/about">{t('howWeReviewLink')}</Link>.</p></InfoCard>
      </div>
    </main>
  );
}
