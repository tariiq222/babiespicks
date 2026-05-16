'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { PrimaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';

const QUICK = [
  { emoji: '🏆', label: 'الأفضل عموماً', name: 'حليب أبتاميل المرحلة الأولى 900 جرام', score: 87 },
  { emoji: '💰', label: 'أفضل سعر', name: 'حليب بيبيلاك المرحلة الأولى 400 جرام', score: 78 },
  { emoji: '🛡️', label: 'الأكثر أماناً', name: 'حليب هيب بيو المرحلة الأولى 800 جرام', score: 92 },
];

const RANKS = [
  { rank: 2, name: 'حليب هيب بيو المرحلة الأولى 800 جرام', variant: 'good' as const, score: 92, price: 115 },
  { rank: 3, name: 'حليب نان أوبتي برو 400 جرام', variant: 'good' as const, score: 84, price: 62 },
  { rank: 4, name: 'حليب سيميلاك توتال كومفورت 820 جم', variant: 'cond' as const, score: 79, price: 108 },
  { rank: 5, name: 'حليب إس-26 جولد 900 جرام', variant: 'cond' as const, score: 76, price: 95 },
  { rank: 6, name: 'حليب بيبيلاك المرحلة الأولى 400 جرام', variant: 'good' as const, score: 78, price: 39 },
  { rank: 7, name: 'حليب نوفالاك جنتي 400 جرام', variant: 'wait' as const, score: 64, price: 72 },
];

const GUIDE = [
  { icon: 'ti-shield-check', title: 'الأمان أولاً', body: 'تأكدي من وجود شهادات أوروبية أو سعودية ومن غياب زيت النخيل المعدّل والسكريات المضافة.' },
  { icon: 'ti-award', title: 'التركيبة', body: 'ابحثي عن DHA و ARA و البريبيوتيكس — مكوّنات تدعم نمو الدماغ وصحة الأمعاء.' },
  { icon: 'ti-tag', title: 'السعر العادل', body: 'متوسط سعر مرحلة أولى 400 جرام في السعودية 45-75 ر.س. أي زيادة كبيرة تحتاج تبرير.' },
  { icon: 'ti-stethoscope', title: 'الاستشارة', body: 'لا تستبدلي الحليب فجأة. استشيري طبيب الأطفال قبل الانتقال بين العلامات.' },
];

const FAQS = [
  { q: 'متى أبدّل من مرحلة أولى لثانية؟', a: 'عادةً من عمر 6 شهور مع بدء الطعام الصلب، ولكن استشيري طبيب الأطفال أولاً.' },
  { q: 'هل الحليب الأوروبي أفضل من المحلي؟', a: 'ليس بالضرورة — كل حليب مسجّل في هيئة الغذاء والدواء السعودية يستوفي معايير صارمة.' },
  { q: 'ما الفرق بين العضوي والعادي؟', a: 'العضوي يستخدم حليب أبقار ترعى عضوياً ودون مبيدات. الفائدة الغذائية الصافية محل جدل.' },
  { q: 'هل يمكن خلط حليب صناعي مع حليب الأم؟', a: 'نعم، الرضاعة المختلطة شائعة وآمنة. الأهم هو الالتزام بتعقيم الأدوات وحفظ الحليب.' },
];

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="hairline-b last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-5 py-4 flex items-center gap-3 text-right hover:bg-linen/60" aria-expanded={open}>
        <span className="flex-1 text-[14px] text-charcoal">{q}</span>
        <i className={`ti text-sage text-[18px] transition-transform ${open ? 'ti-minus' : 'ti-plus'}`}></i>
      </button>
      {open && <div className="px-5 pb-5 text-[13px] text-stone leading-[1.9]">{a}</div>}
    </div>
  );
}

