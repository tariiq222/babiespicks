'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { SecondaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import type { Product } from '@/shared/lib/api';
import { getVerdictVariant, getLocalizedName } from '@/shared/lib/api';

const FILTERS = ['جميع المنتجات', 'يستاهل فقط', 'أقل من 100 ر.س'];

export function CategoryProducts({ products, locale }: { products: Product[]; locale: string }) {
  const [filter, setFilter] = useState(0);

  const filtered = products.filter((p) => {
    if (filter === 1) return p.verdict?.type === 'WORTH_IT';
    if (filter === 2) return p.prices[0] && Number(p.prices[0].price) < 100;
    return true;
  });

  return (
    <div>
      {/* Mobile filter pills */}
      <div className="lg:hidden overflow-x-auto no-scrollbar -mx-5 px-5">
        <div className="flex gap-2 w-max">
          {FILTERS.map((f, i) => (
            <button
              key={i}
              onClick={() => setFilter(i)}
              className={`rounded-full px-4 py-[7px] text-[12px] whitespace-nowrap transition-colors ${
                filter === i ? 'bg-charcoal text-cream' : 'bg-linen text-charcoal hairline'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Sort bar */}
      <div className="mt-5 lg:mt-0 flex items-center gap-3">
        <span className="text-[13px] text-stone">{filtered.length} منتج</span>
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5 mt-5">
        {filtered.map((p) => (
          <Link
            key={p.id}
            href={`/products/${p.slug}`}
            className="bg-cream hairline rounded-xl p-3 md:p-4 text-right hover:bg-cream-hover transition-colors"
          >
            <div className="relative">
              <ProductImage width={999} height={120} src={p.imageUrl || undefined} alt={getLocalizedName(p, locale)} radius={6} />
              <div className="absolute top-2 left-2">
                <VerdictPill variant={getVerdictVariant(p.verdict?.type)} score={p.verdict?.overallScore} />
              </div>
            </div>
            <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px]">
              {getLocalizedName(p, locale)}
            </div>
            <div className="text-[13px] text-charcoal mt-2">
              {p.prices[0] && <SarPrice amount={Number(p.prices[0].price)} />}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone text-[14px]">لا توجد منتجات تطابق الفلتر</div>
      )}
    </div>
  );
}
