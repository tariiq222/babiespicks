import type { Product } from '../lib/api';

export function StoreLink({ product, price, locale, placement, className, label, children }: { product: Product; price: Product['prices'][number]; locale: string; placement: string; className?: string; label: string; children: React.ReactNode }) {
  return <a href={`/go/${product.id}/${price.storeId}?locale=${locale}`} target="_blank" rel="sponsored noopener noreferrer" aria-label={label} data-store-link data-product-id={product.id} data-store-name={price.store?.name} data-price={price.price} data-placement={placement} className={className}>{children}</a>;
}
