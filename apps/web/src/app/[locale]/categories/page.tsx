import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getProductsByCategory, getVerdictVariant } from '@/shared/lib/api';
import { JsonLd } from '@/shared/components/json-ld';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { SarPrice } from '@/shared/components/sar-price';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

// Inline SVG artwork per category — no external images needed
function FormulaArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Milk powder tin */}
      <rect x="30" y="20" width="60" height="55" rx="6" fill="#F5F0E8" stroke="#C4836A" strokeWidth="1.5"/>
      <rect x="35" y="28" width="50" height="20" rx="3" fill="#E8EFE9"/>
      {/* Label stripes */}
      <rect x="35" y="52" width="50" height="3" rx="1.5" fill="#87A878" opacity="0.6"/>
      <rect x="35" y="58" width="35" height="3" rx="1.5" fill="#C4836A" opacity="0.5"/>
      {/* Tin lid */}
      <rect x="30" y="14" width="60" height="8" rx="3" fill="#D4A08A" stroke="#C4836A" strokeWidth="1.5"/>
      {/* Baby bottle next to tin */}
      <rect x="76" y="32" width="16" height="30" rx="4" fill="#FAF8F5" stroke="#87A878" strokeWidth="1.2"/>
      <rect x="78" y="24" width="12" height="10" rx="3" fill="#E8EFE9" stroke="#87A878" strokeWidth="1.2"/>
      {/* Nipple */}
      <ellipse cx="84" cy="24" rx="4" ry="3" fill="#D4A08A"/>
      {/* Measurement lines on bottle */}
      <line x1="86" y1="38" x2="90" y2="38" stroke="#87A878" strokeWidth="1" opacity="0.5"/>
      <line x1="86" y1="44" x2="90" y2="44" stroke="#87A878" strokeWidth="1" opacity="0.5"/>
      <line x1="86" y1="50" x2="90" y2="50" stroke="#87A878" strokeWidth="1" opacity="0.5"/>
    </svg>
  );
}

function DiapersArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Folded diaper main body */}
      <path d="M22 30 C22 24 28 20 36 20 L84 20 C92 20 98 24 98 30 L98 65 C98 71 92 75 84 75 L36 75 C28 75 22 71 22 65 Z" fill="#FAF8F5" stroke="#9B8BB4" strokeWidth="1.5"/>
      {/* Diaper inner padding indication */}
      <path d="M28 28 C28 24 33 22 38 22 L82 22 C87 22 92 24 92 28 L92 60 C92 64 87 66 82 66 L38 66 C33 66 28 64 28 60 Z" fill="#EAF0EE"/>
      {/* Wetness indicator line */}
      <line x1="60" y1="26" x2="60" y2="62" stroke="#9B8BB4" strokeWidth="0.8" opacity="0.3"/>
      {/* Tab fasteners */}
      <circle cx="26" cy="35" r="5" fill="#D4A08A" stroke="#C4836A" strokeWidth="1"/>
      <circle cx="94" cy="35" r="5" fill="#D4A08A" stroke="#C4836A" strokeWidth="1"/>
      {/* Soft drop icons */}
      <path d="M45 42 C45 42 42 48 45 52 C48 48 45 42 45 42 Z" fill="#9B8BB4" opacity="0.4"/>
      <path d="M60 48 C60 48 57 54 60 58 C63 54 60 48 60 48 Z" fill="#9B8BB4" opacity="0.3"/>
      <path d="M75 40 C75 40 72 46 75 50 C78 46 75 40 75 40 Z" fill="#9B8BB4" opacity="0.35"/>
    </svg>
  );
}

function CarseatsArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Car seat body */}
      <path d="M30 70 L25 40 C22 30 28 22 40 20 L85 18 C95 17 102 24 100 35 L95 70 Z" fill="#E5EBE7" stroke="#87A878" strokeWidth="1.5"/>
      {/* Seat surface */}
      <path d="M32 68 L28 42 C26 34 31 27 41 25 L83 23 C91 22 97 28 95 37 L91 68 Z" fill="#FAF8F5"/>
      {/* Handle */}
      <path d="M22 30 C15 28 14 22 20 20 C26 18 28 22 25 30" stroke="#87A878" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Harness straps */}
      <line x1="50" y1="25" x2="48" y2="65" stroke="#C4836A" strokeWidth="2" strokeLinecap="round"/>
      <line x1="70" y1="24" x2="72" y2="65" stroke="#C4836A" strokeWidth="2" strokeLinecap="round"/>
      {/* Buckle */}
      <rect x="54" y="45" width="12" height="8" rx="2" fill="#D4A08A" stroke="#C4836A" strokeWidth="1"/>
      {/* Base */}
      <rect x="28" y="68" width="65" height="8" rx="3" fill="#C4836A" opacity="0.7"/>
    </svg>
  );
}

function BottlesArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Large bottle */}
      <rect x="18" y="28" width="28" height="48" rx="6" fill="#FAF8F5" stroke="#87A878" strokeWidth="1.5"/>
      <rect x="22" y="18" width="20" height="12" rx="4" fill="#E8EFE9" stroke="#87A878" strokeWidth="1.2"/>
      <ellipse cx="32" cy="18" rx="6" ry="4" fill="#D4A08A"/>
      {/* Measurement lines */}
      <line x1="22" y1="36" x2="28" y2="36" stroke="#87A878" strokeWidth="1" opacity="0.6"/>
      <line x1="22" y1="44" x2="28" y2="44" stroke="#87A878" strokeWidth="1" opacity="0.6"/>
      <line x1="22" y1="52" x2="28" y2="52" stroke="#87A878" strokeWidth="1" opacity="0.6"/>
      {/* Liquid level in large bottle */}
      <rect x="19" y="60" width="26" height="14" rx="0" fill="#9B8BB4" opacity="0.2"/>

      {/* Medium bottle */}
      <rect x="52" y="34" width="22" height="38" rx="5" fill="#F5F0E8" stroke="#C4836A" strokeWidth="1.5"/>
      <rect x="55" y="25" width="16" height="10" rx="3" fill="#E8EFE9" stroke="#C4836A" strokeWidth="1.2"/>
      <ellipse cx="63" cy="25" rx="5" ry="3.5" fill="#D4A08A"/>

      {/* Small bottle */}
      <rect x="80" y="40" width="18" height="30" rx="4" fill="#FAF8F5" stroke="#9B8BB4" strokeWidth="1.5"/>
      <rect x="82" y="33" width="14" height="8" rx="3" fill="#E8EFE9" stroke="#9B8BB4" strokeWidth="1.2"/>
      <ellipse cx="89" cy="33" rx="4" ry="3" fill="#D4A08A"/>

      {/* Decorative drops */}
      <circle cx="50" cy="55" r="3" fill="#87A878" opacity="0.3"/>
      <circle cx="77" cy="50" r="2.5" fill="#C4836A" opacity="0.3"/>
    </svg>
  );
}

function ToysArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Building block 1 */}
      <rect x="18" y="48" width="32" height="28" rx="3" fill="#C4836A" opacity="0.85"/>
      <rect x="18" y="42" width="32" height="10" rx="3" fill="#D4A08A"/>
      {/* Block 1 stud */}
      <circle cx="34" cy="42" r="5" fill="#C4836A"/>
      {/* Building block 2 */}
      <rect x="38" y="30" width="32" height="28" rx="3" fill="#87A878" opacity="0.85"/>
      <rect x="38" y="24" width="32" height="10" rx="3" fill="#A8C49A"/>
      {/* Block 2 stud */}
      <circle cx="54" cy="24" r="5" fill="#87A878"/>
      {/* Building block 3 */}
      <rect x="58" y="50" width="28" height="24" rx="3" fill="#9B8BB4" opacity="0.85"/>
      <rect x="58" y="44" width="28" height="10" rx="3" fill="#B5A5C8"/>
      {/* Block 3 stud */}
      <circle cx="72" cy="44" r="5" fill="#9B8BB4"/>
      {/* Puzzle piece */}
      <path d="M85 22 L95 22 C97 22 99 24 99 26 C99 28 97 28 97 30 L97 34 C97 36 99 36 99 38 C99 40 97 42 95 42 L85 42 C83 42 81 40 81 38 C81 36 83 36 83 34 L83 30 C83 28 81 28 81 26 C81 24 83 22 85 22 Z" fill="#FAF8F5" stroke="#87A878" strokeWidth="1.2"/>
    </svg>
  );
}

function CareArt() {
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full" aria-hidden="true">
      {/* Shampoo/soap bottle */}
      <rect x="22" y="35" width="24" height="42" rx="6" fill="#E8EFE9" stroke="#87A878" strokeWidth="1.5"/>
      <rect x="28" y="26" width="12" height="12" rx="3" fill="#D4A08A" stroke="#C4836A" strokeWidth="1"/>
      {/* Pump top */}
      <rect x="31" y="20" width="6" height="8" rx="2" fill="#C4836A"/>
      <rect x="29" y="17" width="10" height="4" rx="1" fill="#C4836A"/>
      {/* Label on bottle */}
      <rect x="26" y="50" width="16" height="18" rx="2" fill="#FAF8F5" opacity="0.8"/>

      {/* Lotion tube */}
      <path d="M55 77 L55 42 C55 38 58 35 63 35 L75 35 C80 35 83 38 83 42 L83 77 Z" fill="#FAF8F5" stroke="#C4836A" strokeWidth="1.5"/>
      <path d="M55 42 C55 38 58 35 63 35 L75 35 C80 35 83 38 83 42" stroke="#C4836A" strokeWidth="1.2"/>
      {/* Cap */}
      <rect x="62" y="30" width="14" height="8" rx="3" fill="#D4A08A" stroke="#C4836A" strokeWidth="1"/>

      {/* Soft towel/washcloth */}
      <path d="M88 55 C88 45 95 38 106 40 C117 42 118 55 114 65 C110 75 96 78 90 72 C84 66 88 55 88 55 Z" fill="#EAF0EE" stroke="#9B8BB4" strokeWidth="1.2"/>
      {/* Towel fold lines */}
      <path d="M94 50 C100 48 108 50 110 55" stroke="#9B8BB4" strokeWidth="0.8" opacity="0.5"/>
      <path d="M92 58 C98 56 106 58 108 62" stroke="#9B8BB4" strokeWidth="0.8" opacity="0.4"/>

      {/* Decorative drop */}
      <path d="M100 28 C100 28 97 34 100 38 C103 34 100 28 100 28 Z" fill="#9B8BB4" opacity="0.4"/>
    </svg>
  );
}

