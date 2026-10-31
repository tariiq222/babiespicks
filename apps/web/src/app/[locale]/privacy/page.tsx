import { getTranslations } from 'next-intl/server';
import { InfoCard, PageHero } from '@/shared/components/page-hero';
import { getAlternates } from '@/shared/lib/metadata';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('privacy');
  return {
    title: t('title'),
    description: t('introText').slice(0, 160),
    alternates: getAlternates('/privacy', locale),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  const tcommon = await getTranslations('common');

  return (
    <main id="main">
      <PageHero title={t('title')} subtitle={t('lastUpdated')} icon="ti-shield-lock" tone="verified" crumbsLabel={t('title')} crumbs={[{ label: tcommon('home'), href: '/' }, { label: t('title') }]} />
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-8 md:px-8">
          <InfoCard title={t('introTitle')} icon="ti-info-circle" tone="info">
            <p>{t('introText')}</p>
          </InfoCard>

          <InfoCard title={t('dataTitle')} icon="ti-database" tone="info">
            <ul>
              <li><strong>{t('dataBrowsing')}</strong> {t('dataBrowsingDesc')}</li>
              <li><strong>{t('dataCookies')}</strong> {t('dataCookiesDesc')}</li>
              <li><strong>{t('dataEmail')}</strong> {t('dataEmailDesc')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('purposeTitle')} icon="ti-target" tone="verified">
            <ul>
              <li>{t('purpose1')}</li>
              <li>{t('purpose2')}</li>
              <li>{t('purpose3')}</li>
              <li>{t('purpose4')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('sharingTitle')} icon="ti-share" tone="time">
            <p>{t('sharingText')}</p>
            <p className="mt-3">{t('sharingChat')}</p>
            <ul className="mt-2">
              <li>{t('sharingGA')}</li>
              <li>{t('sharingDiagnostics')}</li>
              <li>{t('sharingEmail')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('rightsTitle')} icon="ti-shield-check" tone="verified">
            <ul>
              <li>{t('right1')}</li>
              <li>{t('right2')}</li>
              <li>{t('right3')}</li>
              <li>{t('right4')}</li>
              <li>{t('right5')}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('retentionTitle')} icon="ti-clock" tone="time">
            <p>{t('retentionText')}</p>
          </InfoCard>

          <InfoCard title={t('contactTitle')} icon="ti-mail" tone="info">
            <p>{t('contactText')} <a href="mailto:hello@babiespicks.com">hello@babiespicks.com</a></p>
          </InfoCard>
      </div>
    </main>
  );
}