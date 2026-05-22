import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getProductsByCategory, getVerdictVariant } from '@/shared/lib/api';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { SarPrice } from '@/shared/components/sar-price';
import { getAlternates } from '@/shared/lib/metadata';

const BEST_CATEGORIES = [
  {
    key: 'formula',
    icon: 'ti-bottle',
    tint: '#E8EFE9',
    imageUrl: '/images/best-categories/formula.jpg',
  },
  {
    key: 'diapers',
    icon: 'ti-droplet',
    tint: '#EAF0EE',
    imageUrl: '/images/best-categories/diapers.jpg',
  },
  {
    key: 'carseats',
    icon: 'ti-car',
    tint: '#E5EBE7',
    imageUrl: '/images/best-categories/carseats.jpg',
  },
  {
    key: 'bottles',
    icon: 'ti-baby-bottle',
    tint: '#ECF2EE',
    imageUrl: '/images/best-categories/bottles.jpg',
  },
  {
    key: 'toys',
    icon: 'ti-puzzle',
    tint: '#EBEFE6',
    imageUrl: '/images/best-categories/toys.jpg',
  },
  {
    key: 'care',
    icon: 'ti-mug',
    tint: '#E8EEEA',
    imageUrl: '/images/best-categories/care.jpg',
  },
];

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('best');
  return {
    title: t('heroTitle'),
    description: t('heroSubtitle'),
    alternates: getAlternates('/best', locale),
  };
}

export default async function BestIndexPage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations('best');
  const tcat = await getTranslations('categories');
  const tcommon = await getTranslations('common');
  const thome = await getTranslations('home');

  // Fetch products for each category in parallel
  const categoryProductsLists = await Promise.all(
    BEST_CATEGORIES.map((cat) => getProductsByCategory(cat.key, locale))
  );

  // Build card data
  const categoryData = BEST_CATEGORIES.map((cat, i) => {
    const catProducts = categoryProductsLists[i] ?? [];
    // Top product by verdict score
    const top =
      catProducts.length > 0
        ? catProducts.reduce((best, p) => {
            const bScore = best.verdict?.overallScore ?? 0;
            const pScore = p.verdict?.overallScore ?? 0;
            return pScore > bScore ? p : best;
          })
        : null;
    return { ...cat, count: catProducts.length, top };
  });

  return (
    <main>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(160deg, #E8EFE9 0%, #F0EDE6 40%, #FAF8F5 100%)' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-16 pb-8">
          <nav aria-label={t('breadcrumbAria')} className="text-[12px] mb-5 flex items-center gap-1 text-stone">
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">{tcommon('home')}</Link></li>
              <li aria-hidden="true" className="opacity-60"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
              <li aria-current="page" className="text-sage-deep">{t('heroTitle')}</li>
            </ol>
          </nav>
          <h1 className="text-[32px] md:text-5xl text-charcoal font-semibold tracking-tight">
            {t('heroTitle')}
          </h1>
          <p className="text-[14px] text-stone mt-3 leading-relaxed max-w-2xl">
            {t('heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Best Lists Grid */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-10 md:mt-14">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {categoryData.map((cat) => (
            <Link
              key={cat.key}
              href={`/best/${cat.key}`}
              className="group bg-linen rounded-2xl overflow-hidden hover:bg-linen-hover active:scale-[0.98] transition-all text-start block"
            >
              {/* Image */}
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={cat.imageUrl}
                  alt={tcat(cat.key)}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

                {/* Verdict badge */}
                {cat.top?.verdict?.overallScore && (
                  <div className="absolute top-2 right-2">
                    <VerdictPill
                      variant={getVerdictVariant(cat.top.verdict.type)}
                      score={cat.top.verdict.overallScore}
                    />
                  </div>
                )}

                {/* Icon pill */}
                <div className="absolute bottom-2 left-2 w-9 h-9 rounded-full grid place-items-center shadow-sm backdrop-blur-sm bg-white/70">
                  <i className={`ti ${cat.icon} text-sage text-[18px]`} aria-hidden="true"></i>
                </div>
              </div>

              {/* Card footer */}
              <div className="p-4">
                <div className="text-[14px] text-charcoal font-semibold leading-tight">
                  {tcat(cat.key)}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[12px] text-stone">
                    {thome('productCount', { count: cat.count })}
                  </span>
                  {cat.top?.prices[0] && (
                    <span className="text-[12px] text-charcoal font-medium">
                      <SarPrice amount={Number(cat.top.prices[0].price)} />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Methodology callout */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-14 md:mt-20 mb-16">
        <div className="bg-linen rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start gap-6">
          <div className="w-12 h-12 rounded-full bg-cream grid place-items-center shrink-0">
            <i className="ti ti-scale text-sage text-[22px]"></i>
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] text-charcoal font-semibold mb-2">{t('ourMethodology')}</h2>
            <p className="text-[13px] text-stone leading-[1.8]">{t('ourMethodologyDesc')}</p>
          </div>
          <Link
            href="/about"
            className="shrink-0 inline-flex items-center gap-2 bg-sage text-cream rounded-lg px-5 py-2.5 text-[13px] font-medium hover:bg-sage-hover transition-colors"
          >
            {t('howWeReviewLink')}
            <i className="ti ti-arrow-right text-[16px] flip-x"></i>
          </Link>
        </div>
      </section>
    </main>
  );
}
