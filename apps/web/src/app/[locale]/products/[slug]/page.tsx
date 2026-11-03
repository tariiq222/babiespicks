import { notFound } from 'next/navigation';
import { getCatalogPage, getProduct, getProductOffers } from '@/server/queries';
import { getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';
import { getProductImages, getProductMetaDescription } from '@/shared/lib/product-details';
import { ProductDetailsView } from '@/shared/components/product-details-view';
import { resolveShoppingContext } from '@/shared/lib/shopping-context';
import {getSavedShoppingPreferences} from '@/server/shopping-preferences';
type Props = { params: Promise<{ locale: string; slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params; const product = await getProduct(slug, locale);
  if (!product) return {};
  const title = getLocalizedName(product, locale); const description = getProductMetaDescription(product, locale); const images = getProductImages(product).slice(0, 1);
  return { title, description, alternates: getAlternates(`/products/${slug}`, locale), openGraph: { type: 'website', siteName: 'BabiesPicks', title, description, ...(images.length ? { images } : {}) } };
}
export default async function ProductPage({ params, searchParams }: Props) {
  const {locale,slug}=await params;
  const product=await getProduct(slug,locale);if(!product)notFound();
  const context = resolveShoppingContext({ locale: locale === 'en' ? 'en' : 'ar', query: await searchParams, cookie: await getSavedShoppingPreferences() });
  const [offerPage,candidates]=await Promise.all([
    getProductOffers(product.id,context),
    getCatalogPage(context,{category:product.category?.slug,locale},null,{limit:5}),
  ]);
  if(!offerPage.total)notFound();
  const relatedItems=candidates.items.filter(item=>item.product.id!==product.id).slice(0,4);
  return <ProductDetailsView product={offerPage.product??product} offerPage={offerPage} locale={locale} relatedItems={relatedItems} shipTo={context.shipTo} currency={context.displayCurrency}/>;
}
