import { notFound } from 'next/navigation';
import { getAllProducts, getProduct, getProductsByCategory } from '@/server/queries';
import { getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';
import { getProductImages, getProductMetaDescription } from '@/shared/lib/product-details';
import { ProductDetailsView } from '@/shared/components/product-details-view';
type Props = { params: Promise<{ locale: string; slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params; const product = await getProduct(slug, locale);
  if (!product) return {};
  const title = getLocalizedName(product, locale); const description = getProductMetaDescription(product, locale); const images = getProductImages(product).slice(0, 1);
  return { title, description, alternates: getAlternates(`/products/${slug}`, locale), openGraph: { type: 'website', siteName: 'BabiesPicks', title, description, ...(images.length ? { images } : {}) } };
}
export default async function ProductPage({ params }: Props) {
  const {locale,slug}=await params;
  const product=await getProduct(slug,locale);if(!product)notFound();
  const candidates=product.category?await getProductsByCategory(product.category.slug,locale):await getAllProducts(locale);
  const related=candidates.filter(item=>item.id!==product.id&&item.prices.length>0).slice(0,4);
  return <ProductDetailsView product={product} locale={locale} related={related}/>;
}
