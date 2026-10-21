import { Link } from '../../i18n/navigation';
import { ProductImage } from './product-image';
import { SarPrice } from './sar-price';
import { getLocalizedName, type Product, type ContentPage } from '../lib/api';

export function OfferGrid({ offers, products, locale }: { offers: ContentPage[]; products: Product[]; locale: string }) {
  const ar = locale === 'ar';
  return <div className="space-y-10">
    {offers.length === 0 && products.length === 0 && <div role="status" className="bg-linen hairline rounded-2xl px-6 py-12 text-center">
      <h2 className="text-xl mb-3">{ar ? 'لا توجد عروض منشورة حاليًا' : 'No published offers right now'}</h2>
      <p className="text-stone">{ar ? 'ستظهر العروض هنا بعد إضافتها ونشرها.' : 'Offers will appear here after they are published.'}</p>
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
      <h2 className="text-xl mb-5">{ar ? 'أسعار المنتجات المتاحة' : 'Available product prices'}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{products.map(product => {
        const price = [...product.prices].sort((a, b) => a.price - b.price)[0];
        if (!price) return null;
        const discount = price.originalPrice && price.originalPrice > price.price ? Math.round((price.originalPrice - price.price) / price.originalPrice * 100) : null;
        return <Link key={product.id} href={`/products/${product.slug}`} className="hairline rounded-2xl p-4 hover:bg-linen">
          <ProductImage src={product.imageUrl || undefined} width={600} height={160} alt={getLocalizedName(product, locale)} />
          <h3 className="mt-4 text-sm">{getLocalizedName(product, locale)}</h3>
          <div className="flex flex-wrap gap-3 items-center mt-3"><SarPrice amount={price.price} />{discount !== null && discount > 0 && <span className="text-sm text-terracotta">−{discount}%</span>}</div>
          <p className="text-xs text-stone mt-2">{price.store?.name}</p>
        </Link>;
      })}</div>
    </section>}
  </div>;
}
