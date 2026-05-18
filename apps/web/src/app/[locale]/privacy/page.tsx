import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';

export async function generateMetadata(): Promise<import('next').Metadata> {
  return {
    alternates: getAlternates('/privacy'),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');

  return (
    <main>
      <article className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 py-12 md:py-20 prose-sm">
        <h1 className="text-[28px] md:text-[36px] text-charcoal leading-[1.3] mb-8">{t('title')}</h1>
        <p className="text-[11px] text-stone mb-8">{t('lastUpdated')}</p>

        <div className="space-y-8 text-[14px] text-stone leading-[1.9]">
          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('introTitle')}</h2>
            <p>{t('introText')}</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('dataTitle')}</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li><strong className="text-charcoal">{t('dataBrowsing')}</strong> {t('dataBrowsingDesc')}</li>
              <li><strong className="text-charcoal">{t('dataCookies')}</strong> {t('dataCookiesDesc')}</li>
              <li><strong className="text-charcoal">{t('dataEmail')}</strong> {t('dataEmailDesc')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('purposeTitle')}</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>{t('purpose1')}</li>
              <li>{t('purpose2')}</li>
              <li>{t('purpose3')}</li>
              <li>{t('purpose4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('sharingTitle')}</h2>
            <p>{t('sharingText')}</p>
            <ul className="list-disc pr-5 space-y-2 mt-2">
              <li>{t('sharingGA')}</li>
              <li>{t('sharingCF')}</li>
              <li>{t('sharingResend')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('rightsTitle')}</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>{t('right1')}</li>
              <li>{t('right2')}</li>
              <li>{t('right3')}</li>
              <li>{t('right4')}</li>
              <li>{t('right5')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('retentionTitle')}</h2>
            <p>{t('retentionText')}</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('contactTitle')}</h2>
            <p>{t('contactText')} <a href="mailto:privacy@babiespicks.com" className="text-sage hover:underline">privacy@babiespicks.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}