function CategoryArt({ category }: { category: string }) {
  switch (category) {
    case 'formula': return <FormulaArt />;
    case 'diapers': return <DiapersArt />;
    case 'carseats': return <CarseatsArt />;
    case 'bottles': return <BottlesArt />;
    case 'toys': return <ToysArt />;
    case 'care': return <CareArt />;
    default: return <FormulaArt />;
  }
}

const CATEGORIES = [
  { key: 'formula', icon: 'ti-bottle', tint: '#E8EFE9' },
  { key: 'diapers', icon: 'ti-droplet', tint: '#EAF0EE' },
  { key: 'carseats', icon: 'ti-car', tint: '#E5EBE7' },
  { key: 'bottles', icon: 'ti-baby-bottle', tint: '#ECF2EE' },
  { key: 'toys', icon: 'ti-puzzle', tint: '#EBEFE6' },
  { key: 'care', icon: 'ti-mug', tint: '#E8EEEA' },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('common');
  return {
    title: t('categories'),
    alternates: getAlternates('/categories', locale),
  };
}

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('common');
  const tcat = await getTranslations('categories');
  const thome = await getTranslations('home');

  // Fetch all category product lists in parallel
  const categoryProductsLists = await Promise.all(
    CATEGORIES.map((cat) => getProductsByCategory(cat.key, locale))
  );

  // Build card data from category-specific product arrays
  const categoryData = CATEGORIES.map((cat, i) => {
    const catProducts = categoryProductsLists[i] ?? [];
    const featured = catProducts[0] ?? null;
    return { ...cat, count: catProducts.length, featured };
  });

  return (
    <main>
      {/* Hero */}
      <section style={{ background: 'linear-gradient(160deg, #E8EFE9 0%, #F0EDE6 40%, #FAF8F5 100%)' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-16 pb-8">
          <nav aria-label={t('breadcrumbLabel')} className="text-[12px] mb-5 flex items-center gap-1 text-stone">
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">{t('home')}</Link></li>
              <li aria-hidden="true" className="opacity-60"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
              <li aria-current="page" className="text-sage-deep">{t('categories')}</li>
            </ol>
          </nav>
          <h1 className="text-[32px] md:text-[40px] text-charcoal font-semibold tracking-tight">
            {t('categories')}
          </h1>
          <p className="text-[14px] text-stone mt-2 leading-relaxed">
            {thome('browseByCategory')}
          </p>
        </div>
      </section>

      {/* JSON-LD */}
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: t('categories'),
            description: thome('heroSubtitle'),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: t('home'),
                item: BASE_URL,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: t('categories'),
                item: `${BASE_URL}/${locale}/categories`,
              },
            ],
          },
        ]}
      />

      {/* Category Grid */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8 md:mt-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {categoryData.map((cat) => (
            <Link
              key={cat.key}
              href={`/categories/${cat.key}`}
              className="group bg-linen rounded-2xl overflow-hidden hover:bg-linen-hover active:scale-[0.98] transition-all text-start block"
            >
              {/* Image area */}
              <div
                className="relative aspect-[4/3] overflow-hidden grid place-items-center"
                style={{ background: cat.tint }}
              >
                <div className="w-full h-full p-3 transition-transform duration-300 group-hover:scale-105">
                  <CategoryArt category={cat.key} />
                </div>

                {/* Verdict badge */}
                {cat.featured?.verdict?.overallScore && (
                  <div className="absolute top-2 right-2">
                    <VerdictPill
                      variant={getVerdictVariant(cat.featured.verdict.type)}
                      score={cat.featured.verdict.overallScore}
                    />
                  </div>
                )}

                {/* Icon pill */}
                <div
                  className="absolute bottom-2 left-2 w-9 h-9 rounded-full grid place-items-center shadow-sm backdrop-blur-sm bg-white/70"
                >
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
                  {cat.featured?.prices[0] && (
                    <span className="text-[12px] text-charcoal font-medium">
                      <SarPrice amount={Number(cat.featured.prices[0].price)} />
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
