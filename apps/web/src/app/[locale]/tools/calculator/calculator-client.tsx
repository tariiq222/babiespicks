'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Cost tables (SAR/month) — Saudi market averages
const FORMULA_COSTS = { economy: 150, mid: 250, premium: 400 } as const;
const DIAPER_COSTS = { economy: 120, mid: 200, premium: 350 } as const;
const ESSENTIALS_COST = 100; // wipes, cream, etc.
const CLOTHING_COST = 150;

type DiaperTier = 'economy' | 'mid' | 'premium';

export function CalculatorClient() {
  const t = useTranslations('tools.calc');
  const tf = useTranslations('tools');

  const [useFormula, setUseFormula] = useState(true);
  const [diaperTier, setDiaperTier] = useState<DiaperTier>('mid');
  const [months, setMonths] = useState(6);
  const [calculated, setCalculated] = useState(false);
  const [copied, setCopied] = useState(false);

  const formulaCost = useFormula ? FORMULA_COSTS[diaperTier] : 0;
  const diaperCost = DIAPER_COSTS[diaperTier];
  const monthlyTotal = formulaCost + diaperCost + ESSENTIALS_COST + CLOTHING_COST;
  const grandTotal = monthlyTotal * months;

  const breakdown = [
    { label: t('itemFormula'), cost: useFormula ? FORMULA_COSTS[diaperTier] : 0, icon: 'ti-bottle' },
    { label: t('itemDiapers'), cost: diaperCost, icon: 'ti-droplet' },
    { label: t('itemEssentials'), cost: ESSENTIALS_COST, icon: 'ti-first-aid-kit' },
    { label: t('itemClothing'), cost: CLOTHING_COST, icon: 'ti-shirt' },
  ].filter((item) => item.cost > 0);

  function handleCalculate() {
    setCalculated(true);
  }

  function handleReset() {
    setCalculated(false);
    setUseFormula(true);
    setDiaperTier('mid');
    setMonths(6);
  }

  async function handleShare() {
    const text = `تكاليف المولود الجديد (${months} شهر): ${grandTotal.toLocaleString('ar-SA')} ر.س — بيبيز بيكس`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'حاسبة تكاليف المولود', text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // user cancelled share — do nothing
    }
  }

  const diaperTierKeys: { tier: DiaperTier; labelKey: 'diaperEconomy' | 'diaperMid' | 'diaperPremium' }[] = [
    { tier: 'economy', labelKey: 'diaperEconomy' },
    { tier: 'mid', labelKey: 'diaperMid' },
    { tier: 'premium', labelKey: 'diaperPremium' },
  ];

  return (
    <section className="max-w-2xl mx-auto px-5 md:px-8 pt-10 md:pt-16 pb-20">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-stone mb-6">
        <Link href="/tools" className="hover:text-charcoal">{tf('heroTitle')}</Link>
        <i className="ti ti-chevron-left text-[10px]"></i>
        <span className="text-charcoal">{t('title')}</span>
      </div>

      <h1 className="text-[28px] md:text-[38px] text-charcoal leading-[1.3]">{t('title')}</h1>
      <p className="text-[14px] text-stone mt-3 leading-[1.8]">{t('subtitle')}</p>

      {!calculated ? (
        <div className="mt-8 space-y-8">
          {/* Feeding toggle */}
          <div>
            <label className="text-[14px] text-charcoal block mb-3">{t('feedingLabel')}</label>
            <div className="flex rounded-xl overflow-hidden hairline w-fit">
              <button
                type="button"
                onClick={() => setUseFormula(false)}
                className={`px-5 py-2.5 text-[13px] transition-colors ${!useFormula ? 'bg-sage text-cream' : 'bg-cream text-stone hover:text-charcoal'}`}
              >
                {t('feedingBreast')}
              </button>
              <button
                type="button"
                onClick={() => setUseFormula(true)}
                className={`px-5 py-2.5 text-[13px] transition-colors ${useFormula ? 'bg-sage text-cream' : 'bg-cream text-stone hover:text-charcoal'}`}
              >
                {t('feedingFormula')}
              </button>
            </div>
          </div>

          {/* Diaper tier */}
          <div>
            <label className="text-[14px] text-charcoal block mb-3">{t('diaperLabel')}</label>
            <div className="flex rounded-xl overflow-hidden hairline w-fit">
              {diaperTierKeys.map(({ tier, labelKey }) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setDiaperTier(tier)}
                  className={`px-5 py-2.5 text-[13px] transition-colors ${diaperTier === tier ? 'bg-sage text-cream' : 'bg-cream text-stone hover:text-charcoal'}`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Months slider */}
          <div>
            <label className="text-[14px] text-charcoal block mb-3">
              {t('monthsLabel')}: <span className="text-sage">{months} {t('monthsSuffix')}</span>
            </label>
            <input
              type="range"
              min={1}
              max={24}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full accent-sage"
              aria-label={t('monthsLabel')}
            />
            <div className="flex justify-between text-[11px] text-stone mt-1">
              <span>1</span>
              <span>12</span>
              <span>24</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCalculate}
            className="btn-primary px-8 py-3 rounded-xl text-[14px]"
          >
            {t('calcButton')}
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* Result card */}
          <div className="bg-linen rounded-2xl p-6 md:p-8">
            <div className="text-[13px] text-stone mb-1">{t('resultTitle')}</div>
            <div className="text-[42px] text-charcoal leading-none">
              {monthlyTotal.toLocaleString('ar-SA')}
              <span className="text-[18px] text-stone ms-2">{t('sar')}</span>
            </div>
            <div className="text-[13px] text-stone mt-1">{t('resultMonth')}</div>

            <div className="hairline-t mt-4 pt-4">
              <div className="text-[13px] text-stone">{t('resultTotal', { months })}</div>
              <div className="text-[24px] text-sage mt-1">
                {grandTotal.toLocaleString('ar-SA')} <span className="text-[14px]">{t('sar')}</span>
              </div>
            </div>
          </div>

          {/* Breakdown bars */}
          <div>
            <div className="text-[14px] text-charcoal mb-4">{t('breakdown')}</div>
            <div className="space-y-3">
              {breakdown.map((item) => {
                const pct = Math.round((item.cost / monthlyTotal) * 100);
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-[13px] mb-1">
                      <span className="flex items-center gap-2 text-charcoal">
                        <i className={`ti ${item.icon} text-sage`}></i>
                        {item.label}
                      </span>
                      <span className="text-stone">{item.cost.toLocaleString('ar-SA')} {t('sar')}</span>
                    </div>
                    <div className="h-2 bg-cream rounded-full overflow-hidden hairline">
                      <div
                        className="h-full bg-sage rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-[11px] text-stone leading-[1.7] bg-cream hairline rounded-xl px-4 py-3">
            <i className="ti ti-info-circle me-1"></i>
            {t('disclaimer')}
          </p>

          {/* Action buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2.5 rounded-xl text-[13px] hairline text-charcoal hover:bg-cream transition-colors"
            >
              {t('resetButton')}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="px-6 py-2.5 rounded-xl text-[13px] bg-sage text-cream hover:bg-sage-deep transition-colors flex items-center gap-2"
            >
              <i className="ti ti-share-2"></i>
              {copied ? '✓' : t('shareButton')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
