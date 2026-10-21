import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '../../i18n/navigation';
import { getVerdictVariant, type Product } from '../lib/api';
import { ProductName } from './product-name';
import { ProductImage } from './product-image';
import { SarPrice } from './sar-price';
import { VerdictPill, VERDICT_CLASS } from './verdict-pill';
import { CatalogEmptyState } from './catalog-empty-state';

export function HomeProductGrid({ products, locale }: { products: Product[]; locale: string }) {
  const t = useTranslations('home');
  const tc = useTranslations('common');
  return <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16">
    <h2 className="text-xl text-charcoal mb-4">{t('storefrontTitle')}</h2>
    <p className="text-[13px] text-stone mb-5">{t('storefrontSubtitle', { count: products.length })}</p>
    {products.length === 0 && <CatalogEmptyState locale={locale} />}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
      {products.map((p) => <Link key={p.id} href={`/products/${p.slug}`} className="group bg-cream hairline rounded-xl p-3 md:p-4 text-start hover:bg-cream-hover transition-all">
        <div className="relative overflow-hidden rounded-lg bg-linen">
          <ProductImage src={p.imageUrl || undefined} width={999} height={120} radius={8} />
          {p.verdict && <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] ${VERDICT_CLASS[getVerdictVariant(p.verdict.type)]}`}>{p.verdict.overallScore}/10</span>}
        </div>
        <h3 className="text-[13px] text-charcoal mt-3 leading-tight min-h-[32px]"><ProductName product={p} locale={locale} /></h3>
        <div className="flex items-center justify-between mt-3 gap-2">
          <VerdictPill variant={getVerdictVariant(p.verdict?.type)} score={p.verdict?.overallScore} label={p.verdict ? tc(`verdict.${p.verdict.type}`) : tc('notRated')} />
          {p.prices[0] && <SarPrice amount={p.prices[0].price} className="text-[12px] text-charcoal" />}
        </div>
      </Link>)}
    </div>
  </section>;
}
