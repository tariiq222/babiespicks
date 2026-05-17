import Link from 'next/link';
import { VerdictPill, VerdictCard } from '@/shared/components/verdict-pill';
import { CategoryTag, DiscountTag } from '@/shared/components/tags';
import { PrimaryButton, SecondaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';

const SCORES = [
  { ar: 'الأمان', icon: 'ti-shield-check', val: 92 },
  { ar: 'الجودة', icon: 'ti-award', val: 88 },
  { ar: 'التقييمات', icon: 'ti-star', val: 85 },
  { ar: 'السعر', icon: 'ti-tag', val: 80 },
  { ar: 'القيمة طويلة المدى', icon: 'ti-infinity', val: 85 },
];

const STORES = [
  { store: 'نون', price: 89, best: true, note: 'الأفضل' },
  { store: 'أمازون السعودية', price: 94 },
  { store: 'ممزورلد', price: 99 },
  { store: 'صيدلية النهدي', price: 105 },
];

const ALTERNATIVES = [
  { name: 'حفاضات بامبرز برميوم مقاس 4', variant: 'good' as const, score: 84, price: 115 },
  { name: 'كرسي سيارة شيكو نكست فيت', variant: 'cond' as const, score: 72, price: 899 },
  { name: 'رضّاعة فيليبس أفنت الزجاج', variant: 'good' as const, score: 81, price: 55 },
  { name: 'مرطّب جونسون بزيت اللوز', variant: 'wait' as const, score: 58, price: 32 },
];

export default function ProductPage() {
  return (
    <main>
      {/* Breadcrumbs */}
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-6">
        <nav aria-label="مسار التنقل" className="text-[12px] text-stone">
          <ol className="flex items-center gap-1">
            <li><Link href="/" className="hover:text-charcoal">الرئيسية</Link></li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li><Link href="/categories/formula" className="hover:text-charcoal">حليب الأطفال</Link></li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li aria-current="page" className="text-charcoal">حليب أبتاميل المرحلة الأولى</li>
          </ol>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-6 grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12">
        {/* IMAGE COLUMN */}
        <div>
          <div className="bg-linen rounded-2xl p-8 md:p-12 grid place-items-center">
            <ProductImage width={360} height={400} alt="صورة المنتج الرئيسية" radius={16} />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`bg-linen rounded-lg p-3 ${i === 0 ? 'ring-1 ring-sage' : ''}`}>
                <ProductImage width={100} height={100} alt={`زاوية ${i + 1}`} radius={6} />
              </div>
            ))}
          </div>
        </div>

        {/* INFO COLUMN */}
        <div>
          <div className="flex items-center gap-2">
            <CategoryTag>حليب أطفال · مرحلة أولى</CategoryTag>
            <span className="text-[11px] text-stone">العلامة: أبتاميل</span>
          </div>
          <h1 className="text-[24px] md:text-[30px] text-charcoal leading-[1.3] mt-4">
            حليب أبتاميل المرحلة الأولى 900 جرام
          </h1>
          <p className="text-[13px] md:text-[14px] text-stone mt-2">للرضع من الولادة حتى 6 شهور</p>

          <div className="mt-6">
            <VerdictCard
              variant="good"
              score={87}
              reason="منتج موثوق بسجل سلامة ممتاز، شهادات أوروبية كاملة، وتقييمات إيجابية من 234 أم سعودية."
            />
          </div>

          {/* PRICE BLOCK */}
          <div className="mt-6 bg-cream hairline rounded-xl p-5">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-[28px] md:text-[32px] text-charcoal"><SarPrice amount={89} /></span>
              <span className="text-[14px] text-stone line-through"><SarPrice amount={125} /></span>
              <DiscountTag>وفّر 29٪</DiscountTag>
            </div>
            <div className="text-[12px] text-stone mt-1">شامل الضريبة · أسعار 25 مايو 2026</div>
            <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3">
              <PrimaryButton full icon="ti-arrow-left" size="lg">اشتري من نون</PrimaryButton>
              <SecondaryButton>قارني الأسعار</SecondaryButton>
            </div>
            <p className="text-[11px] text-stone text-center mt-3">إفصاح: نحصل على عمولة بسيطة عند الشراء</p>
          </div>

          {/* Short bullets */}
          <ul className="mt-6 grid sm:grid-cols-2 gap-2 text-[13px] text-charcoal">
            {['شهادات أوروبية كاملة', 'غني بـ DHA و ARA', 'تركيبة قريبة من حليب الأم', 'بريبيوتيكس لصحة الأمعاء'].map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <i className="ti ti-circle-check text-sage text-[16px] mt-[2px]"></i>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* DETAILED RATING + PRICE COMPARISON */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16 grid md:grid-cols-2 gap-8 md:gap-12">
        <div>
          <h2 className="text-[20px] md:text-[22px] text-charcoal mb-5">التقييم بالتفصيل</h2>
          <div className="bg-cream hairline rounded-xl p-5 md:p-6 space-y-5">
            {SCORES.map((s, i) => (
              <div key={i}>
                <div className="flex items-center text-[14px]">
                  <i className={`ti ${s.icon} text-sage text-[18px] me-2`}></i>
                  <span className="text-charcoal">{s.ar}</span>
                  <span className="ms-auto text-charcoal">{s.val}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-beige overflow-hidden">
                  <div className="h-full bg-sage rounded-full" style={{ width: `${s.val}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-[20px] md:text-[22px] text-charcoal mb-5">مقارنة الأسعار</h2>
          <div className="hairline rounded-xl overflow-hidden">
            {STORES.map((s, i) => (
              <div
                key={i}
                className={`flex items-center px-4 md:px-5 py-4 text-[14px] ${s.best ? 'bg-verdict-good-bg' : 'bg-cream'} ${i < STORES.length - 1 ? 'hairline-b' : ''}`}
              >
                <span className={s.best ? 'text-verdict-good-text' : 'text-charcoal'}>{s.store}</span>
                {s.best && s.note && (
                  <span className="ms-2 text-[11px] bg-verdict-good-border/15 text-verdict-good-text px-2 py-[1px] rounded-full">{s.note}</span>
                )}
                <span className={`ms-auto ${s.best ? 'text-verdict-good-text' : 'text-charcoal'}`}>
                  <SarPrice amount={s.price} />
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone mt-3">آخر تحديث: قبل 4 ساعات. الأسعار قد تتغير.</p>
        </div>
      </section>

      {/* PROS / CONS */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 grid md:grid-cols-2 gap-5">
        <div className="bg-verdict-good-bg rounded-xl p-5 md:p-6">
          <div className="flex items-center gap-2 text-verdict-good-text text-[14px] mb-3">
            <i className="ti ti-plus text-[18px]"></i>
            <span>المميزات</span>
          </div>
          <ul className="space-y-2 text-[13px] text-verdict-good-text/95">
            {['غني بـ DHA لتطور المخ', 'شهادات أوروبية ممتازة', 'تركيبة قريبة من حليب الأم'].map((t, i) => (
              <li key={i} className="flex gap-2"><span className="text-verdict-good-border mt-[2px]">•</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
        <div className="bg-verdict-bad-bg rounded-xl p-5 md:p-6">
          <div className="flex items-center gap-2 text-verdict-bad-text text-[14px] mb-3">
            <i className="ti ti-alert-triangle text-[18px]"></i>
            <span>انتبهي</span>
          </div>
          <ul className="space-y-2 text-[13px] text-verdict-bad-text/95">
            {['قد لا يناسب الأطفال أصحاب الكوليك أو الحساسية من بروتين الحليب', 'السعر تذبذب 20٪ آخر 30 يوم'].map((t, i) => (
              <li key={i} className="flex gap-2"><span className="text-verdict-bad-border mt-[2px]">•</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {/* ALTERNATIVES */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16">
        <SectionHead>بدائل قد تناسبك</SectionHead>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
          {ALTERNATIVES.map((p, i) => (
            <Link key={i} href="/products/sample" className="bg-cream hairline rounded-xl p-3 md:p-4 text-right hover:bg-cream-hover transition-colors">
              <ProductImage width={999} height={120} alt={p.name} radius={8} />
              <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px]">{p.name}</div>
              <div className="flex items-center justify-between mt-3">
                <VerdictPill variant={p.variant} score={p.score} />
                <SarPrice amount={p.price} className="text-[12px] text-charcoal" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
