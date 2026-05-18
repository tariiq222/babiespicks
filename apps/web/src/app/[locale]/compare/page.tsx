import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getProducts, getLocalizedName } from '@/shared/lib/api';
import type { Product } from '@/shared/lib/api';
import { ProductSelectorClient } from './product-selector';

interface Props {
  params: Promise<{ locale: string }>;
}

// Popular comparisons built dynamically from first 4 products
function buildPopularComparisons(prods: Product[], locale: string) {
  const pairs: Array<{ slug1: string; slug2: string; labelAr: string; labelEn: string }> = [];
  for (let i = 0; i < prods.length - 1 && pairs.length < 4; i += 2) {
    const a = prods[i];
    const b = prods[i + 1];
    if (!a || !b) continue;
    const nameAr = (n: Product) => n.translations.find(t => t.locale === 'ar')?.name ?? n.translations[0]?.name ?? '';
    const nameEn = (n: Product) => n.translations.find(t => t.locale === 'en')?.name ?? n.translations[0]?.name ?? '';
    pairs.push({
      slug1: a.slug,
      slug2: b.slug,
      labelAr: `${nameAr(a)} vs ${nameAr(b)}`,
      labelEn: `${nameEn(a)} vs ${nameEn(b)}`,
    });
  }
  return pairs;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('compare');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function CompareSelectorPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations('compare');
  const tc = await getTranslations('common');

  const { data: products } = await getProducts(locale, 200);

  const productOptions = products.map((p) => ({
    slug: p.slug,
    name: getLocalizedName(p, locale),
  }));

  const popularComparisons = buildPopularComparisons(products, locale);

  return (
    <main className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 py-10">
      {/* Breadcrumb */}
      <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] text-stone mb-6">
        <ol className="flex items-center gap-1">
          <li>
            <Link href="/" className="hover:text-charcoal">{tc('home')}</Link>
          </li>
          <li aria-hidden="true" className="opacity-50"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
          <li aria-current="page" className="text-charcoal">{t('title')}</li>
        </ol>
      </nav>

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-[28px] md:text-[36px] text-charcoal">{t('heroTitle')}</h1>
        <p className="text-[15px] text-stone mt-3">{t('heroSubtitle')}</p>
      </div>

      {/* Product Selector */}
      <div className="bg-cream hairline rounded-2xl p-6 md:p-8 mb-8">
        <h2 className="text-[18px] text-charcoal mb-5">{t('selectProducts')}</h2>
        <ProductSelectorClient
          products={productOptions}
          locale={locale}
          labels={{
            productA: t('productA'),
            productB: t('productB'),
            chooseProduct: t('chooseProduct'),
            compareButton: t('compareButton'),
          }}
        />
      </div>

      {/* Popular Comparisons */}
      {popularComparisons.length > 0 && (
        <div>
          <h2 className="text-[18px] text-charcoal mb-4">{t('popularComparisons')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {popularComparisons.map((comp, i) => (
              <Link
                key={i}
                href={`/compare/${comp.slug1}/vs/${comp.slug2}`}
                className="bg-cream hairline rounded-xl p-4 flex items-center gap-4 hover:bg-cream-hover transition-colors"
              >
                <div className="flex-1">
                  <div className="text-[14px] text-charcoal font-medium">
                    {locale === 'ar' ? comp.labelAr : comp.labelEn}
                  </div>
                  <div className="text-[12px] text-stone mt-1">{t('popularComparisonsHint')}</div>
                </div>
                <i className="ti ti-arrows-shuffle text-sage text-[20px]"></i>
              </Link>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}