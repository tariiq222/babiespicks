import { getAllProducts, getPublishedOffers } from '@/server/queries';
import { OfferGrid } from '@/shared/components/offer-grid';
import { getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return { title: locale === 'ar' ? 'عروض منتجات الأطفال' : 'Baby product offers', alternates: getAlternates('', locale) };
}
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  const ar = locale === 'ar';
  const input = (await searchParams).q;
  const q = typeof input === 'string' ? input.trim().slice(0, 200) : '';
  const [allProducts, allOffers] = await Promise.all([getAllProducts(locale), getPublishedOffers(locale)]);
  const includes = (text: string) => text.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  const products = allProducts.filter(p => p.prices.length > 0 && (!q || includes(getLocalizedName(p, locale)) || includes(p.brand ?? '')));
  const offers = allOffers.filter(o => !q || includes(o.title) || includes(o.description ?? ''));
  return <main className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-10 md:py-16">
    <div className="max-w-2xl mb-10"><h1 className="text-3xl md:text-5xl text-sage-deep leading-relaxed">{ar ? 'عروض منتجات الأطفال' : 'Baby product offers'}</h1>
      <p className="text-stone mt-4 leading-8">{ar ? 'تصفحي العروض المنشورة والأسعار المتاحة. السعر والتوفر النهائيان لدى المتجر وقت الشراء.' : 'Browse published offers and available prices. Final price and availability are confirmed by the store at checkout.'}</p>
      <form action={`/${locale}`} className="flex gap-2 mt-6"><input type="search" name="q" defaultValue={q} maxLength={200} aria-label={ar ? 'ابحثي في العروض' : 'Search offers'} placeholder={ar ? 'اسم المنتج أو العرض' : 'Product or offer name'} className="min-w-0 flex-1 hairline rounded-xl px-4 py-3 bg-cream" /><button className="bg-sage text-cream rounded-xl px-5">{ar ? 'بحث' : 'Search'}</button></form>
      {q && <p className="text-sm text-stone mt-3">{ar ? 'نتائج البحث عن: ' : 'Search results for: '}{q}</p>}
    </div>
    <OfferGrid offers={offers} products={products} locale={locale} />
    <p className="text-xs text-stone mt-10">{ar ? 'قد نحصل على عمولة عند الشراء عبر بعض الروابط، دون تكلفة إضافية عليك.' : 'We may earn a commission from purchases through some links, at no extra cost to you.'}</p>
  </main>;
}
