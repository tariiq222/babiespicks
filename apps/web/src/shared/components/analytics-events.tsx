'use client';
import { useEffect } from 'react';
import { trackEvent } from '../lib/analytics';

/**
 * One delegated listener, so server-rendered store links stay server components.
 * Task 8: the original currency (from the link's own data attribute, never
 * assumed SAR), the chosen destination and the offer marketplace are logged as
 * independent values. No address, IP or conversation text is ever sent.
 */
export function AnalyticsEvents() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-store-link]');
      if (!link) return;
      const { productId, storeName, price, currency, shipTo, marketplace, placement } = link.dataset;
      trackEvent('affiliate_click', {
        product_id: productId,
        store_name: storeName,
        value: price ? Number(price) : undefined,
        currency: currency || undefined,
        ship_to: shipTo || undefined,
        marketplace: marketplace || undefined,
        placement,
      });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('auxclick', onClick); };
  }, []);
  return null;
}
