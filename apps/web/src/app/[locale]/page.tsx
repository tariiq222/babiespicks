import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { PrimaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { NewsletterSection } from '@/shared/components/newsletter-section';
import { JsonLd } from '@/shared/components/json-ld';
import { getProducts, getVerdictVariant, getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<import('next').Metadata> {
  const { locale } = await params;
  return {
    alternates: getAlternates('', locale),
  };
}

const CATEGORIES = [
  { key: 'formula', icon: 'ti-bottle', count: 42, tint: '#E8EFE9' },
  { key: 'diapers', icon: 'ti-droplet', count: 31, tint: '#EAF0EE' },
  { key: 'carseats', icon: 'ti-car', count: 18, tint: '#E5EBE7' },
  { key: 'bottles', icon: 'ti-baby-bottle', count: 24, tint: '#ECF2EE' },
  { key: 'toys', icon: 'ti-puzzle', count: 36, tint: '#EBEFE6' },
  { key: 'care', icon: 'ti-mug', count: 29, tint: '#E8EEEA' },
];

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const tcat = await getTranslations('categories');
  const { data: products } = await getProducts(locale, 8);
  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #E8EFE9 0%, #FAF8F5 100%)' }}>
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-12 md:pb-16">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-2 bg-lavender text-lavender-text rounded-full px-4 py-[6px] text-[12px]">
              <span className="w-1.5 h-1.5 rounded-full bg-lavender-border"></span>
              <span>{t('badge')}</span>
            </span>

            <h1 className="text-[40px] md:text-[60px] lg:text-[68px] leading-[1.15] text-charcoal mt-6 tracking-[-0.015em]">
              {t('heroTitle')}<br />
              <span className="text-sage-deep">{t('heroTitleAccent')}</span>
            </h1>

            <p className="text-[14px] md:text-[16px] text-stone mt-5 leading-[1.95]">
              {t('heroSubtitle')}
            </p>

            {/* Search */}
            <div className="mt-8 bg-cream hairline rounded-full flex items-center gap-3 px-5 py-3 md:py-[14px]">
              <i className="ti ti-search text-stone text-[18px]"></i>
              <input
                className="bg-transparent flex-1 text-[14px] outline-none text-right placeholder:text-stone/70"
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAriaLabel')}
              />
              <button className="bg-sage text-cream rounded-full px-5 py-[7px] text-[12px]">{t('searchButton')}</button>
            </div>
          </div>

          {/* Sample verdict cards */}
          <div className="mt-10 grid sm:grid-cols-2 gap-4 text-right">
            <Link href="/products/aptamil-stage-1" className="bg-cream/80 backdrop-blur hairline rounded-2xl p-5 hover:bg-cream transition-colors">
              <div className="flex items-start gap-4">
                <ProductImage width={80} height={80} radius={12} />
                <div className="flex-1 min-w-0">
                  <span className="inline-block bg-lavender text-lavender-text text-[11px] px-2 py-[2px] rounded-full">{t('productOfWeek')}</span>
                  <div className="text-[15px] text-charcoal mt-1 leading-tight">{t('sampleProduct1Name')}</div>
                  <div className="text-[12px] text-stone mt-1">{t('sampleProduct1Desc')}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <VerdictPill variant="good" score={87} label={t('worthIt')} />
                    <SarPrice amount={89} className="text-[13px] text-charcoal" />
                  </div>
                </div>
              </div>
            </Link>
            <Link href="/products/chicco-nextfit" className="bg-cream/80 backdrop-blur hairline rounded-2xl p-5 hover:bg-cream transition-colors">
              <div className="flex items-start gap-4">
                <ProductImage width={80} height={80} radius={12} />
                <div className="flex-1 min-w-0">
                  <span className="inline-block bg-verdict-cond-bg text-verdict-cond-text text-[11px] px-2 py-[2px] rounded-full">{t('newVerdict')}</span>
                  <div className="text-[15px] text-charcoal mt-1 leading-tight">{t('sampleProduct2Name')}</div>
                  <div className="text-[12px] text-stone mt-1">{t('sampleProduct2Desc')}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <VerdictPill variant="cond" score={72} label={tc('worthItWith')} />
                    <SarPrice amount={450} className="text-[13px] text-charcoal" />
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Telegram CTA */}
          <div className="mt-4 bg-linen rounded-2xl px-5 py-4 flex items-center gap-4 text-right">
            <div className="w-10 h-10 rounded-full bg-cream hairline grid place-items-center shrink-0">
              <i className="ti ti-brand-telegram text-sage text-[20px]"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-charcoal leading-tight">{t('telegramTitle')}</div>
              <div className="text-[12px] text-stone mt-[2px]">{t('telegramSubtitle')}</div>
            </div>
            <button className="border border-sage text-sage rounded-lg px-4 py-2 text-[12px] hover:bg-sage-hover-bg flex items-center gap-1 shrink-0">
              <span>{t('telegramButton')}</span>
              <i className="ti ti-arrow-left text-[14px]"></i>
            </button>
          </div>

          {/* Trust strip */}
          <div className="mt-10 pt-7 hairline-t flex flex-wrap justify-center gap-x-8 gap-y-3 text-[12px] text-stone">
            <span className="flex items-center gap-2"><i className="ti ti-shield-check text-sage text-[16px]"></i> {t('trustIndependent')}</span>
            <span className="flex items-center gap-2"><i className="ti ti-users text-sage text-[16px]"></i> {t('trustMoms')}</span>
            <span className="flex items-center gap-2"><i className="ti ti-sparkles text-sage text-[16px]"></i> {t('trustAI')}</span>
            <span className="flex items-center gap-2"><i className="ti ti-flag text-sage text-[16px]"></i> {t('trustLocal')}</span>
          </div>
        </div>
      </section>

{/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6 md:mt-10">
        <SectionHead action={t('viewAllCategories')} actionHref="/categories">{t('browseByCategory')}</SectionHead>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={`/categories/${c.key}`}
              className="group bg-linen rounded-2xl py-6 md:py-8 px-3 text-center hover:bg-linen-hover transition-colors"
            >
              <div
                className="w-12 h-12 md:w-14 md:h-14 rounded-full mx-auto grid place-items-center transition-transform group-hover:scale-105"
                style={{ background: c.tint }}
              >
                <i className={`ti ${c.icon} text-sage text-[22px] md:text-[26px]`}></i>
              </div>
              <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight">{tcat(c.key)}</div>
              <div className="text-[11px] md:text-[11px] text-stone mt-1">{t('productCount', { count: c.count })}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* TODAY'S PICK */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <SectionHead action={t('archive')} actionHref="/best">{t('todaysPick')}</SectionHead>
        <Link
          href="/products/aptamil-stage-1"
          className="block w-full text-right bg-linen rounded-2xl p-5 md:p-8 grid md:grid-cols-[260px_1fr] lg:grid-cols-[320px_1fr] gap-6 md:gap-8 hover:bg-linen-hover transition-colors"
        >
          <div className="bg-cream rounded-xl p-6 md:p-8 grid place-items-center">
            <ProductImage width={200} height={250} alt={t('todaysPick')} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <CategoryTag>{t('categoryTagFormula')}</CategoryTag>
              <span className="text-[11px] text-stone">{t('updatedAgo')}</span>
            </div>
            <h3 className="text-[20px] md:text-[24px] lg:text-[28px] text-charcoal mt-3 leading-[1.4]">
              {t('sampleProduct1Name')}
            </h3>
            <p className="text-[13px] md:text-[14px] text-stone mt-3 leading-[1.8] max-w-xl">
              {t('sampleProduct1Desc')}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-5">
              <VerdictPill variant="good" score={87} label={t('worthIt')} />
              <span className="text-[13px] text-stone line-through"><SarPrice amount={125} /></span>
              <span className="text-[20px] text-charcoal"><SarPrice amount={89} /></span>
              <DiscountTag>{t('save', { percent: 29 })}</DiscountTag>
            </div>
            <div className="mt-auto pt-6 flex items-center gap-3">
              <PrimaryButton icon="ti-arrow-left">{t('viewFullReview')}</PrimaryButton>
              <span className="text-[12px] text-stone">{t('productScore', { score: 87 })}</span>
            </div>
          </div>
        </Link>
      </section>

      {/* RECENT VERDICTS - from API */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <SectionHead action={t('all')} actionHref="/best">{t('recentVerdicts')}</SectionHead>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="bg-cream hairline rounded-xl p-3 md:p-4 text-right hover:bg-cream-hover transition-colors"
            >
              <ProductImage width={999} height={120} alt={getLocalizedName(p, locale)} radius={8} />
              <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px]">
                {getLocalizedName(p, locale)}
              </div>
              <div className="flex items-center justify-between mt-3">
                <VerdictPill
                  variant={getVerdictVariant(p.verdict?.type)}
                  score={p.verdict?.overallScore}
                  label={p.verdict?.type ? tc(`verdict.${p.verdict.type}`) : undefined}
                />
                {p.prices[0] && <SarPrice amount={Number(p.prices[0].price)} className="text-[12px] text-charcoal" />}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* HOW WE REVIEW */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <div className="bg-linen rounded-2xl p-6 md:p-10 grid md:grid-cols-[1fr_2fr] gap-8">
          <div>
            <CategoryTag>{t('methodology')}</CategoryTag>
            <h2 className="text-[22px] md:text-[28px] text-charcoal mt-3 leading-[1.4]">{t('howWeVerdict')}</h2>
            <p className="text-[13px] text-stone mt-3 leading-[1.8]">
              {t('howWeVerdictDesc')}
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { icon: 'ti-shield-check', t: t('axisSafety'), d: t('axisSafetyDesc') },
              { icon: 'ti-award', t: t('axisQuality'), d: t('axisQualityDesc') },
              { icon: 'ti-star', t: t('axisReviews'), d: t('axisReviewsDesc') },
              { icon: 'ti-tag', t: t('axisPrice'), d: t('axisPriceDesc') },
              { icon: 'ti-infinity', t: t('axisLongTerm'), d: t('axisLongTermDesc') },
            ].map((m, i) => (
              <div key={i} className="bg-cream hairline rounded-xl p-4">
                <i className={`ti ${m.icon} text-sage text-[22px]`}></i>
                <div className="text-[13px] text-charcoal mt-2">{m.t}</div>
                <div className="text-[11px] text-stone mt-1">{m.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FROM MOM TO MOM */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <div className="bg-lavender rounded-2xl p-8 md:p-12 text-center">
          <div className="text-[28px] mb-3" aria-hidden="true">💜</div>
          <h2 className="text-[18px] md:text-[22px] text-lavender-text mb-3">{t('momToMom')}</h2>
          <p className="text-[13px] md:text-[14px] text-lavender-text/90 leading-[1.9] max-w-xl mx-auto">
            {t('momToMomDesc')}
          </p>
        </div>
      </section>

      {/* NEWSLETTER */}
      <NewsletterSection />

      {/* Structured Data */}
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'BabiesPicks',
            url: BASE_URL,
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${BASE_URL}/${locale}/search?q={search_term_string}`,
              },
              'query-input': 'required name=search_term_string',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'BabiesPicks',
            url: BASE_URL,
            logo: `${BASE_URL}/logo.png`,
            sameAs: ['https://twitter.com/babiespicks', 'https://t.me/babiespicks'],
          },
        ]}
      />
    </main>
  );
}
