import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getProductsByCategory, getRelatedContentForCategory, type Product } from '@/shared/lib/api';
import { CategoryProducts } from './category-client';
import { JsonLd } from '@/shared/components/json-ld';
import { RelatedContent } from '@/shared/components/related-content';
import { getAlternates } from '@/shared/lib/metadata';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://babiespicks.com';

export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const products = await getProductsByCategory(slug, locale);
  const relatedBestLists = await getRelatedContentForCategory(slug, locale);
  const t = await getTranslations('category');
  const tc = await getTranslations('common');

  // Category info from first product (or slug)
  const categoryName = products[0]?.category?.name || slug;

  return (
    <main>
      {/* Hero section with category name */}
      <section style={{ background: 'var(--color-hero-start)', borderBottom: '0.5px solid var(--color-cat-hero-border)' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-10 md:py-16">
          <nav aria-label={tc('breadcrumbLabel')} className="text-[12px] mb-4 flex items-center gap-1" style={{ color: 'var(--color-cat-hero-text)' }}>
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">{tc('home')}</Link></li>
              <li aria-hidden="true" className="opacity-60">←</li>
              <li><Link href="/categories" className="hover:text-sage-deep">{tc('categories')}</Link></li>
              <li aria-hidden="true" className="opacity-60">←</li>
              <li aria-current="page" className="text-sage-deep">{categoryName}</li>
            </ol>
          </nav>
          <JsonLd
            data={[
              {
                '@context': 'https://schema.org',
                '@type': 'CollectionPage',
                name: categoryName,
                description: t('metaDescription', { name: categoryName }),
              },
              {
                '@context': 'https://schema.org',
                '@type': 'BreadcrumbList',
                itemListElement: [
                  {
                    '@type': 'ListItem',
                    position: 1,
                    name: tc('home'),
                    item: BASE_URL,
                  },
                  {
                    '@type': 'ListItem',
                    position: 2,
                    name: tc('categories'),
                    item: `${BASE_URL}/${locale}/categories`,
                  },
                  {
                    '@type': 'ListItem',
                    position: 3,
                    name: categoryName,
                    item: `${BASE_URL}/${locale}/categories/${slug}`,
                  },
                ],
              },
            ]}
          />
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-cream grid place-items-center shrink-0">
              <i className="ti ti-bottle text-sage text-[28px] md:text-[32px]"></i>
            </div>
            <div>
              <h1 className="text-[28px] md:text-[40px] leading-[1.3] text-sage-deep">{categoryName}</h1>
              <p className="text-[13px] md:text-[14px] mt-1" style={{ color: 'var(--color-cat-hero-text)' }}>
                {t('analyzedProducts', { count: products.length })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8">
        <CategoryProducts products={products} locale={locale} />
      </div>

      {/* RELATED BEST LISTS */}
      {relatedBestLists.length > 0 && (
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
          <RelatedContent
            items={relatedBestLists.map((bl) => ({
              title: bl.title,
              href: `/best/${bl.slug}`,
              type: 'best-list' as const,
              image: bl.imageUrl ?? undefined,
            }))}
          />
        </div>
      )}
    </main>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<import('next').Metadata> {
  const { locale, slug } = await params;
  const products = await getProductsByCategory(slug, locale);
  const categoryName = products[0]?.category?.name || slug;
  const t = await getTranslations('category');
  return {
    title: categoryName,
    description: t('metaDescription', { name: categoryName }),
    alternates: getAlternates(`/categories/${slug}`, locale),
  };
}
