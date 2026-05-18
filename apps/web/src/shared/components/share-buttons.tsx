'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface ShareButtonsProps {
  url: string;
  title: string;
}

export function ShareButtons({ url, title }: ShareButtonsProps) {
  const t = useTranslations('share');
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`;
  const telegramUrl = `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  return (
    <div className="flex items-center gap-3 mt-4">
      <span className="text-[13px] text-stone">{t('label')}</span>
      <div className="flex items-center gap-2">
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="شارك على تويتر"
          className="w-9 h-9 rounded-full bg-linen hover:bg-linen-hover flex items-center justify-center text-stone hover:text-charcoal transition-colors"
        >
          <i className="ti ti-brand-x text-[16px]"></i>
        </a>
        <a
          href={telegramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="شارك على تيليجرام"
          className="w-9 h-9 rounded-full bg-linen hover:bg-linen-hover flex items-center justify-center text-stone hover:text-charcoal transition-colors"
        >
          <i className="ti ti-brand-telegram text-[16px]"></i>
        </a>
        <button
          onClick={handleCopy}
          aria-label="نسخ الرابط"
          className="w-9 h-9 rounded-full bg-linen hover:bg-linen-hover flex items-center justify-center text-stone hover:text-charcoal transition-colors"
        >
          {copied ? (
            <i className="ti ti-check text-[16px] text-sage"></i>
          ) : (
            <i className="ti ti-copy text-[16px]"></i>
          )}
        </button>
      </div>
      {copied && (
        <span className="text-[12px] text-sage">{t('copied')}</span>
      )}
    </div>
  );
}