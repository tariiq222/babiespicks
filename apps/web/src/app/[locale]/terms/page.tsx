import { getTranslations } from 'next-intl/server';
import { InfoCard, PageHero } from '@/shared/components/page-hero';
import { getAlternates } from '@/shared/lib/metadata';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('terms');
  return {
    title: t('title'),
    description: t('serviceText').slice(0, 160),
    alternates: getAlternates('/terms', locale),
  };
}

export default async function TermsPage() {
  const t = await getTranslations('terms');
  const tcommon = await getTranslations('common');

  return (
    <main id="main">
      <PageHero title={t('title')} subtitle={t('lastUpdated')} icon="ti-file-text" tone="info" crumbsLabel={t('title')} crumbs={[{ label: tcommon('home'), href: '/' }, { label: t('title') }]} />
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-8 md:px-8">
          <InfoCard title={t('serviceTitle')} icon="ti-info-circle" tone="info">
            <p>{t('serviceText')}</p>
          </InfoCard>

          <InfoCard title={t('contentTitle')} icon="ti-file-text" tone="info">
            <ul>
              <li>{t('content1')}</li>
              <li>{t('content2')}</li>
              <li>{t('content3')}</li>
              <li>{t('content4')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('affiliateTitle')} icon="ti-discount" tone="deal">
            <p>{t('affiliateText')}</p>
            <ul className="mt-2">
              <li>{t('affiliate1')}</li>
              <li>{t('affiliate2')}</li>
              <li>{t('affiliate3')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('ipTitle')} icon="ti-copyright" tone="muted">
            <p>{t('ipText')}</p>
          </InfoCard>

          <InfoCard title={t('usageTitle')} icon="ti-list-check" tone="verified">
            <ul>
              <li>{t('usage1')}</li>
              <li>{t('usage2')}</li>
              <li>{t('usage3')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('lawTitle')} icon="ti-scale" tone="muted">
            <p>{t('lawText')}</p>
          </InfoCard>

          <InfoCard title={t('contactTitle')} icon="ti-mail" tone="info">
            <p>{t('contactText')} <a href="mailto:hello@babiespicks.com">hello@babiespicks.com</a></p>
          </InfoCard>
      </div>
    </main>
  );
}