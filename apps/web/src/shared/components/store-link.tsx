import type { Product } from '../lib/api';

/**
 * The purchase link carries the explicit destination when one is chosen
 * (Task 7 contract: shipTo is required for the offer route and recorded with
 * the click). It never carries a free return URL or a locale-derived
 * destination, and clearing the context removes the parameter rather than
 * sending a stale choice.
 */
export function StoreLink({ product, price, locale, placement, className, label, children, shipTo }: { product: Product; price: Product['prices'][number]; locale: string; placement: string; className?: string; label: string; children: React.ReactNode; shipTo?: 'SA' | 'US' | null }) {
  const params = new URLSearchParams({ locale });
  if (shipTo) params.set('shipTo', shipTo);
  return <a href={`/go/${product.id}/${price.storeId}?${params.toString()}`} target="_blank" rel="sponsored noopener noreferrer" aria-label={label} data-store-link data-product-id={product.id} data-store-name={price.store?.name} data-price={price.price} data-currency={price.currency} data-ship-to={shipTo ?? ''} data-placement={placement} className={className}>{children}</a>;
}
