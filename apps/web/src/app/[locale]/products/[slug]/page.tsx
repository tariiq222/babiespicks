import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import {
  getProduct,
  getProductsByCategory,
  getVerdictVariant,
  getLocalizedName,
  getLocalizedDesc,
  getRelatedContentForProduct,
} from '@/shared/lib/api';
import type { Product } from '@/shared/lib/api';
import { VerdictPill, VerdictCard } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { SecondaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { ShareButtons } from '@/shared/components/share-buttons';
import { JsonLd } from '@/shared/components/json-ld';
import { RelatedContent } from '@/shared/components/related-content';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Returns a meaningful display description for a product, falling back to
 * verdict reasoning when the raw description is essentially the product name/title.
 */
function getDisplayDescription(product: Product, name: string, locale: string): string | null {
  const rawDesc = getLocalizedDesc(product, locale);
  const verdictReasoning = locale === 'ar' ? product.verdict?.reasoningAr : product.verdict?.reasoningEn;

  if (!rawDesc) return verdictReasoning ?? null;

  const trimmedDesc = rawDesc.trim();
  if (trimmedDesc.length <= 10) return verdictReasoning ?? null;

  const nameTrimmed = name.trim();
  // Exact match — not meaningful
  if (trimmedDesc === nameTrimmed) return verdictReasoning ?? null;

  // Normalize repeated whitespace for substring comparison
  const normalizedDesc = trimmedDesc.replace(/\s+/g, ' ');
  const normalizedName = nameTrimmed.replace(/\s+/g, ' ');

  // Title is a substring of description — title-like store description
  if (normalizedName.length > 0 && normalizedDesc.includes(normalizedName)) return verdictReasoning ?? null;
  // Description is a substring of title — title-like
  if (normalizedDesc.length > 0 && normalizedName.includes(normalizedDesc)) return verdictReasoning ?? null;

  return trimmedDesc;
}

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations('product');
  const product = await getProduct(slug, locale);
  if (!product) return {};
  const name = getLocalizedName(product, locale);
  const description = getDisplayDescription(product, name, locale) ?? t('metaFallback', { name });
  return {
    title: name,
    description,
    alternates: getAlternates(`/products/${slug}`, locale),
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product) notFound();

  const name = getLocalizedName(product, locale);
  const displayDescription = getDisplayDescription(product, name, locale);
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

  const { bestLists, guides } = await getRelatedContentForProduct(
    product.slug,
    product.category?.slug ?? null,
    locale,
  );

  const relatedContentItems = [
    ...bestLists.map((bl) => ({
      title: bl.title,
      href: `/best/${bl.slug}`,
      type: 'best-list' as const,
      image: bl.imageUrl ?? undefined,
    })),
    ...guides.map((g) => ({
      title: g.title,
      href: `/best/${g.slug}`,
      type: 'guide' as const,
      image: g.imageUrl ?? undefined,
    })),
  ];

  return (
    <main>
      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-6">
        <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] text-stone">
          <ol className="flex items-center gap-1 min-w-0">
            <li>
              <Link href="/" className="hover:text-charcoal">
                {tc('home')}
              </Link>
            </li>
            <li aria-hidden="true" className="opacity-50">
              <i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i>
            </li>
            {product.category && (
              <>
                <li>
                  <Link href={`/categories/${product.category.slug}`} className="hover:text-charcoal">
                    {product.category.name}
                  </Link>
                </li>
                <li aria-hidden="true" className="opacity-50">
                  <i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i>
                </li>
              </>
            )}
            <li aria-current="page" className="text-charcoal truncate min-w-0">
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
              description: displayDescription || undefined,
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
          {/* No additional product images available — thumbnail strip omitted */}
        </div>

        {/* INFO COLUMN */}
        <div>
          <div className="flex items-center gap-2">
            <CategoryTag>{product.category?.name || tc('product')}</CategoryTag>
            <span className="text-[11px] text-stone">{t('brand')} {product.brand || '-'}</span>
          </div>
          <h1 className="text-[24px] md:text-[30px] text-charcoal leading-[1.3] mt-4">{name}</h1>
          {displayDescription && <p className="text-[13px] md:text-[14px] text-stone mt-2">{displayDescription}</p>}

          {/* CRO: trust badges */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="inline-flex items-center gap-1 text-[11px] text-verdict-good-text bg-verdict-good-bg px-2.5 py-1 rounded-full">
              <i className="ti ti-robot text-[13px]"></i>
              {locale === 'ar' ? 'مراجعة موثّقة بالذكاء الاصطناعي' : 'AI-verified review'}
            </span>
            {sortedPrices.length > 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-verdict-good-text bg-verdict-good-bg px-2.5 py-1 rounded-full">
                <i className="ti ti-tag text-[13px]"></i>
                {locale === 'ar'
                  ? `مقارنة أسعار من ${sortedPrices.length} متاجر`
                  : `Price comparison across ${sortedPrices.length} stores`}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-stone bg-cream px-2.5 py-1 rounded-full hairline">
              <i className="ti ti-refresh text-[13px]"></i>
              {locale === 'ar' ? 'محدَّث بانتظام' : 'Regularly updated'}
            </span>
          </div>

          <ShareButtons url={`${process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com'}/${locale}/products/${product.slug}`} title={name} />

          <div className="flex items-center gap-3 mt-4">
            <Link
              href={`/compare?a=${product.slug}`}
              className="inline-flex items-center gap-2 border border-sage text-sage rounded-lg px-4 py-2 text-[13px] hover:bg-sage-hover-bg transition-colors"
            >
              <i className="ti ti-arrows-shuffle text-[15px]"></i>
              {tc('compare')}
            </Link>
          </div>

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

          {/* PRICE BLOCK — Bold editorial treatment */}
          {cheapestPrice && (
            <div className="mt-6 bg-cream hairline rounded-xl p-6 relative overflow-hidden">
              {/* Decorative corner accent */}
              <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none" aria-hidden="true">
                <svg viewBox="0 0 96 96" fill="none">
                  <path d="M96 0 L96 96 L0 96" stroke="#6B8E7F" strokeWidth="2"/>
                </svg>
              </div>
              <div className="flex items-baseline gap-3 flex-wrap relative">
                <span className="text-[32px] md:text-[36px] text-charcoal font-semibold leading-none">
                  <SarPrice amount={cheapestPrice.price} />
                </span>
                {originalPrice && originalPrice > cheapestPrice.price && (
                  <span className="text-[15px] text-stone line-through">
                    <SarPrice amount={originalPrice} />
                  </span>
                )}
                {discountPercent > 0 && <DiscountTag>{t('save', { percent: discountPercent })}</DiscountTag>}
              </div>
              <div className="text-[12px] text-stone mt-1 relative">{t('taxIncluded')}</div>
              <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 relative">
                <a
                  href={`${API_URL}/go/best/${product.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-sage text-cream rounded-lg transition-all inline-flex items-center justify-center gap-2 hover:bg-sage-hover active:bg-sage-active px-6 py-[14px] text-[15px] w-full shadow-sm hover:shadow-md"
                >
                  <span>{t('buyFrom', { store: cheapestPrice.store?.name || tc('store') })}</span>
                  <i className="ti ti-arrow-left flip-x text-[16px]"></i>
                </a>
                <SecondaryButton>{t('comparePrices')}</SecondaryButton>
              </div>
              <p className="text-[11px] text-stone text-center mt-3 relative">
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
          <h2 className="text-[20px] md:text-[22px] text-charcoal mb-5 font-medium">{t('detailedRating')}</h2>
          <div className="bg-cream hairline rounded-xl p-5 md:p-6 space-y-5">
            {scores.length > 0 ? (
              scores.map((s, i) => (
                <div key={i}>
                  <div className="flex items-center text-[14px] mb-2">
                    <i className={`ti ${s.icon} text-sage text-[18px] me-2`}></i>
                    <span className="text-charcoal font-medium">{s.label}</span>
                    <span className="ms-auto text-charcoal font-semibold">{s.val}</span>
                  </div>
                  <div className="h-2 rounded-full bg-beige overflow-hidden">
                    <div className="h-full bg-sage rounded-full transition-all" style={{ width: `${s.val}%` }}></div>
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
                  <a
                    key={i}
                    href={`${API_URL}/go/${product.id}/${s.storeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center px-4 md:px-5 py-4 text-[14px] transition-opacity hover:opacity-80 ${
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
                  </a>
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

      {/* RELATED CONTENT */}
      {relatedContentItems.length > 0 && <RelatedContent items={relatedContentItems} />}
    </main>
  );
}
