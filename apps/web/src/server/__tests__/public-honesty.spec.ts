import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.stubGlobal('React', React);
vi.mock('../../i18n/navigation', () => ({ Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement('a', { href, ...props }, children) }));
vi.mock('../../shared/components/product-image', () => ({ ProductImage: () => null }));
import { OfferGrid } from '../../shared/components/offer-grid';
describe('offers-only storefront', () => {
  it.each(['ar', 'en'])('shows an honest empty state without mock offers or signup in %s', locale => {
    const html = renderToStaticMarkup(React.createElement(OfferGrid, { offers: [], products: [], locale }));
    expect(html).toContain('role="status"');
    expect(html).toContain(locale === 'ar' ? 'لا توجد عروض منشورة' : 'No published offers');
    expect(html).not.toMatch(/href=|input|newsletter|telegram|\/tools/);
  });
  it('makes an MCP-published offer discoverable without promising a review or rating', () => {
    const offer = { id: 'o', slug: 'diaper-offer', title: 'Diaper offer', locale: 'en', description: 'Offer conditions' };
    const html = renderToStaticMarkup(React.createElement(OfferGrid, { offers: [offer as never], products: [], locale: 'en' }));
    expect(html).toContain('/offers/diaper-offer'); expect(html).toContain('Offer conditions');
    expect(html).not.toMatch(/\/10|\/compare|\/best|\/tools|newsletter/);
  });
});
