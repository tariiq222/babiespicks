'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

export default function ContactPage() {
  const t = useTranslations('contact');
  const [formState, setFormState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (data: { name: string; email: string; subject: string; message: string }) => {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs.name = t('formNameRequired');
    if (!data.email.trim()) {
      errs.email = t('formEmailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errs.email = t('formEmailInvalid');
    }
    if (!data.subject) errs.subject = t('formSubjectRequired');
    if (!data.message.trim()) {
      errs.message = t('formMessageRequired');
    } else if (data.message.trim().length < 10) {
      errs.message = t('formMessageMin');
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value,
      email: (form.elements.namedItem('email') as HTMLInputElement).value,
      subject: (form.elements.namedItem('subject') as HTMLSelectElement).value,
      message: (form.elements.namedItem('message') as HTMLTextAreaElement).value,
    };

    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setFormState('sending');

    // Client-side only — no API call
    await new Promise((r) => setTimeout(r, 1200));
    setFormState('success');
  };

  return (
    <main className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-16">
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3]">{t('heroTitle')}</h1>
        <p className="text-[15px] md:text-[16px] text-stone mt-3 leading-[1.8] max-w-xl">{t('heroSubtitle')}</p>
      </div>

      <div className="grid md:grid-cols-[1fr_1.4fr] gap-8">
        {/* Left: Contact info + FAQ teaser */}
        <div className="space-y-5">
          {/* Contact info */}
          <div className="bg-linen rounded-xl p-6">
            <h2 className="text-[16px] text-charcoal mb-5">{t('contactInfo')}</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-cream grid place-items-center shrink-0">
                  <i className="ti ti-mail text-sage text-[20px]"></i>
                </div>
                <div>
                  <div className="text-[14px] text-charcoal">{t('contactEmail')}</div>
                  <a href="mailto:hello@babiespicks.com" className="text-[13px] text-sage hover:underline break-all">
                    hello@babiespicks.com
                  </a>
                  <div className="text-[11px] text-stone mt-1">{t('contactEmailDesc')}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-cream grid place-items-center shrink-0">
                  <i className="ti ti-brand-telegram text-sage text-[20px]"></i>
                </div>
                <div>
                  <div className="text-[14px] text-charcoal">{t('contactTelegram')}</div>
                  <a
                    href="https://t.me/babiespicks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] text-sage hover:underline"
                  >
                    @babiespicks
                  </a>
                  <div className="text-[11px] text-stone mt-1">{t('contactTelegramDesc')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ teaser */}
          <div className="bg-lavender rounded-xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <i className="ti ti-help text-lavender-text text-[20px]"></i>
              <span className="text-[14px] text-lavender-text font-medium">{t('faqCta')}</span>
            </div>
            <p className="text-[13px] text-lavender-text/80 mb-4">{t('faqCtaDesc')}</p>
            <Link
              href="/faq"
              className="inline-flex items-center gap-2 text-[13px] text-lavender-text font-medium hover:underline"
            >
              {t('faqCtaLink')}
              <i className="ti ti-arrow-right text-[16px] flip-x"></i>
            </Link>
          </div>
        </div>

        {/* Right: Form */}
        <div className="bg-cream hairline rounded-xl p-6 md:p-8">
          {formState === 'success' ? (
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-verdict-good-bg mx-auto grid place-items-center mb-4">
                <i className="ti ti-check text-verdict-good-text text-[28px]"></i>
              </div>
              <h3 className="text-[20px] text-charcoal mb-2">{t('formSuccess')}</h3>
              <p className="text-[14px] text-stone">{t('formSuccessDesc')}</p>
            </div>
          ) : (
            <>
              <h2 className="text-[18px] text-charcoal mb-6">{t('formTitle')}</h2>
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-[13px] text-charcoal mb-2">
                    {t('formName')} <span className="text-terracotta">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    placeholder={t('formNamePlaceholder')}
                    className={`w-full bg-white hairline rounded-lg px-4 py-3 text-[14px] text-charcoal placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-sage/40 ${errors.name ? 'ring-2 ring-terracotta' : ''}`}
                  />
                  {errors.name && <p className="text-[12px] text-terracotta mt-1">{errors.name}</p>}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-[13px] text-charcoal mb-2">
                    {t('formEmail')} <span className="text-terracotta">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder={t('formEmailPlaceholder')}
                    className={`w-full bg-white hairline rounded-lg px-4 py-3 text-[14px] text-charcoal placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-sage/40 ${errors.email ? 'ring-2 ring-terracotta' : ''}`}
                  />
                  {errors.email && <p className="text-[12px] text-terracotta mt-1">{errors.email}</p>}
                </div>

                {/* Subject */}
                <div>
                  <label htmlFor="subject" className="block text-[13px] text-charcoal mb-2">
                    {t('formSubject')} <span className="text-terracotta">*</span>
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    defaultValue=""
                    className={`w-full bg-white hairline rounded-lg px-4 py-3 text-[14px] text-charcoal focus:outline-none focus:ring-2 focus:ring-sage/40 ${errors.subject ? 'ring-2 ring-terracotta' : ''}`}
                  >
                    <option value="" disabled>{t('formSubjectPlaceholder')}</option>
                    <option value="general">{t('formSubjectOption.general')}</option>
                    <option value="collaboration">{t('formSubjectOption.collaboration')}</option>
                    <option value="feedback">{t('formSubjectOption.feedback')}</option>
                    <option value="technical">{t('formSubjectOption.technical')}</option>
                  </select>
                  {errors.subject && <p className="text-[12px] text-terracotta mt-1">{errors.subject}</p>}
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="message" className="block text-[13px] text-charcoal mb-2">
                    {t('formMessage')} <span className="text-terracotta">*</span>
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    placeholder={t('formMessagePlaceholder')}
                    className={`w-full bg-white hairline rounded-lg px-4 py-3 text-[14px] text-charcoal placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-sage/40 resize-none ${errors.message ? 'ring-2 ring-terracotta' : ''}`}
                  />
                  {errors.message && <p className="text-[12px] text-terracotta mt-1">{errors.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={formState === 'sending'}
                  className="w-full bg-sage text-white rounded-lg py-3 text-[14px] font-medium hover:bg-sage-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {formState === 'sending' && <i className="ti ti-loader-2 animate-spin text-[16px]"></i>}
                  {formState === 'sending' ? t('formSending') : t('formSubmit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}