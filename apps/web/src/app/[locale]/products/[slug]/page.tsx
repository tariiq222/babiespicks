import { notFound } from 'next/navigation';
import { getProduct } from '@/server/queries';
import { getLocalizedName, getLocalizedDesc } from '@/shared/lib/api';
import { Link } from '@/i18n/navigation';
import { ProductImage } from '@/shared/components/product-image';
import { SarPrice } from '@/shared/components/sar-price';
import { JsonLd } from '@/shared/components/json-ld';
import { getAlternates } from '@/shared/lib/metadata';
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params; const product = await getProduct(slug, locale);
  return product ? { title: getLocalizedName(product, locale), alternates: getAlternates(`/products/${slug}`, locale) } : {};
}
export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params; const ar = locale === 'ar';
  const product = await getProduct(slug, locale); if (!product) notFound();
  const name = getLocalizedName(product, locale); const description = getLocalizedDesc(product, locale);
  const prices = [...product.prices].sort((a, b) => a.price - b.price);
  const specs = product.specs.filter(s => s.locale === locale);
  return <main className="max-w-5xl mx-auto px-5 py-10">
    <Link href="/" className="text-sage-deep underline text-sm">{ar ? 'كل العروض' : 'All offers'}</Link>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
      <div className="min-w-0"><ProductImage src={product.imageUrl || undefined} width={600} height={350} alt={name} /></div>
      <div className="min-w-0"><h1 className="text-2xl md:text-3xl leading-relaxed">{name}</h1>{product.brand && <p className="text-stone mt-3">{product.brand}</p>}
        {description && <p className="mt-5 leading-8">{description}</p>}
        <h2 className="text-xl mt-8 mb-4">{ar ? 'الأسعار المتاحة' : 'Available prices'}</h2>
        {prices.length === 0 ? <p role="status" className="text-stone">{ar ? 'لا يتوفر سعر حديث لهذا المنتج حاليًا.' : 'No recent price is available for this product.'}</p> : <div className="space-y-3">{prices.map(price => <a key={price.storeId} href={`/go/${product.id}/${price.storeId}`} target="_blank" rel="sponsored noopener noreferrer" className="flex flex-wrap gap-3 items-center hairline rounded-xl p-4 hover:bg-linen">
          <span>{price.store?.name || (ar ? 'المتجر' : 'Store')}</span><SarPrice amount={price.price} className="ms-auto" /><span className="text-sage-deep text-sm">{ar ? 'إلى المتجر' : 'Visit store'} ↗</span>
        </a>)}</div>}
        <p className="text-xs text-stone mt-4 leading-6">{ar ? 'قد يتغير السعر والتوفر. تأكدي من السعر والشحن في المتجر قبل الشراء. قد نحصل على عمولة دون تكلفة إضافية عليك.' : 'Price and availability may change. Check the price and shipping at the store before buying. We may earn a commission at no extra cost to you.'}</p>
      </div>
    </div>
    {specs.length > 0 && <section className="mt-10"><h2 className="text-xl mb-4">{ar ? 'معلومات المنتج' : 'Product information'}</h2><dl className="space-y-2">{specs.map((spec, i) => <div key={i} className="flex flex-wrap gap-3 hairline-b py-2"><dt className="text-stone">{spec.key}</dt><dd>{spec.value}</dd></div>)}</dl></section>}
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Product', name, image: product.imageUrl || undefined, offers: prices.map(price => ({ '@type': 'Offer', price: price.price, priceCurrency: 'SAR', url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com'}/go/${product.id}/${price.storeId}` })) }} />
  </main>;
}
