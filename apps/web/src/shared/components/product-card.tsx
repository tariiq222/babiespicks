import { Link } from '../../i18n/navigation';
import { ProductImage } from './product-image';
import { SarPrice } from './sar-price';
import { StoreLink } from './store-link';
import { getLocalizedName, getVerdictVariant, type Product } from '../lib/api';
import { getBestPrice, getDiscount, getShopperRating } from '../lib/catalog-filters';
import { getVerdictLabel } from '../lib/product-details';
import { Tag } from './tags';
import { VERDICT_CLASS, VERDICT_ICON } from './verdict-pill';

export function ProductCard({ product, locale, priority = false, placement = 'grid' }: { product: Product; locale: string; priority?: boolean; placement?: string }) {
  const ar = locale === 'ar';
  const price = getBestPrice(product); if (!price) return null;
  const name = getLocalizedName(product, locale); const discount = getDiscount(price); const store = price.store?.name;
  const review = getShopperRating(product);
  return <article className="group relative flex min-w-0 flex-col rounded-2xl bg-white p-2.5 hairline transition-colors hover:border-sage sm:p-3">
    <div className="relative">
      <ProductImage src={product.imageUrl || undefined} alt={name} radius={10} priority={priority} quality={75} sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw" />
      {discount > 0 && <span className="absolute start-2 top-2"><Tag tone="deal" icon="ti-discount"><bdi dir="ltr">−{discount}%</bdi></Tag></span>}
    </div>
    <div className="flex flex-1 flex-col px-0.5 pt-3">
      {product.brand && <p className="truncate text-xs text-stone" dir="auto">{product.brand}</p>}
      <h3 className="mt-0.5 line-clamp-2 text-sm leading-6"><Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:rounded-2xl group-hover:text-sage-deep">{name}</Link></h3>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {product.verdict && <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium leading-4 ${VERDICT_CLASS[getVerdictVariant(product.verdict.type)]}`}><i aria-hidden="true" className={`ti ${VERDICT_ICON[getVerdictVariant(product.verdict.type)]} text-sm leading-none`} />{getVerdictLabel(product.verdict.type, locale)}</span>}
        {review && <span aria-label={ar ? `تقييم أمازون ${review.averageRating.toFixed(1)} من 5` : `Amazon rating ${review.averageRating.toFixed(1)} of 5`}><Tag tone="rating" icon="ti-star"><bdi dir="ltr" className="tabular-nums">{review.averageRating.toFixed(1)}</bdi></Tag></span>}
      </div>
      <div className="mt-auto pt-3">
        <p className="flex flex-wrap items-baseline gap-x-2"><SarPrice amount={price.price} className="text-lg font-semibold" />{discount > 0 && <s className="text-xs text-stone"><SarPrice amount={price.originalPrice as number} /></s>}</p>
        {store && <p className="mt-1.5 flex"><Tag tone="info" icon="ti-building-store">{store}</Tag></p>}
        <StoreLink product={product} price={price} locale={locale} placement={placement} label={ar ? `عرض ${name} في ${store ?? 'المتجر'}` : `View ${name} at ${store ?? 'the store'}`} className="relative z-10 mt-2.5 flex min-h-11 items-center justify-center gap-1 rounded-lg bg-sage-deep px-2 text-sm text-cream transition-colors hover:bg-charcoal">{ar ? 'عرض في المتجر' : 'View at store'}<i aria-hidden="true" className="ti ti-external-link text-base" /></StoreLink>
      </div>
    </div>
  </article>;
}
