import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';

export async function generateMetadata(): Promise<import('next').Metadata> {
  return {
    alternates: getAlternates('/terms'),
  };
}

export default async function TermsPage() {
  const t = await getTranslations('terms');

  return (
    <main>
      <article className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 py-12 md:py-20 prose-sm">
        <h1 className="text-[28px] md:text-[36px] text-charcoal leading-[1.3] mb-8">{t('title')}</h1>
        <p className="text-[11px] text-stone mb-8">{t('lastUpdated')}</p>

        <div className="space-y-8 text-[14px] text-stone leading-[1.9]">
          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('serviceTitle')}</h2>
            <p>{t('serviceText')}</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('contentTitle')}</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>{t('content1')}</li>
              <li>{t('content2')}</li>
              <li>{t('content3')}</li>
              <li>{t('content4')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('affiliateTitle')}</h2>
            <p>{t('affiliateText')}</p>
            <ul className="list-disc pr-5 space-y-2 mt-2">
              <li>{t('affiliate1')}</li>
              <li>{t('affiliate2')}</li>
              <li>{t('affiliate3')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('ipTitle')}</h2>
            <p>{t('ipText')}</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('usageTitle')}</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>{t('usage1')}</li>
              <li>{t('usage2')}</li>
              <li>{t('usage3')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('lawTitle')}</h2>
            <p>{t('lawText')}</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">{t('contactTitle')}</h2>
            <p>{t('contactText')} <a href="mailto:hello@babiespicks.com" className="text-sage hover:underline">hello@babiespicks.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}