'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

const FAQ_ITEMS = [
  'whatIs',
  'howWeReview',
  'trustworthy',
  'verdictSystem',
  'scores',
  'commission',
  'contactUs',
  'contentUpdate',
  'english',
  'prices',
] as const;

type FaqKey = (typeof FAQ_ITEMS)[number];

export default function FaqPage() {
  const t = useTranslations('faq');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIndex((prev) => (prev === i ? null : i));

  // FAQPage JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((key) => ({
      '@type': 'Question',
      name: t(`items.${key}.q`),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(`items.${key}.a`),
      },
    })),
  };

  return (
    <main className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3]">{t('heroTitle')}</h1>
        <p className="text-[15px] md:text-[16px] text-stone mt-3 leading-[1.8]">{t('heroSubtitle')}</p>
      </div>

      {/* Accordion */}
      <div className="space-y-3">
        {FAQ_ITEMS.map((key, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={key} className="bg-cream hairline rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-right"
              >
                <span className="text-[15px] text-charcoal font-medium leading-snug">{t(`items.${key}.q`)}</span>
                <i
                  className={`ti ti-chevron-down text-[18px] text-stone shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                ></i>
              </button>
              <div
                className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 pb-5' : 'max-h-0'}`}
              >
                <p className="text-[14px] text-stone leading-[1.9] border-t border-beige pt-4 mt-1">
                  {t(`items.${key}.a`)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Still have questions CTA */}
      <div className="mt-12 bg-linen rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center gap-5">
        <div className="w-12 h-12 rounded-full bg-cream grid place-items-center shrink-0">
          <i className="ti ti-message-circle text-sage text-[22px]"></i>
        </div>
        <div className="flex-1">
          <div className="text-[15px] text-charcoal font-medium mb-1">
            {t('contact.heroTitle', { ns: 'contact' })}
          </div>
          <p className="text-[13px] text-stone">{t('contact.heroSubtitle', { ns: 'contact' })}</p>
        </div>
        <Link
          href="/contact"
          className="shrink-0 inline-flex items-center gap-2 bg-sage text-white rounded-lg px-5 py-2.5 text-[13px] font-medium hover:bg-sage-hover transition-colors"
        >
          {t('contact.contactEmail', { ns: 'contact' })}
          <i className="ti ti-arrow-right text-[16px] flip-x"></i>
        </Link>
      </div>
    </main>
  );
}