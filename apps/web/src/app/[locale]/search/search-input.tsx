'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

export function SearchInput({ defaultValue = '' }: { defaultValue?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const router = useRouter();
  const pathname = usePathname();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      const locale = pathname.split('/')[1] || 'ar';
      router.push(`/${locale}/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-linen hairline rounded-full flex items-center gap-3 px-5 py-3">
      <i className="ti ti-search text-stone text-[18px]"></i>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="bg-transparent flex-1 text-[14px] outline-none text-right placeholder:text-stone/70"
        placeholder="ابحثي عن منتج..."
        aria-label="ابحثي عن منتج"
        autoFocus
      />
      <button type="submit" className="bg-sage text-cream rounded-full px-5 py-[7px] text-[12px] hover:bg-sage-hover">
        ابحثي
      </button>
    </form>
  );
}
