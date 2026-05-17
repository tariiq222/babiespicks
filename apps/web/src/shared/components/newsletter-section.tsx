'use client';

import { useState } from 'react';

export function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  return (
    <section id="newsletter" className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16 scroll-mt-24">
      <div className="hairline rounded-2xl overflow-hidden grid md:grid-cols-[1fr_1.1fr]">
        {/* Visual side */}
        <div
          className="relative p-8 md:p-10 flex flex-col justify-between min-h-[280px]"
          style={{ background: 'linear-gradient(155deg, #E8EFE9 0%, #F0F3EC 55%, #FAF8F5 100%)' }}
        >
          <div>
            <span className="inline-flex items-center gap-2 bg-cream hairline rounded-full px-3 py-[5px] text-[11px] text-stone">
              <span className="w-1.5 h-1.5 rounded-full bg-terracotta"></span>
              <span>للمشتركات فقط</span>
            </span>
            <h2 className="text-[26px] md:text-[34px] text-charcoal mt-4 leading-[1.25] tracking-[-0.01em]">
              أفضل العروض،<br />
              <span className="text-sage-deep">تصلكِ أولاً.</span>
            </h2>
          </div>
          <ul className="space-y-3 text-[13px] text-charcoal mt-6">
            <li className="flex items-center gap-2"><i className="ti ti-discount-2 text-sage text-[18px]"></i> خصومات حصرية للمشتركات فقط</li>
            <li className="flex items-center gap-2"><i className="ti ti-bolt text-sage text-[18px]"></i> وصول مبكّر للمراجعات الجديدة</li>
            <li className="flex items-center gap-2"><i className="ti ti-mail-opened text-sage text-[18px]"></i> رسالة أسبوعية واحدة، بدون إزعاج</li>
          </ul>
        </div>

        {/* Form side */}
        <div className="bg-cream p-8 md:p-10 flex flex-col justify-center">
          {done ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-verdict-good-bg grid place-items-center mx-auto">
                <i className="ti ti-mail-heart text-verdict-good-text text-[26px]"></i>
              </div>
              <h3 className="text-[18px] text-charcoal mt-4">تمّ الاشتراك بنجاح</h3>
              <p className="text-[13px] text-stone mt-2">أول رسالة بعروض حصرية تصلكِ خلال ساعة.</p>
            </div>
          ) : (
            <>
              <p className="text-[14px] md:text-[15px] text-stone leading-[1.95] mb-5">
                انضمي مع <span className="text-charcoal">+1200 أم سعودية</span> لتصلكِ أفضل العروض والمراجعات الجديدة كل أسبوع.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => { e.preventDefault(); if (email) setDone(true); }}
              >
                <div className="flex-1 bg-linen hairline rounded-lg flex items-center px-3">
                  <i className="ti ti-mail text-stone text-[16px]"></i>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="بريدكِ الإلكتروني"
                    className="bg-transparent flex-1 px-3 py-[12px] text-[13px] outline-none text-right placeholder:text-stone/70"
                  />
                </div>
                <button className="bg-sage text-cream rounded-lg px-6 py-3 text-[14px] hover:bg-sage-hover whitespace-nowrap inline-flex items-center justify-center gap-2">
                  <span>اشتركي مجاناً</span>
                  <i className="ti ti-arrow-left text-[14px]"></i>
                </button>
              </form>
              <p className="text-[11px] text-stone mt-3 flex items-center gap-1">
                <i className="ti ti-lock text-[12px]"></i>
                نحترم خصوصيتكِ. إلغاء الاشتراك في أي وقت.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
