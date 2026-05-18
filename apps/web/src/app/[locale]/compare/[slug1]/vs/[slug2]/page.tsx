import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getProduct, getVerdictVariant, getLocalizedName } from '@/shared/lib/api';
import type { Product } from '@/shared/lib/api';
import { VerdictPill, VerdictCard } from '@/shared/components/verdict-pill';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { JsonLd } from '@/shared/components/json-ld';

interface Props {
  params: Promise<{ locale: string; slug1: string; slug2: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale, slug1, slug2 } = await params;
  const [p1, p2] = await Promise.all([getProduct(slug1, locale), getProduct(slug2, locale)]);
  if (!p1 || !p2) return {};
  const name1 = getLocalizedName(p1, locale);
  const name2 = getLocalizedName(p2, locale);
  return {
    title: `${name1} vs ${name2}`,
    description: `Compare ${name1} and ${name2} — verdict scores, prices, and specs side by side.`,
  };
}

function ScoreBar({ label, value, winnerValue }: { label: string; value: number; winnerValue: number }) {
  const isWinner = value > winnerValue;
  const isTie = value === winnerValue;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-stone w-6 text-end">{value}</span>
      <div className="flex-1 h-2 rounded-full bg-beige overflow-hidden">
        <div
          className={`h-full rounded-full ${isWinner ? 'bg-sage' : isTie ? 'bg-lavender-border' : 'bg-stone/40'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      {isWinner && <i className="ti ti-cup text-sage text-[14px]" />}
    </div>
  );
}

function PriceRow({ price, originalPrice, storeName, isLowest }: {
  price: number;
  originalPrice: number | null;
  storeName: string | null;
  isLowest: boolean;
}) {
  return (
    <div className={`flex items-center py-3 px-4 ${isLowest ? 'bg-verdict-good-bg' : 'bg-cream'} ${isLowest ? 'text-verdict-good-text' : 'text-charcoal'}`}>
      <span className={`text-[14px] ${isLowest ? 'text-verdict-good-text' : 'text-charcoal'}`}>
        {storeName || '—'}
      </span>
      {isLowest && (
        <span className="ms-2 text-[11px] bg-verdict-good-border/15 text-verdict-good-text px-2 py-[1px] rounded-full">
          Best
        </span>
      )}
      <span className={`ms-auto text-[14px] font-medium ${isLowest ? 'text-verdict-good-text' : 'text-charcoal'}`}>
        <SarPrice amount={price} />
      </span>
      {originalPrice && originalPrice > price && (
        <span className="ms-3 text-[12px] text-stone line-through">
          <SarPrice amount={originalPrice} />
        </span>
      )}
    </div>
  );
}

export default async function ComparePage({ params }: Props) {
  const { locale, slug1, slug2 } = await params;
  const [p1, p2] = await Promise.all([getProduct(slug1, locale), getProduct(slug2, locale)]);

  if (!p1 || !p2) notFound();

  const name1 = getLocalizedName(p1, locale);
  const name2 = getLocalizedName(p2, locale);
  const variant1 = p1.verdict ? getVerdictVariant(p1.verdict.type) : null;
  const variant2 = p2.verdict ? getVerdictVariant(p2.verdict.type) : null;

  const t = await getTranslations('compare');
  const tc = await getTranslations('common');
  const ta = await getTranslations('axes');

  const score1 = p1.verdict?.overallScore ?? 0;
  const score2 = p2.verdict?.overallScore ?? 0;
  const overallWinner = score1 > score2 ? p1 : score2 > score1 ? p2 : null;
  const overallWinnerSlug = score1 > score2 ? slug1 : score2 > score1 ? slug2 : null;

  const axes = [
    { key: 'safety', ar: ta('safety'), icon: 'ti-shield-check', s1: p1.verdict?.safetyScore ?? 0, s2: p2.verdict?.safetyScore ?? 0 },
    { key: 'quality', ar: ta('quality'), icon: 'ti-award', s1: p1.verdict?.qualityScore ?? 0, s2: p2.verdict?.qualityScore ?? 0 },
    { key: 'reviews', ar: ta('reviews'), icon: 'ti-star', s1: p1.verdict?.reviewsScore ?? 0, s2: p2.verdict?.reviewsScore ?? 0 },
    { key: 'price', ar: ta('price'), icon: 'ti-tag', s1: p1.verdict?.priceScore ?? 0, s2: p2.verdict?.priceScore ?? 0 },
    { key: 'longTerm', ar: ta('longTerm'), icon: 'ti-infinity', s1: p1.verdict?.longTermScore ?? 0, s2: p2.verdict?.longTermScore ?? 0 },
  ];

  const sorted1 = [...p1.prices].sort((a, b) => a.price - b.price);
  const sorted2 = [...p2.prices].sort((a, b) => a.price - b.price);
  const bestPrice1 = sorted1[0];
  const bestPrice2 = sorted2[0];

  // Merge spec keys from both products
  const allSpecKeys = Array.from(new Set([...p1.specs.map((s) => s.key), ...p2.specs.map((s) => s.key)]));

  const reasoning1 = p1.verdict
    ? (locale === 'ar' ? p1.verdict.reasoningAr : p1.verdict.reasoningEn)
    : null;
  const reasoning2 = p2.verdict
    ? (locale === 'ar' ? p2.verdict.reasoningAr : p2.verdict.reasoningEn)
    : null;

  return (
    <main>
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-6">
        <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] text-stone">
          <ol className="flex items-center gap-1">
            <li><Link href="/" className="hover:text-charcoal">{tc('home')}</Link></li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li><Link href={`/${locale}/compare`} className="hover:text-charcoal">{t('title')}</Link></li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li aria-current="page" className="text-charcoal">{name1} vs {name2}</li>
          </ol>
        </nav>
      </div>

      {/* JSON-LD */}
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: name1,
            image: p1.imageUrl || undefined,
            aggregateRating: p1.verdict
              ? { '@type': 'AggregateRating', ratingValue: p1.verdict.overallScore, bestRating: 100, worstRating: 0 }
              : undefined,
            offers: bestPrice1
              ? { '@type': 'Offer', price: bestPrice1.price, priceCurrency: 'SAR' }
              : undefined,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: name2,
            image: p2.imageUrl || undefined,
            aggregateRating: p2.verdict
              ? { '@type': 'AggregateRating', ratingValue: p2.verdict.overallScore, bestRating: 100, worstRating: 0 }
              : undefined,
            offers: bestPrice2
              ? { '@type': 'Offer', price: bestPrice2.price, priceCurrency: 'SAR' }
              : undefined,
          },
        ]}
      />

      {/* Header */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6">
        <div className="flex items-center gap-3 mb-2">
          <i className="ti ti-arrows-shuffle text-sage text-[22px]"></i>
          <span className="text-[13px] text-stone">{t('title')}</span>
        </div>
        <h1 className="text-[22px] md:text-[28px] text-charcoal">
          <span className="text-sage">{name1}</span>
          <span className="text-stone mx-3">vs</span>
          <span className="text-terracotta">{name2}</span>
        </h1>
      </div>

      {/* Product Cards + Verdict */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8 grid md:grid-cols-2 gap-6">
        {[p1, p2].map((product, idx) => {
          const slug = idx === 0 ? slug1 : slug2;
          const name = idx === 0 ? name1 : name2;
          const variant = idx === 0 ? variant1 : variant2;
          const sortedPrices = [...product.prices].sort((a, b) => a.price - b.price);
          const bestPrice = sortedPrices[0];
          const isOverallWinner = overallWinnerSlug === slug;

          return (
            <div key={product.id} className={`rounded-2xl p-6 ${isOverallWinner && overallWinner ? 'bg-cream hairline ring-2 ring-sage' : 'bg-cream hairline'}`}>
              {isOverallWinner && overallWinner && (
                <div className="flex items-center gap-2 mb-4">
                  <i className="ti ti-cup text-sage text-[18px]" />
                  <span className="text-[13px] text-sage font-medium">{t('winner')}</span>
                </div>
              )}

              <Link href={`/${locale}/products/${slug}`} className="block">
                <div className="bg-linen rounded-xl p-6 grid place-items-center mb-4">
                  <ProductImage src={product.imageUrl || undefined} width={200} height={220} alt={name} radius={12} />
                </div>
              </Link>

              <div className="text-[15px] text-charcoal font-medium leading-tight mb-2">{name}</div>
              <div className="text-[12px] text-stone mb-4">{product.category?.name || tc('product')}</div>

              {product.verdict && variant ? (
                <VerdictCard variant={variant} score={product.verdict.overallScore} />
              ) : (
                <div className="bg-stone/10 rounded-xl p-4 text-center text-stone text-[13px]">
                  {t('noVerdict')}
                </div>
              )}

              {/* Best price */}
              {bestPrice && (
                <div className="mt-4 bg-white hairline rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-[12px] text-stone">{t('bestPrice')}</span>
                  <SarPrice amount={bestPrice.price} className="text-[16px] text-charcoal font-medium" />
                  <span className="text-[12px] text-stone">{bestPrice.store?.name || tc('store')}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Score Comparison */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-10">
        <h2 className="text-[18px] text-charcoal mb-5">{t('verdictComparison')}</h2>
        <div className="bg-cream hairline rounded-2xl p-6">
          {/* Overall score row */}
          <div className="flex items-center gap-4 mb-6 pb-5 hairline-b">
            <span className="w-24 text-[13px] text-stone">{t('overallScore')}</span>
            <div className="flex-1 grid grid-cols-2 gap-6">
              <ScoreBar label="" value={score1} winnerValue={score2} />
              <ScoreBar label="" value={score2} winnerValue={score1} />
            </div>
          </div>
          {/* Per-axis rows */}
          {axes.map((axis) => (
            <div key={axis.key} className="flex items-center gap-4 mb-4">
              <span className="w-24 text-[13px] text-stone flex items-center gap-1">
                <i className={`ti ${axis.icon} text-sage text-[14px]`}></i>
                {locale === 'ar' ? axis.ar : ta(axis.key)}
              </span>
              <div className="flex-1 grid grid-cols-2 gap-6">
                <ScoreBar label="" value={axis.s1} winnerValue={axis.s2} />
                <ScoreBar label="" value={axis.s2} winnerValue={axis.s1} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Comparison */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8">
        <h2 className="text-[18px] text-charcoal mb-5">{t('priceComparison')}</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { product: p1, name: name1, slug: slug1, sorted: sorted1 },
            { product: p2, name: name2, slug: slug2, sorted: sorted2 },
          ].map(({ product, name, slug, sorted }) => (
            <div key={product.id}>
              <div className="text-[14px] text-charcoal font-medium mb-3 flex items-center gap-2">
                <Link href={`/${locale}/products/${slug}`} className="hover:text-sage">{name}</Link>
              </div>
              <div className="hairline rounded-xl overflow-hidden">
                {sorted.length > 0 ? (
                  sorted.map((priceEntry, i) => (
                    <PriceRow
                      key={i}
                      price={priceEntry.price}
                      originalPrice={priceEntry.originalPrice}
                      storeName={priceEntry.store?.name || null}
                      isLowest={i === 0}
                    />
                  ))
                ) : (
                  <div className="bg-cream px-4 py-4 text-center text-[13px] text-stone">
                    {t('noPrices')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Specs Comparison */}
      {allSpecKeys.length > 0 && (
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8 mb-12">
          <h2 className="text-[18px] text-charcoal mb-5">{t('specsComparison')}</h2>
          <div className="hairline rounded-2xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-linen">
                  <th className="text-start px-4 py-3 text-stone font-normal w-1/3">{t('spec')}</th>
                  <th className="text-start px-4 py-3 text-charcoal font-medium">{name1}</th>
                  <th className="text-start px-4 py-3 text-charcoal font-medium">{name2}</th>
                </tr>
              </thead>
              <tbody>
                {allSpecKeys.map((key) => {
                  const v1 = p1.specs.find((s) => s.key === key && s.locale === locale)?.value;
                  const v2 = p2.specs.find((s) => s.key === key && s.locale === locale)?.value;
                  const isDifferent = v1 !== v2;
                  return (
                    <tr key={key} className="hairline-t">
                      <td className="px-4 py-3 text-stone">{key}</td>
                      <td className={`px-4 py-3 ${isDifferent ? 'text-charcoal font-medium' : 'text-stone'}`}>{v1 || '—'}</td>
                      <td className={`px-4 py-3 ${isDifferent ? 'text-charcoal font-medium' : 'text-stone'}`}>{v2 || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Our Verdict */}
      {overallWinner && (
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6 mb-12">
          <div className="bg-sage/10 border border-sage/20 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4">
              <i className="ti ti-cup text-sage text-[22px]" />
              <h2 className="text-[18px] text-charcoal">{t('ourVerdict')}</h2>
            </div>
            <p className="text-[15px] text-charcoal leading-[1.8]">
              {overallWinner === p1
                ? (locale === 'ar' ? `المنتج ${name1} يتفوق على ${name2} بناءً على تقييمنا الشامل.` : `${name1} beats ${name2} based on our overall scoring.`)
                : (locale === 'ar' ? `المنتج ${name2} يتفوق على ${name1} بناءً على تقييمنا الشامل.` : `${name2} beats ${name1} based on our overall scoring.`)}
            </p>
            <div className="flex gap-3 mt-5 flex-wrap">
              <Link
                href={`/${locale}/products/${overallWinnerSlug}`}
                className="inline-flex items-center gap-2 bg-sage text-cream rounded-lg px-5 py-3 text-[14px] hover:bg-sage-hover transition-colors"
              >
                {t('viewWinner')} <i className="ti ti-arrow-left flip-x"></i>
              </Link>
              <Link
                href={`/${locale}/compare`}
                className="inline-flex items-center gap-2 border border-sage text-sage rounded-lg px-5 py-3 text-[14px] hover:bg-sage-hover-bg transition-colors"
              >
                {t('compareOther')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}