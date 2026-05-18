'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';

export function SearchInput({ defaultValue = '' }: { defaultValue?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const router = useRouter();
  const t = useTranslations('search');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
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
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        autoFocus
      />
      <button type="submit" className="bg-sage text-cream rounded-full px-5 py-[7px] text-[12px] hover:bg-sage-hover">
        {t('button')}
      </button>
    </form>
  );
}
