import Link from 'next/link';
import { searchProducts, getVerdictVariant, getLocalizedName } from '@/shared/lib/api';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SearchInput } from './search-input';

export const metadata = {
  title: 'بحث',
  description: 'ابحثي عن أي منتج لطفلكِ في BabiesPicks',
};

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const result = q ? await searchProducts(q, locale) : null;

  return (
    <main className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-8 md:pt-12 pb-16">
      <h1 className="text-[24px] md:text-[32px] text-charcoal mb-6">بحث</h1>

      {/* Search input */}
      <SearchInput defaultValue={q || ''} />

      {/* Results */}
      {result && (
        <div className="mt-8">
          <p className="text-[13px] text-stone mb-5">
            {result.total > 0
              ? `${result.total} نتيجة لـ "${result.query}"`
              : `لا توجد نتائج لـ "${result.query}"`}
          </p>

          {result.total === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-linen mx-auto grid place-items-center mb-4">
                <i className="ti ti-search-off text-sage text-[28px]"></i>
              </div>
              <p className="text-[14px] text-stone">جربي كلمات مختلفة أو تصفحي <Link href="/categories" className="text-sage hover:underline">الفئات</Link></p>
            </div>
          )}

          <div className="space-y-3">
            {result.data.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.slug}`}
                className="flex items-center gap-4 bg-cream hairline rounded-xl p-4 hover:bg-cream-hover transition-colors"
              >
                <ProductImage width={70} height={70} src={p.imageUrl || undefined} alt={getLocalizedName(p, locale)} radius={8} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] text-charcoal leading-tight line-clamp-1">{getLocalizedName(p, locale)}</div>
                  <div className="text-[12px] text-stone mt-1">{p.category?.name} {p.brand ? `· ${p.brand}` : ''}</div>
                  <div className="flex items-center gap-3 mt-2">
                    <VerdictPill variant={getVerdictVariant(p.verdict?.type)} score={p.verdict?.overallScore} />
                    {p.prices[0] && <SarPrice amount={Number(p.prices[0].price)} className="text-[12px] text-charcoal" />}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!result && (
        <p className="text-[14px] text-stone mt-8">ابحثي عن اسم المنتج، العلامة التجارية، أو الفئة</p>
      )}
    </main>
  );
}
