'use client';

import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface ProductSelectorProps {
  products: { slug: string; name: string }[];
  locale: string;
  labels: {
    productA: string;
    productB: string;
    chooseProduct: string;
    compareButton: string;
  };
}

export function ProductSelectorClient({ products, locale, labels }: ProductSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [a, setA] = useState(searchParams.get('a') || '');
  const [b, setB] = useState('');

  useEffect(() => {
    const paramA = searchParams.get('a');
    if (paramA) setA(paramA);
  }, [searchParams]);

  const handleCompare = () => {
    if (a && b && a !== b) {
      router.push(`/${locale}/compare/${a}/vs/${b}`);
    }
  };

  return (
    <div>
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
        {/* Product A */}
        <div>
          <label htmlFor="product-a" className="block text-[13px] text-stone mb-2">{labels.productA}</label>
          <select
            id="product-a"
            value={a}
            onChange={(e) => setA(e.target.value)}
            className="w-full bg-white border border-beige rounded-lg px-4 py-3 text-[14px] text-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sage"
          >
            <option value="">{labels.chooseProduct}</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="text-center text-[22px] text-stone pb-3">vs</div>

        {/* Product B */}
        <div>
          <label htmlFor="product-b" className="block text-[13px] text-stone mb-2">{labels.productB}</label>
          <select
            id="product-b"
            value={b}
            onChange={(e) => setB(e.target.value)}
            className="w-full bg-white border border-beige rounded-lg px-4 py-3 text-[14px] text-charcoal appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-sage"
          >
            <option value="">{labels.chooseProduct}</option>
            {products.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={handleCompare}
          disabled={!a || !b || a === b}
          className="w-full bg-sage text-cream rounded-lg px-6 py-[14px] text-[15px] inline-flex items-center justify-center gap-2 hover:bg-sage-hover active:bg-sage-active transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {labels.compareButton}
          <i className="ti ti-arrows-shuffle text-[16px]"></i>
        </button>
      </div>
    </div>
  );
}