export default function BestListPage() {
  return (
    <main>
      {/* Header */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-8 md:pt-12">
        <nav className="text-[12px] text-stone mb-4 flex items-center gap-1">
          <Link href="/" className="hover:text-charcoal">الرئيسية</Link>
          <span className="opacity-50">←</span>
          <Link href="/categories/formula" className="hover:text-charcoal">حليب الأطفال</Link>
          <span className="opacity-50">←</span>
          <span className="text-charcoal">مرحلة أولى</span>
        </nav>
        <CategoryTag>دليل شراء · مايو 2026</CategoryTag>
        <h1 className="text-[30px] md:text-[44px] lg:text-[50px] text-charcoal leading-[1.3] mt-4 max-w-3xl">
          أفضل حليب أطفال مرحلة أولى<br className="hidden md:inline" /> في السعودية 2026
        </h1>
        <p className="text-[14px] md:text-[16px] text-stone mt-4 max-w-2xl leading-[1.8]">
          راجعنا 27 منتج، اخترنا أفضل 7 بناءً على الأمان والجودة والتقييمات. كل النتائج مدعومة بمصادر مفتوحة وتقييمات أمهات حقيقيات.
        </p>
        <div className="mt-6 max-w-3xl bg-lavender rounded-lg px-4 py-3 flex items-center gap-2 text-[12px] text-lavender-text">
          <i className="ti ti-info-circle text-[16px]"></i>
          <span>إفصاح: قد نحصل على عمولة عند الشراء من الروابط أدناه. هذا لا يؤثر على آرائنا.</span>
        </div>
      </section>

      {/* QUICK SUMMARY */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
        <SectionHead>خلاصة سريعة</SectionHead>
        <div className="grid md:grid-cols-3 gap-4">
          {QUICK.map((q, i) => (
            <Link key={i} href="/products/sample" className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-[#ece8df] transition-colors">
              <div className="text-[28px]" aria-hidden="true">{q.emoji}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-stone">{q.label}</div>
                <div className="text-[14px] text-charcoal mt-1 leading-tight">{q.name}</div>
              </div>
              <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                <div className="text-[20px]">{q.score}</div>
                <div className="text-[9px] opacity-70 mt-[2px]">/100</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* DETAILED REVIEWS */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16 grid lg:grid-cols-[1.4fr_1fr] gap-10">
        <div>
          <SectionHead>المراجعات التفصيلية</SectionHead>

          {/* Featured #1 */}
          <article className="bg-cream border border-sage rounded-2xl p-5 md:p-8 relative">
            <div className="absolute -top-3 right-6 bg-sage text-cream text-[11px] px-3 py-1 rounded-full">🏆 الأفضل عموماً</div>
            <div className="grid sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr] gap-5 md:gap-7 mt-2">
              <div className="bg-linen rounded-xl p-4 grid place-items-center">
                <ProductImage width={150} height={180} alt="الأفضل عموماً" />
              </div>
              <div>
                <CategoryTag>حليب أطفال · مرحلة أولى</CategoryTag>
                <h3 className="text-[18px] md:text-[22px] text-charcoal mt-3 leading-snug">حليب أبتاميل المرحلة الأولى 900 جرام</h3>
                <p className="text-[13px] text-stone mt-2 leading-[1.8]">
                  تركيبة قريبة من حليب الأم، شهادات أوروبية كاملة، وغني بـ DHA لدعم نمو الدماغ. الخيار الأكثر توازناً بين السعر والجودة.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <VerdictPill variant="good" score={87} />
                  <span className="text-[13px] text-stone line-through"><SarPrice amount={125} /></span>
                  <span className="text-[16px] text-charcoal"><SarPrice amount={89} /></span>
                </div>
                <div className="mt-5">
                  <PrimaryButton icon="ti-arrow-left">عرض المراجعة الكاملة</PrimaryButton>
                </div>
              </div>
            </div>
          </article>

          {/* Ranked list */}
          <div className="mt-5 space-y-3">
            {RANKS.map((r) => (
              <Link key={r.rank} href="/products/sample" className="w-full bg-linen rounded-xl p-4 md:p-5 text-right flex items-center gap-4 md:gap-5 hover:bg-[#ece8df]">
                <div className="text-[22px] md:text-[26px] text-stone w-8 text-center">{r.rank}</div>
                <div className="bg-cream rounded-lg p-2 hidden sm:block" style={{ width: 80 }}>
                  <ProductImage width={70} height={85} alt={r.name} radius={6} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] md:text-[14px] text-charcoal leading-tight">{r.name}</div>
                  <div className="flex items-center gap-3 mt-2">
                    <VerdictPill variant={r.variant} score={r.score} />
                    <SarPrice amount={r.price} className="text-[12px] text-stone" />
                  </div>
                </div>
                <i className="ti ti-chevron-left text-stone text-[20px]"></i>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start space-y-5">
          <div className="bg-linen rounded-xl p-5">
            <h3 className="text-[15px] text-charcoal mb-3">في هذه القائمة</h3>
            <ul className="space-y-2 text-[12px] text-stone">
              <li><a href="#" className="hover:text-charcoal">خلاصة سريعة</a></li>
              <li><a href="#" className="hover:text-charcoal">المراجعات التفصيلية</a></li>
              <li><a href="#" className="hover:text-charcoal">دليل الشراء</a></li>
              <li><a href="#" className="hover:text-charcoal">أسئلة شائعة</a></li>
            </ul>
          </div>
          <div className="bg-lavender rounded-xl p-5">
            <div className="text-[18px] mb-2">💌</div>
            <h3 className="text-[14px] text-lavender-text">ابقي على اطلاع</h3>
            <p className="text-[12px] text-lavender-text/80 mt-2 leading-[1.7]">رسالة أسبوعية بأفضل المراجعات والعروض.</p>
          </div>
          <div className="bg-cream hairline rounded-xl p-5">
            <h3 className="text-[14px] text-charcoal mb-3">منهجيتنا</h3>
            <p className="text-[12px] text-stone leading-[1.8]">
              نُقيّم كل منتج عبر 5 محاور: الأمان، الجودة، التقييمات، السعر، والقيمة طويلة المدى. الدرجة من 100.
            </p>
          </div>
        </aside>
      </section>

      {/* BUYING GUIDE */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16">
        <SectionHead>دليل الشراء</SectionHead>
        <div className="grid md:grid-cols-2 gap-4">
          {GUIDE.map((g, i) => (
            <div key={i} className="bg-linen rounded-xl p-5 md:p-6">
              <div className="flex items-center gap-2 mb-2">
                <i className={`ti ${g.icon} text-sage text-[20px]`}></i>
                <h3 className="text-[16px] text-charcoal">{g.title}</h3>
              </div>
              <p className="text-[13px] text-stone leading-[1.8]">{g.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQs */}
      <section className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 mt-16">
        <SectionHead>أسئلة شائعة</SectionHead>
        <div className="hairline rounded-xl overflow-hidden bg-cream">
          {FAQS.map((f, i) => (
            <FaqItem key={i} q={f.q} a={f.a} defaultOpen={i === 0} />
          ))}
        </div>
      </section>
    </main>
  );
}
