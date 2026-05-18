'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

type CategoryKey = 'formula' | 'diapers' | 'carseats' | 'bottles' | 'toys' | 'care';
type BudgetKey = 'under100' | '100to300' | '300to500' | '500plus';
type PriorityKey = 'safety' | 'value' | 'premium' | 'eco';
type AgeKey = '0to6' | '6to12' | '1to2' | '2to3';

interface Answers {
  category?: CategoryKey;
  budget?: BudgetKey;
  priority?: PriorityKey;
  age?: AgeKey;
}

const CATEGORY_ICONS: Record<CategoryKey, string> = {
  formula: 'ti-bottle',
  diapers: 'ti-droplet',
  carseats: 'ti-car',
  bottles: 'ti-baby-bottle',
  toys: 'ti-puzzle',
  care: 'ti-mug',
};

const CATEGORY_ROUTES: Record<CategoryKey, string> = {
  formula: '/categories/formula',
  diapers: '/categories/diapers',
  carseats: '/categories/carseats',
  bottles: '/categories/bottles',
  toys: '/categories/toys',
  care: '/categories/care',
};

const PRIORITY_ICONS: Record<PriorityKey, string> = {
  safety: 'ti-shield-check',
  value: 'ti-coin',
  premium: 'ti-award',
  eco: 'ti-leaf',
};

const TOTAL_STEPS = 4;

function QuizStep({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[20px] text-charcoal mb-5">{question}</h2>
      {children}
    </div>
  );
}

export function FinderClient() {
  const t = useTranslations('tools.finder');
  const tf = useTranslations('tools');

  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>({});
  const [done, setDone] = useState(false);

  function handleSelect(key: keyof Answers, value: string) {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      setDone(true);
    }
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  function handleRestart() {
    setAnswers({});
    setStep(1);
    setDone(false);
  }

  const categoryRoute = answers.category ? CATEGORY_ROUTES[answers.category] : '/categories';

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

      {!done ? (
        <div className="mt-8">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-[12px] text-stone mb-2">
              <span>{t('step', { current: step, total: TOTAL_STEPS })}</span>
              <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-cream hairline rounded-full overflow-hidden">
              <div
                className="h-full bg-sage rounded-full transition-all duration-300"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                role="progressbar"
                aria-valuenow={step}
                aria-valuemin={1}
                aria-valuemax={TOTAL_STEPS}
              />
            </div>
          </div>

          {/* Q1 — Category */}
          {step === 1 && (
            <QuizStep question={t('q1')}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(['formula', 'diapers', 'carseats', 'bottles', 'toys', 'care'] as CategoryKey[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleSelect('category', cat)}
                    className={`rounded-xl p-4 text-start hairline hover:bg-linen transition-colors flex flex-col gap-2 ${answers.category === cat ? 'bg-linen' : 'bg-cream'}`}
                  >
                    <i className={`ti ${CATEGORY_ICONS[cat]} text-sage text-[22px]`}></i>
                    <span className="text-[13px] text-charcoal">
                      {t(('q1_' + cat) as Parameters<typeof t>[0])}
                    </span>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Q2 — Budget */}
          {step === 2 && (
            <QuizStep question={t('q2')}>
              <div className="grid grid-cols-2 gap-3">
                {(['under100', '100to300', '300to500', '500plus'] as BudgetKey[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => handleSelect('budget', b)}
                    className={`rounded-xl p-4 text-start hairline hover:bg-linen transition-colors ${answers.budget === b ? 'bg-linen' : 'bg-cream'}`}
                  >
                    <span className="text-[13px] text-charcoal">
                      {t(('q2_' + b) as Parameters<typeof t>[0])}
                    </span>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Q3 — Priority */}
          {step === 3 && (
            <QuizStep question={t('q3')}>
              <div className="grid grid-cols-2 gap-3">
                {(['safety', 'value', 'premium', 'eco'] as PriorityKey[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleSelect('priority', p)}
                    className={`rounded-xl p-4 text-start hairline hover:bg-linen transition-colors flex items-center gap-3 ${answers.priority === p ? 'bg-linen' : 'bg-cream'}`}
                  >
                    <i className={`ti ${PRIORITY_ICONS[p]} text-sage text-[20px]`}></i>
                    <span className="text-[13px] text-charcoal">
                      {t(('q3_' + p) as Parameters<typeof t>[0])}
                    </span>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Q4 — Age */}
          {step === 4 && (
            <QuizStep question={t('q4')}>
              <div className="grid grid-cols-2 gap-3">
                {(['0to6', '6to12', '1to2', '2to3'] as AgeKey[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => handleSelect('age', a)}
                    className={`rounded-xl p-4 text-start hairline hover:bg-linen transition-colors ${answers.age === a ? 'bg-linen' : 'bg-cream'}`}
                  >
                    <span className="text-[13px] text-charcoal">
                      {t(('q4_' + a) as Parameters<typeof t>[0])}
                    </span>
                  </button>
                ))}
              </div>
            </QuizStep>
          )}

          {/* Back button */}
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="mt-6 text-[13px] text-stone hover:text-charcoal flex items-center gap-1.5"
            >
              <i className="ti ti-arrow-right text-[14px]"></i>
              {t('back')}
            </button>
          )}
        </div>
      ) : (
        /* Result screen */
        <div className="mt-8">
          <div className="bg-linen rounded-2xl p-6 md:p-8">
            <div className="w-14 h-14 rounded-2xl bg-sage/10 flex items-center justify-center mb-4">
              <i className={`ti ${answers.category ? CATEGORY_ICONS[answers.category] : 'ti-star'} text-sage text-[28px]`}></i>
            </div>
            <h2 className="text-[20px] text-charcoal">{t('resultTitle')}</h2>
            <p className="text-[14px] text-stone mt-2 leading-[1.8]">{t('resultSubtitle')}</p>
            <p className="text-[13px] text-stone mt-3 leading-[1.7]">{t('resultNote')}</p>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <Link
              href={categoryRoute as '/categories'}
              className="btn-primary px-6 py-3 rounded-xl text-[14px] text-center flex-1 flex items-center justify-center gap-2"
            >
              <i className="ti ti-layout-grid"></i>
              {t('viewCategory')}
            </Link>
            <Link
              href="/best"
              className="px-6 py-3 rounded-xl text-[14px] text-center hairline text-charcoal hover:bg-cream transition-colors flex-1 flex items-center justify-center gap-2"
            >
              <i className="ti ti-award"></i>
              {t('viewBest')}
            </Link>
          </div>

          <button
            type="button"
            onClick={handleRestart}
            className="mt-4 text-[13px] text-stone hover:text-charcoal flex items-center gap-1.5"
          >
            <i className="ti ti-refresh text-[14px]"></i>
            {t('restart')}
          </button>
        </div>
      )}
    </section>
  );
}
