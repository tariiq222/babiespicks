import { Link } from '../../i18n/navigation';
import { ProductCard } from './product-card';
import { ProductImage } from './product-image';
import type { Product, ContentPage } from '../lib/api';

export function OfferGrid({ offers, products, locale, filtered = false, columns = 4 }: { offers: ContentPage[]; products: Product[]; locale: string; filtered?: boolean; columns?: 3 | 4 }) {
  const ar = locale === 'ar';
  return <div className="space-y-10">
    {offers.length === 0 && products.length === 0 && <div role="status" className="bg-linen hairline rounded-2xl px-6 py-12 text-center">
      {filtered ? <>
        <h2 className="text-xl mb-3">{ar ? 'لم نجد نتائج مطابقة' : 'No matching results'}</h2>
        <p className="text-stone">{ar ? 'جربي اسمًا أقصر أو اسم الماركة.' : 'Try a shorter name or the brand.'}</p>
        <Link href="/" className="inline-block mt-5 rounded-lg bg-sage-deep px-5 py-3 text-sm text-cream">{ar ? 'عرض كل المنتجات' : 'Show all products'}</Link>
      </> : <>
        <h2 className="text-xl mb-3">{ar ? 'لا توجد عروض منشورة حاليًا' : 'No published offers right now'}</h2>
        <p className="text-stone">{ar ? 'ستظهر العروض هنا بعد إضافتها ونشرها.' : 'Offers will appear here after they are published.'}</p>
      </>}
    </div>}
    {offers.length > 0 && <section aria-label={ar ? 'العروض المنشورة' : 'Published offers'} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {offers.map(offer => <Link key={offer.id} href={`/offers/${offer.slug}`} className="hairline rounded-2xl p-5 bg-linen hover:bg-linen-hover">
        {offer.imageUrl && <ProductImage src={offer.imageUrl} width={600} height={160} alt="" />}
        <h2 lang={offer.locale} dir={offer.locale === 'ar' ? 'rtl' : 'ltr'} className="text-lg mt-2">{offer.title}</h2>
        {offer.description && <p lang={offer.locale} className="text-sm text-stone mt-3 line-clamp-3">{offer.description}</p>}
        <span className="inline-block text-sm text-sage-deep mt-4">{ar ? 'تفاصيل العرض' : 'View offer'}</span>
      </Link>)}
    </section>}
    {products.length > 0 && <section aria-label={ar ? 'أسعار المنتجات المتاحة' : 'Available product prices'}>
      <h2 className="sr-only">{ar ? 'أسعار المنتجات المتاحة' : 'Available product prices'}</h2>
      <div className={`grid grid-cols-2 gap-3 lg:gap-4 ${columns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>{products.map((product, index) => <ProductCard key={product.id} product={product} locale={locale} priority={index < 4} />)}</div>
    </section>}
  </div>;
}
