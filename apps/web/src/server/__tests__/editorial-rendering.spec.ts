import React from 'react';
import { describe, expect, it, vi } from 'vitest';
vi.stubGlobal('React', React);
import { renderToStaticMarkup } from 'react-dom/server';
import { ContentBody } from '../../shared/components/content-body';
import { JsonLd } from '../../shared/components/json-ld';
describe('stored editorial rendering', () => {
  it('renders Markdown and legacy HTML headings without executable content', () => {
    const html = renderToStaticMarkup(ContentBody({ content: '## Heading\n\n**Strong**\n\n<p>Legacy</p><script>alert(1)</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">unsafe</a>' }));
    expect(html).toContain('<h2>Heading</h2>');
    expect(html).toContain('<strong>Strong</strong>');
    expect(html).toContain('<p>Legacy</p>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });
  it('escapes script termination inside structured data', () => {
    const html = renderToStaticMarkup(JsonLd({ data: { name: '</script><script>alert(1)</script>' } }));
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('\\u003c/script>');
  });
});

describe('fallback content language', () => {
  it('marks Arabic editorial fallback within an English route with Arabic language and direction', async () => {
    const { EditorialContent, OfferContent } = await import('../../shared/components/editorial-content');
    const page = { locale: 'ar', title: 'عنوان عربي', content: 'محتوى عربي', publishedAt: null };
    const article = renderToStaticMarkup(EditorialContent({ page: page as never, requestedLocale: 'en' }));
    expect(article).toContain('<article lang="ar" dir="rtl">');
    const offer = renderToStaticMarkup(OfferContent({ offer: { ...page, body: page.content } }));
    expect(offer).toContain('lang="ar" dir="rtl"');
    expect(offer).toContain('عنوان عربي');
  });
  it('marks a fallback product name using its actual translation locale', async () => {
    const { ProductName } = await import('../../shared/components/product-name');
    const product = { name: 'Legacy name', translations: [{ locale: 'ar', name: 'منتج عربي', description: null, slug: 'arabic' }] };
    const html = renderToStaticMarkup(ProductName({ product: product as never, locale: 'en' }));
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('منتج عربي');
  });
});
