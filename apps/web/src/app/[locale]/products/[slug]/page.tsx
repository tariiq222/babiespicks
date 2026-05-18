import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  getProduct,
  getProductsByCategory,
  getVerdictVariant,
  getLocalizedName,
  getLocalizedDesc,
} from '@/shared/lib/api';
import type { Product } from '@/shared/lib/api';
import { VerdictPill, VerdictCard } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { PrimaryButton, SecondaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { ShareButtons } from '@/shared/components/share-buttons';
import { JsonLd } from '@/shared/components/json-ld';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const t = await getTranslations('product');
  const product = await getProduct(slug, locale);
  if (!product) return {};
  const name = getLocalizedName(product, locale);
  return {
    title: name,
    description: getLocalizedDesc(product, locale) || t('metaFallback', { name }),
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product) notFound();

  const name = getLocalizedName(product, locale);
  const description = getLocalizedDesc(product, locale);
  const variant = product.verdict ? getVerdictVariant(product.verdict.type) : null;

  const t = await getTranslations('product');
  const tc = await getTranslations('common');
  const ta = await getTranslations('axes');

  const sortedPrices = [...product.prices].sort((a, b) => a.price - b.price);
  const cheapestPrice = sortedPrices[0];
  const originalPrice = cheapestPrice?.originalPrice;
  const discountPercent = originalPrice
    ? Math.round(((originalPrice - cheapestPrice.price) / originalPrice) * 100)
    : 0;

  const specs = product.specs?.filter((s) => s.locale === locale) || [];

  const scores = product.verdict
    ? [
        { label: ta('safety'), icon: 'ti-shield-check', val: product.verdict.safetyScore },
        { label: ta('quality'), icon: 'ti-award', val: product.verdict.qualityScore },
        { label: ta('reviews'), icon: 'ti-star', val: product.verdict.reviewsScore },
        { label: ta('price'), icon: 'ti-tag', val: product.verdict.priceScore },
        { label: ta('longTerm'), icon: 'ti-infinity', val: product.verdict.longTermScore },
      ]
    : [];

  const conditions = locale === 'ar' ? product.verdict?.conditionsAr : product.verdict?.conditionsEn;
  const hasConditions = conditions && conditions.length > 0;
  const reviewPros = locale === 'ar' ? product.reviewSummary?.prosAr : product.reviewSummary?.prosEn;
  const reviewCons = locale === 'ar' ? product.reviewSummary?.consAr : product.reviewSummary?.consEn;
  const hasReviewPros = reviewPros && reviewPros.length > 0;
  const hasReviewCons = reviewCons && reviewCons.length > 0;

  const related = product.category?.slug
    ? (await getProductsByCategory(product.category.slug, locale))
        .filter((p: Product) => p.slug !== product.slug)
        .slice(0, 4)
    : [];

  return (
    <main>
      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-6">
        <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] text-stone">
          <ol className="flex items-center gap-1">
            <li>
              <Link href="/" className="hover:text-charcoal">
                {tc('home')}
              </Link>
            </li>
            <li aria-hidden="true" className="opacity-50">
              ←
            </li>
            {product.category && (
              <>
                <li>
                  <Link href={`/categories/${product.category.slug}`} className="hover:text-charcoal">
                    {product.category.name}
                  </Link>
                </li>
                <li aria-hidden="true" className="opacity-50">
                  ←
                </li>
              </>
            )}
            <li aria-current="page" className="text-charcoal">
              {name}
            </li>
          </ol>
        </nav>

        {/* Structured Data */}
        <JsonLd
          data={[
            {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name,
              description: description || undefined,
              image: product.imageUrl || undefined,
              brand: product.brand
                ? { '@type': 'Brand', name: product.brand }
                : undefined,
              aggregateRating: product.verdict
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: product.verdict.overallScore,
                    bestRating: 100,
                    worstRating: 0,
                    ratingCount: product.reviewSummary?.totalReviews || 0,
                  }
                : undefined,
              offers: cheapestPrice
                ? {
                    '@type': 'Offer',
                    price: cheapestPrice.price,
                    priceCurrency: 'SAR',
                    availability: 'https://schema.org/InStock',
                    seller: cheapestPrice.store?.name || undefined,
                  }
                : undefined,
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
                ...(product.category
                  ? [
                      {
                        '@type': 'ListItem',
                        position: 2,
                        name: product.category.name,
                        item: `${BASE_URL}/categories/${product.category.slug}`,
                      },
                    ]
                  : []),
                {
                  '@type': 'ListItem',
                  position: product.category ? 3 : 2,
                  name,
                  item: `${BASE_URL}/${locale}/products/${product.slug}`,
                },
              ],
            },
          ]}
        />
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6 grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12">
        {/* IMAGE COLUMN */}
        <div>
          <div className="bg-linen rounded-2xl p-8 md:p-12 grid place-items-center">
            <ProductImage
              src={product.imageUrl || undefined}
              width={360}
              height={400}
              alt={name}
              radius={16}
            />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`bg-linen rounded-lg p-3 ${i === 0 ? 'ring-1 ring-sage' : ''}`}>
                <ProductImage width={100} height={100} alt={t('angle', { n: i + 1 })} radius={6} />
              </div>
            ))}
          </div>
        </div>

        {/* INFO COLUMN */}
        <div>
          <div className="flex items-center gap-2">
            <CategoryTag>{product.category?.name || tc('product')}</CategoryTag>
            <span className="text-[11px] text-stone">{t('brand')} {product.brand || '-'}</span>
          </div>
          <h1 className="text-[24px] md:text-[30px] text-charcoal leading-[1.3] mt-4">{name}</h1>
          {description && <p className="text-[13px] md:text-[14px] text-stone mt-2">{description}</p>}

          <ShareButtons url={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com'}/${locale}/products/${product.slug}`} title={name} />

          <div className="mt-6">
            {product.verdict && variant ? (
              <VerdictCard
                variant={variant}
                score={product.verdict.overallScore}
                reason={locale === 'ar' ? product.verdict.reasoningAr : product.verdict.reasoningEn}
              />
            ) : (
              <div className="bg-stone/10 rounded-xl p-5 text-center text-stone">
                <i className="ti ti-clock-hour-4 text-[22px] mb-2 block"></i>
                <span className="text-[14px]">{t('notReviewed')}</span>
              </div>
            )}
          </div>

          {/* PRICE BLOCK */}
          {cheapestPrice && (
            <div className="mt-6 bg-cream hairline rounded-xl p-5">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-[28px] md:text-[32px] text-charcoal">
                  <SarPrice amount={cheapestPrice.price} />
                </span>
                {originalPrice && originalPrice > cheapestPrice.price && (
                  <span className="text-[14px] text-stone line-through">
                    <SarPrice amount={originalPrice} />
                  </span>
                )}
                {discountPercent > 0 && <DiscountTag>{t('save', { percent: discountPercent })}</DiscountTag>}
              </div>
              <div className="text-[12px] text-stone mt-1">{t('taxIncluded')}</div>
              <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3">
                <PrimaryButton full icon="ti-arrow-left" size="lg">
                  {t('buyFrom', { store: cheapestPrice.store?.name || tc('store') })}
                </PrimaryButton>
                <SecondaryButton>{t('comparePrices')}</SecondaryButton>
              </div>
              <p className="text-[11px] text-stone text-center mt-3">
                {t('affiliateDisclosure')}
              </p>
            </div>
          )}

          {/* Short bullets */}
          {specs.length > 0 && (
            <ul className="mt-6 grid sm:grid-cols-2 gap-2 text-[13px] text-charcoal">
              {specs.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <i className="ti ti-circle-check text-sage text-[16px] mt-[2px]"></i>
                  <span>{s.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* DETAILED RATING + PRICE COMPARISON */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16 grid md:grid-cols-2 gap-8 md:gap-12">
        <div>
          <h2 className="text-[20px] md:text-[22px] text-charcoal mb-5">{t('detailedRating')}</h2>
          <div className="bg-cream hairline rounded-xl p-5 md:p-6 space-y-5">
            {scores.length > 0 ? (
              scores.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center text-[14px]">
                    <i className={`ti ${s.icon} text-sage text-[18px] me-2`}></i>
                    <span className="text-charcoal">{s.label}</span>
                    <span className="ms-auto text-charcoal">{s.val}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-beige overflow-hidden">
                    <div className="h-full bg-sage rounded-full" style={{ width: `${s.val}%` }}></div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[13px] text-stone text-center py-4">{t('noDetailedRating')}</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-[20px] md:text-[22px] text-charcoal mb-5">{t('priceComparison')}</h2>
          {sortedPrices.length > 0 ? (
            <>
              <div className="hairline rounded-xl overflow-hidden">
                {sortedPrices.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center px-4 md:px-5 py-4 text-[14px] ${
                      i === 0 ? 'bg-verdict-good-bg' : 'bg-cream'
                    } ${i < sortedPrices.length - 1 ? 'hairline-b' : ''}`}
                  >
                    <span className={i === 0 ? 'text-verdict-good-text' : 'text-charcoal'}>
                      {s.store?.name || tc('store')}
                    </span>
                    {i === 0 && (
                      <span className="ms-2 text-[11px] bg-verdict-good-border/15 text-verdict-good-text px-2 py-[1px] rounded-full">
                        {t('bestPrice')}
                      </span>
                    )}
                    <span className={`ms-auto ${i === 0 ? 'text-verdict-good-text' : 'text-charcoal'}`}>
                      <SarPrice amount={s.price} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-stone mt-3">{t('pricesMayChange')}</p>
            </>
          ) : (
            <p className="text-[13px] text-stone text-center py-4 bg-cream hairline rounded-xl">
              {t('noPrices')}
            </p>
          )}
        </div>
      </section>

      {/* PROS / CONS */}
      {hasConditions || hasReviewPros || hasReviewCons ? (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 grid md:grid-cols-2 gap-5">
          <div className="bg-verdict-good-bg rounded-xl p-5 md:p-6">
            <div className="flex items-center gap-2 text-verdict-good-text text-[14px] mb-3">
              <i className="ti ti-plus text-[18px]"></i>
              <span>{t('pros')}</span>
            </div>
            <ul className="space-y-2 text-[13px] text-verdict-good-text/95">
              {(hasConditions
                ? conditions
                : reviewPros || []
              )?.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-verdict-good-border mt-[2px]">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-verdict-bad-bg rounded-xl p-5 md:p-6">
            <div className="flex items-center gap-2 text-verdict-bad-text text-[14px] mb-3">
              <i className="ti ti-alert-triangle text-[18px]"></i>
              <span>{t('cons')}</span>
            </div>
            <ul className="space-y-2 text-[13px] text-verdict-bad-text/95">
              {(hasReviewCons ? reviewCons : [])?.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-verdict-bad-border mt-[2px]">•</span>
                  <span>{t}</span>
                </li>
              )) || (
                <li className="flex gap-2">
                  <span className="text-verdict-bad-border mt-[2px]">•</span>
                  <span>{t('noCons')}</span>
                </li>
              )}
            </ul>
          </div>
        </section>
      ) : product.verdict ? (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
          <div className="bg-cream hairline rounded-xl p-5 md:p-6 text-center">
            <p className="text-[13px] text-charcoal leading-[1.8]">
              {locale === 'ar' ? product.verdict.reasoningAr : product.verdict.reasoningEn}
            </p>
          </div>
        </section>
      ) : null}

      {/* ALTERNATIVES */}
      {related.length > 0 && (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16">
          <SectionHead>{t('alternatives')}</SectionHead>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {related.map((p: Product) => {
              const pName = getLocalizedName(p, locale);
              const pVariant = p.verdict ? getVerdictVariant(p.verdict.type) : null;
              const pCheapest = p.prices?.length
                ? [...p.prices].sort((a, b) => a.price - b.price)[0]
                : null;
              return (
                <Link
                  key={p.id}
                  href={`/products/${p.slug}`}
                  className="bg-cream hairline rounded-xl p-3 md:p-4 text-right hover:bg-cream-hover transition-colors"
                >
                  <ProductImage
                    src={p.imageUrl || undefined}
                    width={999}
                    height={120}
                    alt={pName}
                    radius={8}
                  />
                  <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px]">
                    {pName}
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    {pVariant ? (
                      <VerdictPill variant={pVariant} score={p.verdict?.overallScore} />
                    ) : (
                      <span className="text-[11px] text-stone">—</span>
                    )}
                    {pCheapest ? (
                      <SarPrice amount={pCheapest.price} className="text-[12px] text-charcoal" />
                    ) : (
                      <span />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
