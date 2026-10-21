import { notFound } from 'next/navigation';
import { getProduct } from '@/server/queries';
import { getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';
import { ProductDetailsView } from '@/shared/components/product-details-view';
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params; const product = await getProduct(slug, locale);
  return product ? { title: getLocalizedName(product, locale), alternates: getAlternates(`/products/${slug}`, locale) } : {};
}
export default async function ProductPage({ params }: Props) {
  const {locale,slug}=await params;
  const product=await getProduct(slug,locale);if(!product)notFound();
  return <ProductDetailsView product={product} locale={locale}/>;
}
