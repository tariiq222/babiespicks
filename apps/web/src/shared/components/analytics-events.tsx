'use client';
import { useEffect } from 'react';
import { trackEvent } from '../lib/analytics';

/** One delegated listener, so server-rendered store links stay server components. */
export function AnalyticsEvents() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[data-store-link]');
      if (!link) return;
      const { productId, storeName, price, placement } = link.dataset;
      trackEvent('affiliate_click', { product_id: productId, store_name: storeName, value: price ? Number(price) : undefined, currency: 'SAR', placement });
    };
    document.addEventListener('click', onClick);
    document.addEventListener('auxclick', onClick);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('auxclick', onClick); };
  }, []);
  return null;
}
