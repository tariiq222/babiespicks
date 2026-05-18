import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { PrimaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { NewsletterSection } from '@/shared/components/newsletter-section';
import { JsonLd } from '@/shared/components/json-ld';
import { getProducts, getVerdictVariant, getLocalizedName, Product } from '@/shared/lib/api';
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

// Pick 2 featured products from the API results for the featured section
function getFeaturedProducts(prods: Product[]) {
  return prods.slice(0, 2);
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tc = await getTranslations('common');
  const tcat = await getTranslations('categories');
  const { data: products } = await getProducts(locale, 8);
  const featured = getFeaturedProducts(products ?? []);
  const todaysPick = products[2] ?? null;
  const topProductsByCategory = CATEGORIES.map((cat) => {
    const found = (products ?? []).find((p: Product) =>
      p.category?.slug === cat.key
    );
    return { ...cat, product: found };
  });

  return (
    <main>
      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #E8EFE9 0%, #F0EDE6 40%, #FAF8F5 100%)' }}>
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-10 md:pb-14">
          <div className="grid lg:grid-cols-[1fr_auto] gap-10 items-start">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 bg-lavender text-lavender-text rounded-full px-4 py-[6px] text-[12px]">
                <span className="w-1.5 h-1.5 rounded-full bg-lavender-border"></span>
                <span>{t('badge')}</span>
              </span>

              <h1 className="text-[36px] md:text-[52px] lg:text-[64px] leading-[1.08] text-charcoal mt-6 tracking-[-0.025em] font-medium">
                {t('heroTitle')}<br />
                <span className="text-sage-deep font-semibold">{t('heroTitleAccent')}</span>
              </h1>

              <p className="text-[14px] md:text-[16px] text-stone mt-5 leading-[1.85] max-w-xl">
                {t('heroSubtitle')}
              </p>

              {/* Five criteria strip */}
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { icon: 'ti-shield-check', label: t('axisSafety') },
                  { icon: 'ti-award', label: t('axisQuality') },
                  { icon: 'ti-star', label: t('axisReviews') },
                  { icon: 'ti-tag', label: t('axisPrice') },
                  { icon: 'ti-infinity', label: t('axisLongTerm') },
                ].map((c) => (
                  <span key={c.label} className="inline-flex items-center gap-1.5 bg-cream hairline rounded-full px-3 py-1.5 text-[11px] text-stone">
                    <i className={`ti ${c.icon} text-sage text-[13px]`} aria-hidden="true"></i>
                    {c.label}
                  </span>
                ))}
              </div>

              {/* Search */}
              <form action={`/${locale}/search`} method="get" className="mt-7 bg-cream hairline rounded-full flex items-center gap-3 px-5 py-3 md:py-[14px] shadow-sm">
                <i className="ti ti-search text-stone text-[18px]" aria-hidden="true"></i>
                <input
                  type="search"
                  name="q"
                  className="bg-transparent flex-1 text-[14px] outline-none text-start placeholder:text-stone/70"
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchAriaLabel')}
                />
                <button type="submit" className="bg-sage text-cream rounded-full px-6 py-[7px] text-[12px] font-medium hover:bg-sage-hover transition-colors">{t('searchButton')}</button>
              </form>

              {/* Trust strip */}
              <div className="mt-8 flex flex-wrap justify-start gap-x-6 gap-y-2 text-[12px] md:text-[13px] text-stone">
                <span className="flex items-center gap-1.5"><i className="ti ti-shield-check text-sage text-[15px]" aria-hidden="true"></i> {t('trustIndependent')}</span>
                <span className="flex items-center gap-1.5"><i className="ti ti-users text-sage text-[15px]" aria-hidden="true"></i> {t('trustMoms')}</span>
                <span className="flex items-center gap-1.5"><i className="ti ti-sparkles text-sage text-[15px]" aria-hidden="true"></i> {t('trustAI')}</span>
                <span className="flex items-center gap-1.5"><i className="ti ti-flag text-sage text-[15px]" aria-hidden="true"></i> {t('trustLocal')}</span>
              </div>
            </div>

            {/* Editorial verdict callouts — right side on large screens */}
            <div className="hidden lg:flex flex-col gap-3 w-56 pt-16">
              {products[3] && (
                <div className="bg-cream hairline rounded-2xl p-5 text-center">
                  <div className="text-[11px] text-stone mb-2">{t('verdictCalloutLabel')}</div>
                  <VerdictPill
                    variant={getVerdictVariant(products[3].verdict?.type)}
                    score={products[3].verdict?.overallScore}
                    label={products[3].verdict?.type ? tc(`verdict.${products[3].verdict.type}`) : undefined}
                  />
                  <div className="text-[12px] text-charcoal mt-3 leading-snug">
                    <Link href={`/products/${products[3].slug}`} className="hover:text-sage transition-colors">
                      {getLocalizedName(products[3], locale)}
                    </Link>
                  </div>
                </div>
              )}
              {products[4] && (
                <div className="bg-cream hairline rounded-2xl p-5 text-center">
                  <div className="text-[11px] text-stone mb-2">{t('verdictCalloutLabel')}</div>
                  <VerdictPill
                    variant={getVerdictVariant(products[4].verdict?.type)}
                    score={products[4].verdict?.overallScore}
                    label={products[4].verdict?.type ? tc(`verdict.${products[4].verdict.type}`) : undefined}
                  />
                  <div className="text-[12px] text-charcoal mt-3 leading-snug">
                    <Link href={`/products/${products[4].slug}`} className="hover:text-sage transition-colors">
                      {getLocalizedName(products[4], locale)}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCTS — bold editorial treatment */}
      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 -mt-2 md:-mt-4">
          <div className="grid sm:grid-cols-2 gap-4 text-start">
            {featured.map((p, i) => (
              <Link
                key={p.id}
                href={`/products/${p.slug}`}
                className={`relative bg-cream/80 backdrop-blur hairline rounded-2xl p-5 hover:bg-cream transition-all active:scale-[0.99] group ${
                  i === 0 ? 'ring-1 ring-sage/20' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <ProductImage src={p.imageUrl || undefined} width={80} height={80} radius={12} />
                    {/* Score overlay badge */}
                    {p.verdict?.overallScore && (
                      <div className={`absolute -bottom-2 -right-2 w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold ${
                        p.verdict.overallScore >= 75
                          ? 'bg-verdict-good-bg text-verdict-good-text'
                          : p.verdict.overallScore >= 60
                          ? 'bg-verdict-cond-bg text-verdict-cond-text'
                          : 'bg-verdict-wait-bg text-verdict-wait-text'
                      }`}>
                        {p.verdict.overallScore}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block text-[11px] px-2 py-[2px] rounded-full ${i === 0 ? 'bg-lavender text-lavender-text' : 'bg-verdict-cond-bg text-verdict-cond-text'}`}>
                      {i === 0 ? t('productOfWeek') : t('newVerdict')}
                    </span>
                    <div className="text-[15px] text-charcoal mt-1 leading-tight font-medium">{getLocalizedName(p, locale)}</div>
                    <div className="text-[12px] text-stone mt-1 line-clamp-1">{p.translations[0]?.description?.slice(0, 60) ?? ''}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <VerdictPill
                        variant={getVerdictVariant(p.verdict?.type)}
                        score={p.verdict?.overallScore}
                        label={p.verdict?.type ? tc(`verdict.${p.verdict.type}`) : undefined}
                      />
                      {p.prices[0] && <SarPrice amount={Number(p.prices[0].price)} className="text-[13px] text-charcoal" />}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Telegram CTA — bold treatment with terracotta accent */}
          <a
            href="https://t.me/babiespicks"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 bg-linen rounded-2xl px-5 py-4 flex items-center gap-4 text-start hover:bg-linen-hover active:scale-[0.99] transition-all group"
          >
            <div className="w-11 h-11 rounded-full bg-sage/10 border border-sage/20 grid place-items-center shrink-0 group-hover:bg-sage/20 transition-colors">
              <i className="ti ti-brand-telegram text-sage text-[22px]"></i>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-charcoal leading-tight font-medium">{t('telegramTitle')}</div>
              <div className="text-[12px] text-stone mt-[2px]">{t('telegramSubtitle')}</div>
            </div>
            <span className="bg-sage text-cream rounded-lg px-4 py-2 text-[12px] flex items-center gap-1 shrink-0 group-hover:bg-sage-deep transition-colors">
              <span>{t('telegramButton')}</span>
              <i className="ti ti-arrow-left text-[14px]"></i>
            </span>
          </a>
        </section>
      )}

      {/* CATEGORIES — Bold grid with product thumbnails */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6 md:mt-10">
        <SectionHead action={t('viewAllCategories')} actionHref="/categories">{t('browseByCategory')}</SectionHead>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {topProductsByCategory.map((cat) => (
            <Link
              key={cat.key}
              href={`/categories/${cat.key}`}
              className="group bg-linen rounded-2xl overflow-hidden hover:bg-linen-hover active:scale-[0.98] transition-all relative"
            >
              {/* Product image area */}
              <div className="relative aspect-square bg-cream/60 grid place-items-center p-3">
                <ProductImage src={cat.product?.imageUrl || undefined} fill className="object-contain" />
                {cat.product && (
                  <div className="absolute top-2 right-2">
                    <VerdictPill
                      variant={getVerdictVariant(cat.product.verdict?.type)}
                      score={cat.product.verdict?.overallScore}
                    />
                  </div>
                )}
                {/* Category icon overlay */}
                <div
                  className="absolute bottom-2 left-2 w-8 h-8 rounded-full grid place-items-center shadow-sm"
                  style={{ background: cat.tint }}
                >
                  <i className={`ti ${cat.icon} text-sage text-[16px]`}></i>
                </div>
              </div>
              <div className="p-3 text-center">
                <div className="text-[12px] md:text-[13px] text-charcoal font-semibold leading-tight">{tcat(cat.key)}</div>
                <div className="text-[11px] text-stone mt-1">{t('productCount', { count: cat.count })}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* TODAY'S PICK — Full-width editorial with bold pricing */}
      {todaysPick && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
          <SectionHead action={t('archive')} actionHref="/best">{t('todaysPick')}</SectionHead>
          <Link
            href={`/products/${todaysPick.slug}`}
            className="block w-full text-start bg-linen rounded-2xl p-5 md:p-8 grid md:grid-cols-[280px_1fr] lg:grid-cols-[360px_1fr] gap-6 md:gap-10 hover:bg-linen-hover transition-all group"
          >
            <div className="bg-cream rounded-xl p-6 md:p-8 grid place-items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-sage/5 to-transparent" aria-hidden="true"/>
              <ProductImage src={todaysPick.imageUrl || undefined} width={200} height={250} alt={getLocalizedName(todaysPick, locale)} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <CategoryTag>{todaysPick.category?.translations[0]?.name ?? t('categoryTagFormula')}</CategoryTag>
                <span className="text-[11px] text-stone">{t('updatedAgo')}</span>
              </div>
              <h3 className="text-[22px] md:text-[28px] lg:text-[32px] text-charcoal mt-3 leading-[1.35] font-medium tracking-tight">
                {getLocalizedName(todaysPick, locale)}
              </h3>
              <p className="text-[13px] md:text-[14px] text-stone mt-3 leading-[1.85] max-w-xl">
                {todaysPick.translations[0]?.description?.slice(0, 120) ?? ''}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-5">
                <VerdictPill
                  variant={getVerdictVariant(todaysPick.verdict?.type)}
                  score={todaysPick.verdict?.overallScore}
                  label={todaysPick.verdict?.type ? tc(`verdict.${todaysPick.verdict.type}`) : undefined}
                />
              </div>
              {todaysPick.prices[0] && (
                <div className="mt-4 flex items-baseline gap-3 flex-wrap">
                  <span className="text-[32px] md:text-[38px] text-charcoal font-semibold leading-none">
                    <SarPrice amount={Number(todaysPick.prices[0].price)} />
                  </span>
                  {todaysPick.prices[0].originalPrice && Number(todaysPick.prices[0].originalPrice) > Number(todaysPick.prices[0].price) && (
                    <>
                      <span className="text-[16px] text-stone line-through">
                        <SarPrice amount={Number(todaysPick.prices[0].originalPrice)} />
                      </span>
                      <DiscountTag>{t('save', { percent: Math.round((1 - Number(todaysPick.prices[0].price) / Number(todaysPick.prices[0].originalPrice)) * 100) })}</DiscountTag>
                    </>
                  )}
                </div>
              )}
              <div className="mt-auto pt-6 flex items-center gap-3">
                <PrimaryButton icon="ti-arrow-left">{t('viewFullReview')}</PrimaryButton>
                {todaysPick.verdict?.overallScore && (
                  <span className="text-[12px] text-stone flex items-center gap-1">
                    <i className="ti ti-star text-amber-500 text-[14px]"></i>
                    {t('productScore', { score: todaysPick.verdict.overallScore })}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* RECENT VERDICTS — from API with score stars */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <SectionHead action={t('all')} actionHref="/best">{t('recentVerdicts')}</SectionHead>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className="group bg-cream hairline rounded-xl p-3 md:p-4 text-start hover:bg-cream-hover hover:shadow-md transition-all active:scale-[0.98]"
            >
              <div className="relative overflow-hidden rounded-lg bg-linen">
                <ProductImage src={p.imageUrl || undefined} width={999} height={120} alt={getLocalizedName(p, locale)} radius={8} />
                {/* Score badge */}
                {p.verdict?.overallScore && (
                  <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    p.verdict.overallScore >= 75
                      ? 'bg-verdict-good-bg text-verdict-good-text'
                      : p.verdict.overallScore >= 60
                      ? 'bg-verdict-cond-bg text-verdict-cond-text'
                      : 'bg-verdict-wait-bg text-verdict-wait-text'
                  }`}>
                    <span className="flex items-center gap-0.5">
                      <i className="ti ti-star text-[10px]"></i>
                      {p.verdict.overallScore}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px] font-medium">
                {getLocalizedName(p, locale)}
              </div>
              <div className="flex items-center justify-between mt-3">
                <VerdictPill
                  variant={getVerdictVariant(p.verdict?.type)}
                  score={p.verdict?.overallScore}
                  label={p.verdict?.type ? tc(`verdict.${p.verdict.type}`) : undefined}
                />
                {p.prices[0] && (
                  <span className="text-[12px] text-charcoal font-medium">
                    <SarPrice amount={Number(p.prices[0].price)} />
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* HOW WE REVIEW — 3-column stacked grid with bold icons */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <div className="bg-linen rounded-2xl p-6 md:p-10 grid md:grid-cols-[1fr_1.8fr] gap-8">
          <div>
            <CategoryTag>{t('methodology')}</CategoryTag>
            <h2 className="text-[22px] md:text-[28px] text-charcoal mt-3 leading-[1.4] font-medium">{t('howWeVerdict')}</h2>
            <p className="text-[13px] text-stone mt-3 leading-[1.8]">
              {t('howWeVerdictDesc')}
            </p>
          </div>
          {/* 3-column stacked: icon above, text below */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: 'ti-shield-check', t: t('axisSafety'), d: t('axisSafetyDesc') },
              { icon: 'ti-award', t: t('axisQuality'), d: t('axisQualityDesc') },
              { icon: 'ti-star', t: t('axisReviews'), d: t('axisReviewsDesc') },
              { icon: 'ti-tag', t: t('axisPrice'), d: t('axisPriceDesc') },
              { icon: 'ti-infinity', t: t('axisLongTerm'), d: t('axisLongTermDesc') },
            ].map((m, i) => (
              <div key={i} className="bg-cream hairline rounded-xl p-4 text-center flex flex-col items-center gap-2 hover:shadow-sm transition-shadow">
                <div className="w-12 h-12 rounded-full bg-sage/10 grid place-items-center mb-1">
                  <i className={`ti ${m.icon} text-sage text-[22px]`}></i>
                </div>
                <div className="text-[13px] text-charcoal font-semibold">{m.t}</div>
                <div className="text-[11px] text-stone leading-relaxed">{m.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FROM MOM TO MOM — real destination: Telegram community link */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
        <a
          href="https://t.me/babiespicks"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-lavender rounded-2xl p-8 md:p-12 text-center hover:bg-lavender/80 active:scale-[0.99] transition-all group"
        >
          {/* Replace emoji with inline SVG icon */}
          <div className="w-12 h-12 rounded-full bg-lavender-border/30 mx-auto mb-4 grid place-items-center">
            <svg className="w-6 h-6 text-lavender-text" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <h2 className="text-[18px] md:text-[22px] text-lavender-text mb-3">{t('momToMom')}</h2>
          <p className="text-[13px] md:text-[14px] text-lavender-text/90 leading-[1.9] max-w-xl mx-auto">
            {t('momToMomDesc')}
          </p>
          <span className="inline-flex items-center gap-2 mt-5 bg-lavender-border/40 text-lavender-text text-[12px] rounded-full px-4 py-2 group-hover:bg-lavender-border/60 transition-colors">
            <i className="ti ti-brand-telegram text-[16px]"></i>
            {locale === 'ar' ? 'انضمي لمجتمعنا' : 'Join our community'}
          </span>
        </a>
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
