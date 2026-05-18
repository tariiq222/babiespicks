import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import {
  getProductsByCategory,
  getVerdictVariant,
  getLocalizedName,
  getLocalizedDesc,
  getRelatedContentForCategory,
  type Product,
} from '@/shared/lib/api';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { CategoryTag } from '@/shared/components/tags';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { ShareButtons } from '@/shared/components/share-buttons';
import { FaqSection } from './faq-section';
import { JsonLd } from '@/shared/components/json-ld';
import { RelatedContent } from '@/shared/components/related-content';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale, slug } = await params;
  const products = await getProductsByCategory(slug, locale);
  const categoryName = products[0]?.category?.name || slug;
  const t = await getTranslations('best');
  return {
    title: t('metaTitle', { category: categoryName }),
    description: t('metaDescription', { category: categoryName }),
    alternates: getAlternates(`/best/${slug}`, locale),
  };
}

function getCheapestProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  return products.reduce((cheapest, p) => {
    const price = p.prices[0]?.price ?? Infinity;
    const cheapestPrice = cheapest.prices[0]?.price ?? Infinity;
    return price < cheapestPrice ? p : cheapest;
  });
}

function getSafestProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  return products.reduce((safest, p) => {
    const safety = p.verdict?.safetyScore ?? 0;
    const safestSafety = safest.verdict?.safetyScore ?? 0;
    return safety > safestSafety ? p : safest;
  });
}

