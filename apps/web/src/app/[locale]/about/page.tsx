import { getTranslations } from 'next-intl/server';
import { CategoryTag } from '@/shared/components/tags';
import { JsonLd } from '@/shared/components/json-ld';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('about');
  return {
    title: t('tag') + ' | BabiesPicks',
    description: t('description'),
    alternates: getAlternates('/about', locale),
  };
}

export default async function AboutPage() {
  const t = await getTranslations('about');

  const axes = [
    { icon: 'ti-shield-check', title: t('axisSafety'), weight: t('axisSafetyWeight'), desc: t('axisSafetyDesc') },
    { icon: 'ti-award', title: t('axisQuality'), weight: t('axisQualityWeight'), desc: t('axisQualityDesc') },
    { icon: 'ti-star', title: t('axisReviews'), weight: t('axisReviewsWeight'), desc: t('axisReviewsDesc') },
    { icon: 'ti-tag', title: t('axisPrice'), weight: t('axisPriceWeight'), desc: t('axisPriceDesc') },
    { icon: 'ti-infinity', title: t('axisLongTerm'), weight: t('axisLongTermWeight'), desc: t('axisLongTermDesc') },
  ];

  const trustItems = [
    { icon: 'ti-coin-off', title: t('trustNoMoney'), desc: t('trustNoMoneyDesc') },
    { icon: 'ti-eye', title: t('trustTransparent'), desc: t('trustTransparentDesc') },
    { icon: 'ti-robot', title: t('trustAI'), desc: t('trustAIDesc') },
    { icon: 'ti-users', title: t('trustMoms'), desc: t('trustMomsDesc') },
  ];

  return (
    <main>
      <section className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-16">
        <CategoryTag>{t('tag')}</CategoryTag>
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3] mt-4">
          {t('title')}<br />
          <span className="text-sage-deep">{t('titleAccent')}</span>
        </h1>
        <p className="text-[15px] md:text-[16px] text-stone mt-6 leading-[1.9] max-w-2xl">
          {t('description')}
        </p>

        {/* 5 Axes */}
        <div className="mt-12">
          <h2 className="text-[22px] text-charcoal mb-6">{t('fiveAxes')}</h2>
          <div className="grid md:grid-cols-5 gap-4">
            {axes.map((axis, i) => (
              <div key={i} className="bg-linen rounded-xl p-5 text-center">
                <div className="w-12 h-12 rounded-full bg-cream mx-auto grid place-items-center">
                  <i className={`ti ${axis.icon} text-sage text-[24px]`}></i>
                </div>
                <div className="text-[14px] text-charcoal mt-3">{axis.title}</div>
                <div className="text-[20px] text-sage mt-1">{axis.weight}</div>
                <div className="text-[11px] text-stone mt-2">{axis.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 14-day rule */}
        <div className="mt-12 bg-verdict-cond-bg rounded-xl p-6 md:p-8" style={{ borderRight: '4px solid #C8924A' }}>
          <h3 className="text-[18px] text-verdict-cond-text mb-3">{t('fourteenDayRule')}</h3>
          <p className="text-[14px] text-verdict-cond-text/90 leading-[1.8]">
            {t('fourteenDayDesc')}
          </p>
        </div>

        {/* Trust signals */}
        <div className="mt-12">
          <h2 className="text-[22px] text-charcoal mb-6">{t('whyTrust')}</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {trustItems.map((item, i) => (
              <div key={i} className="bg-cream hairline rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <i className={`ti ${item.icon} text-sage text-[22px]`}></i>
                  <h3 className="text-[15px] text-charcoal">{item.title}</h3>
                </div>
                <p className="text-[13px] text-stone leading-[1.8]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Affiliate disclosure */}
        <div className="mt-12 bg-lavender rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <i className="ti ti-info-circle text-lavender-text text-[20px]"></i>
            <h3 className="text-[15px] text-lavender-text">{t('affiliateTitle')}</h3>
          </div>
          <p className="text-[13px] text-lavender-text/90 leading-[1.8]">
            {t('affiliateDesc')}
          </p>
        </div>

        {/* Structured Data */}
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'BabiesPicks',
            url: BASE_URL,
            logo: `${BASE_URL}/logo.png`,
            sameAs: ['https://twitter.com/babiespicks', 'https://t.me/babiespicks'],
          }}
        />
      </section>
    </main>
  );
}