export default async function BestListPage({ params }: Props) {
  const { locale, slug } = await params;
  const t = await getTranslations('best');
  const tp = await getTranslations('product');
  const tc = await getTranslations('common');
  const products = await getProductsByCategory(slug, locale);
  const relatedBestLists = await getRelatedContentForCategory(slug, locale);
  const sorted = [...products].sort(
    (a, b) => (b.verdict?.overallScore || 0) - (a.verdict?.overallScore || 0),
  );

  const categoryName = products[0]?.category?.name || slug;
  const topProduct = sorted[0] || null;
  const cheapestProduct = getCheapestProduct(sorted);
  const safestProduct = getSafestProduct(sorted);

  const hasEnoughForSummary = sorted.length >= 3;
  const restProducts = sorted.slice(1);

  return (
    <main>
      {/* Header */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-8 md:pt-12">
        <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] text-stone mb-4">
          <ol className="flex items-center gap-1">
            <li>
              <Link href="/" className="hover:text-charcoal">{tc('home')}</Link>
            </li>
            <li aria-hidden="true" className="opacity-50"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
            <li>
              <Link href={`/categories/${slug}`} className="hover:text-charcoal">
                {categoryName}
              </Link>
            </li>
            <li aria-hidden="true" className="opacity-50"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
            <li aria-current="page" className="text-charcoal">{t('bestPicks')}</li>
          </ol>
        </nav>
        <CategoryTag>{t('buyingGuideTag')}</CategoryTag>
        <h1 className="text-[30px] md:text-[44px] lg:text-[50px] text-charcoal leading-[1.3] mt-4 max-w-3xl">
          {t('bestIn', { category: categoryName })}
          <br className="hidden md:inline" /> {t('inSaudi2026')}
        </h1>
        <p className="text-[14px] md:text-[16px] text-stone mt-4 max-w-2xl leading-[1.8]">
          {products.length > 0
            ? t('reviewedCount', { count: products.length })
            : t('defaultDescription', { category: categoryName })}
        </p>

        <ShareButtons url={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com'}/${locale}/best/${slug}`} title={t('bestIn', { category: categoryName })} />

        <div className="mt-6 max-w-3xl bg-lavender rounded-lg px-4 py-3 flex items-center gap-2 text-[12px] text-lavender-text">
          <i className="ti ti-info-circle text-[16px]"></i>
          <span>{t('affiliateDisclosure')}</span>
        </div>
        <JsonLd
          data={[
            {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: t('bestIn', { category: categoryName }),
              itemListElement: sorted.map((p, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: getLocalizedName(p, locale),
                url: `${BASE_URL}/${locale}/products/${p.slug}`,
              })),
            },
            {
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: tc('home'),
                  item: BASE_URL,
                },
                {
                  '@type': 'ListItem',
                  position: 2,
                  name: categoryName,
                  item: `${BASE_URL}/${locale}/categories/${slug}`,
                },
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: t('bestPicks'),
                  item: `${BASE_URL}/${locale}/best/${slug}`,
                },
              ],
            },
            {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: `${t('buyingGuide')} ${categoryName} ${t('inSaudi2026')}`,
              author: { '@type': 'Organization', name: 'BabiesPicks' },
              datePublished: '2026-01-01',
              publisher: { '@type': 'Organization', name: 'BabiesPicks', url: BASE_URL },
            },
          ]}
        />
      </section>

      {sorted.length === 0 ? (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16 text-center">
          <div className="bg-linen rounded-xl p-12">
            <i className="ti ti-package-off text-[48px] text-stone mb-4 block"></i>
            <p className="text-[16px] text-stone">{t('noReviewsYet')}</p>
          </div>
        </section>
      ) : (
        <>
          {/* QUICK SUMMARY */}
          {hasEnoughForSummary && (
            <section id="quick-summary" className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
              <SectionHead>{t('quickSummary')}</SectionHead>
              <div className="grid md:grid-cols-3 gap-4">
                {topProduct && (
                  <Link
                    href={`/products/${topProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div aria-hidden="true"><i className="ti ti-trophy text-[28px] text-amber-600"></i></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">{t('bestOverall')}</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(topProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{topProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
                {cheapestProduct && (
                  <Link
                    href={`/products/${cheapestProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div aria-hidden="true"><i className="ti ti-coin text-[28px] text-amber-600"></i></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">{t('bestPrice')}</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(cheapestProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{cheapestProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
                {safestProduct && (
                  <Link
                    href={`/products/${safestProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div aria-hidden="true"><i className="ti ti-shield-check text-[28px] text-sage"></i></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">{t('safest')}</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(safestProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{safestProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* DETAILED REVIEWS */}
          <section
            id="detailed-reviews"
            className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16 grid lg:grid-cols-[1.4fr_1fr] gap-10"
          >
            <div>
              <SectionHead>{t('detailedReviews')}</SectionHead>

              {/* Featured #1 */}
              {topProduct && (
                <Link href={`/products/${topProduct.slug}`} className="block">
                  <article className="bg-cream border border-sage rounded-2xl p-5 md:p-8 relative hover:bg-cream/80 transition-colors">
                    <div className="absolute -top-3 right-6 bg-sage text-cream text-[11px] px-3 py-1 rounded-full">
                      {t('bestOverallBadge')}
                    </div>
                    <div className="grid sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr] gap-5 md:gap-7 mt-2">
                      <div className="bg-linen rounded-xl p-4 grid place-items-center">
                        <ProductImage
                          src={topProduct.imageUrl || undefined}
                          width={150}
                          height={180}
                          alt={getLocalizedName(topProduct, locale)}
                        />
                      </div>
                      <div>
                        <CategoryTag>{categoryName}</CategoryTag>
                        <h3 className="text-[18px] md:text-[22px] text-charcoal mt-3 leading-snug">
                          {getLocalizedName(topProduct, locale)}
                        </h3>
                        <p className="text-[13px] text-stone mt-2 leading-[1.8]">
                          {getLocalizedDesc(topProduct, locale) || tp('noDescription')}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                          {topProduct.verdict && (
                            <VerdictPill
                              variant={getVerdictVariant(topProduct.verdict.type)}
                              score={topProduct.verdict.overallScore}
                            />
                          )}
                          {topProduct.prices[0]?.originalPrice && (
                            <span className="text-[13px] text-stone line-through">
                              <SarPrice amount={topProduct.prices[0].originalPrice} />
                            </span>
                          )}
                          {topProduct.prices[0] && (
                            <span className="text-[16px] text-charcoal">
                              <SarPrice amount={topProduct.prices[0].price} />
                            </span>
                          )}
                        </div>
                        <div className="mt-5 inline-flex items-center gap-2 bg-sage text-cream rounded-lg px-4 py-3 text-[14px] hover:bg-sage-hover active:bg-sage-active transition-colors">
                          <span>{t('viewFullReview')}</span>
                          <i className="ti ti-arrow-left flip-x text-[16px]"></i>
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              )}

              {/* Ranked list */}
              {restProducts.length > 0 && (
                <div className="mt-5 space-y-3">
                  {restProducts.map((product, index) => {
                    const rank = index + 2;
                    const variant = product.verdict
                      ? getVerdictVariant(product.verdict.type)
                      : 'good';
                    const price = product.prices[0];
                    return (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        className="w-full bg-linen rounded-xl p-4 md:p-5 text-right flex items-center gap-4 md:gap-5 hover:bg-linen-hover"
                      >
                        <div className="text-[22px] md:text-[26px] text-stone w-8 text-center">
                          {rank}
                        </div>
                        <div
                          className="bg-cream rounded-lg p-2 hidden sm:block"
                          style={{ width: 80 }}
                        >
                          <ProductImage
                            src={product.imageUrl || undefined}
                            width={70}
                            height={85}
                            alt={getLocalizedName(product, locale)}
                            radius={6}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] md:text-[14px] text-charcoal leading-tight">
                            {getLocalizedName(product, locale)}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            {product.verdict && (
                              <VerdictPill
                                variant={variant}
                                score={product.verdict.overallScore}
                              />
                            )}
                            {price && (
                              <SarPrice
                                amount={price.price}
                                className="text-[12px] text-stone"
                              />
                            )}
                          </div>
                        </div>
                        <i className="ti ti-chevron-left text-stone text-[20px]"></i>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:sticky lg:top-24 lg:self-start space-y-5">
              <div className="bg-linen rounded-xl p-5">
                <h3 className="text-[15px] text-charcoal mb-3">{t('inThisList')}</h3>
                <ul className="space-y-2 text-[12px] text-stone">
                  <li>
                    <a href="#quick-summary" className="hover:text-charcoal">
                      {t('quickSummaryLink')}
                    </a>
                  </li>
                  <li>
                    <a href="#detailed-reviews" className="hover:text-charcoal">
                      {t('detailedReviewsLink')}
                    </a>
                  </li>
                  <li>
                    <a href="#buying-guide" className="hover:text-charcoal">
                      {t('buyingGuideLink')}
                    </a>
                  </li>
                  <li>
                    <a href="#faqs" className="hover:text-charcoal">
                      {t('faqsLink')}
                    </a>
                  </li>
                </ul>
              </div>
              <div className="bg-lavender rounded-xl p-5">
                <div className="mb-2"><i className="ti ti-mail text-[18px]" aria-hidden="true"></i></div>
                <h3 className="text-[14px] text-lavender-text">{t('stayUpdated')}</h3>
                <p className="text-[12px] text-lavender-text/80 mt-2 leading-[1.7]">
                  {t('stayUpdatedDesc')}
                </p>
              </div>
              <div className="bg-cream hairline rounded-xl p-5">
                <h3 className="text-[14px] text-charcoal mb-3">{t('ourMethodology')}</h3>
                <p className="text-[12px] text-stone leading-[1.8]">
                  {t('ourMethodologyDesc')}
                </p>
              </div>
            </aside>
          </section>

          {/* BUYING GUIDE */}
          <section
            id="buying-guide"
            className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16"
          >
            <SectionHead>{t('buyingGuide')}</SectionHead>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { icon: 'ti-shield-check', title: t('guideSafetyTitle'), body: t('guideSafetyBody') },
                { icon: 'ti-award', title: t('guideQualityTitle'), body: t('guideQualityBody') },
                { icon: 'ti-tag', title: t('guidePriceTitle'), body: t('guidePriceBody') },
                { icon: 'ti-stethoscope', title: t('guideConsultTitle'), body: t('guideConsultBody') },
              ].map((g, i) => (
                <div key={i} className="bg-linen rounded-xl p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`ti ${g.icon} text-sage text-[20px]`}></i>
                    <h3 className="text-[16px] text-charcoal">{g.title}</h3>
                  </div>
                  <p className="text-[13px] text-stone leading-[1.8]">{g.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQs */}
          <section
            id="faqs"
            className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 mt-16"
          >
            <SectionHead>{t('faqsTitle')}</SectionHead>
            <FaqSection faqs={[
              { q: t('faqHowReview'), a: t('faqHowReviewA') },
              { q: t('faqPaid'), a: t('faqPaidA') },
              { q: t('faqPrices'), a: t('faqPricesA') },
              { q: t('faqSuggest'), a: t('faqSuggestA') },
            ]} />
          </section>

          {/* RELATED BEST LISTS */}
          <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16">
            <RelatedContent
              items={relatedBestLists.map((bl) => ({
                title: bl.title,
                href: `/best/${bl.slug}`,
                type: 'best-list' as const,
                image: bl.imageUrl ?? undefined,
              }))}
            />
          </section>

          {/* BROWSE BY CATEGORY */}
          <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
            <RelatedContent
              items={[
                {
                  title: t('browseAllProducts', { category: categoryName }),
                  href: `/categories/${slug}`,
                  type: 'category' as const,
                },
              ]}
            />
          </section>
        </>
      )}
    </main>
  );
}
