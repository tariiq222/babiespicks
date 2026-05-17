'use client';

import { useState } from 'react';
import Link from 'next/link';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { SecondaryButton } from '@/shared/components/buttons';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';

const STAGES = [
  { label: 'مرحلة 1', age: '0-6 شهور' },
  { label: 'مرحلة 2', age: '6-12 شهر' },
  { label: 'مرحلة 3', age: '1-3 سنوات' },
  { label: 'متابعة', age: '3+ سنوات' },
];

const FILTERS = ['جميع المنتجات', 'يستاهل فقط', 'أقل من 100 ر.س', 'عضوي', 'شهادات أوروبية', 'الأعلى أماناً'];

const CAT_PRODUCTS = [
  { name: 'حليب أبتاميل المرحلة الأولى 900 جرام', size: '900 جم · مسحوق', variant: 'good' as const, score: 87, price: 89 },
  { name: 'حليب هيب بيو المرحلة الأولى 800 جرام', size: '800 جم · عضوي', variant: 'good' as const, score: 92, price: 115, organic: true },
  { name: 'حليب نان أوبتي برو المرحلة الأولى 400 جم', size: '400 جم · مسحوق', variant: 'good' as const, score: 84, price: 62 },
  { name: 'حليب سيميلاك توتال كومفورت 820 جم', size: '820 جم · مسحوق', variant: 'cond' as const, score: 79, price: 108 },
  { name: 'حليب بيبيلاك المرحلة الأولى 400 جرام', size: '400 جم · مسحوق', variant: 'good' as const, score: 78, price: 39 },
  { name: 'حليب إس-26 جولد المرحلة الأولى 900 جم', size: '900 جم · مسحوق', variant: 'cond' as const, score: 76, price: 95 },
  { name: 'حليب نوفالاك جنتي 1 400 جرام', size: '400 جم · حساسية', variant: 'wait' as const, score: 64, price: 72 },
  { name: 'حليب إنفاميل إنفنيت 900 جرام', size: '900 جم · مسحوق', variant: 'bad' as const, score: 48, price: 135 },
  { name: 'حليب هولي بيبي عضوي 600 جرام', size: '600 جم · عضوي', variant: 'good' as const, score: 86, price: 128, organic: true },
  { name: 'حليب أبتاميل بروفوترا 800 جرام', size: '800 جم · بريميوم', variant: 'good' as const, score: 85, price: 142 },
  { name: 'حليب سيميلاك سنشور 400 جرام', size: '400 جم · حساسية', variant: 'cond' as const, score: 73, price: 68 },
  { name: 'حليب لويس بيبي مرحلة أولى 400 جم', size: '400 جم · مسحوق', variant: 'wait' as const, score: 61, price: 45 },
];

export default function CategoryPage() {
  const [stage, setStage] = useState(0);
  const [filter, setFilter] = useState(0);

  return (
    <main>
      {/* Sage tinted hero */}
      <section style={{ background: '#E8EFE9', borderBottom: '0.5px solid #C8D5CB' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-10 md:py-16">
          <nav aria-label="مسار التنقل" className="text-[12px] mb-4" style={{ color: '#3d5a44' }}>
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-sage-deep">الرئيسية</Link></li>
              <li aria-hidden="true" className="opacity-60">←</li>
              <li><Link href="/categories" className="hover:text-sage-deep">الفئات</Link></li>
              <li aria-hidden="true" className="opacity-60">←</li>
              <li aria-current="page" className="text-sage-deep">حليب الأطفال</li>
            </ol>
          </nav>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-cream grid place-items-center shrink-0">
              <i className="ti ti-bottle text-sage text-[28px] md:text-[32px]"></i>
            </div>
            <div>
              <h1 className="text-[28px] md:text-[40px] leading-[1.3] text-sage-deep">حليب الأطفال</h1>
              <p className="text-[13px] md:text-[14px] mt-1" style={{ color: '#3d5a44' }}>
                42 منتج محلّل عبر 4 مراحل عمرية · مُحدّث مايو 2026
              </p>
            </div>
          </div>

          {/* Age stages */}
          <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl">
            {STAGES.map((s, i) => (
              <button
                key={i}
                onClick={() => setStage(i)}
                className={`rounded-lg py-3 px-2 leading-tight text-center transition-colors ${
                  stage === i ? 'bg-sage text-cream' : 'bg-cream text-charcoal hairline'
                }`}
              >
                <div className="text-[13px]">{s.label}</div>
                <div className={`text-[11px] mt-1 ${stage === i ? 'text-cream/80' : 'text-stone'}`}>{s.age}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-8 grid lg:grid-cols-[260px_1fr] gap-8 lg:gap-12">
        {/* SIDEBAR FILTERS (desktop) */}
        <aside className="hidden lg:block">
          <div className="bg-linen rounded-xl p-5 sticky top-24">
            <h3 className="text-[14px] text-charcoal mb-4">تصفية</h3>
            <div className="space-y-1">
              {FILTERS.map((f, i) => (
                <label
                  key={i}
                  className={`flex items-center gap-2 text-[13px] py-2 cursor-pointer ${
                    filter === i ? 'text-charcoal' : 'text-stone hover:text-charcoal'
                  }`}
                >
                  <input type="radio" checked={filter === i} onChange={() => setFilter(i)} className="accent-sage" />
                  <span>{f}</span>
                </label>
              ))}
            </div>
            <div className="hairline-t my-5"></div>
            <h3 className="text-[14px] text-charcoal mb-3">نطاق السعر</h3>
            <div className="grid grid-cols-2 gap-2">
              <input className="bg-cream rounded-lg px-2 py-2 text-[12px] outline-none text-right" placeholder="من" aria-label="السعر من" />
              <input className="bg-cream rounded-lg px-2 py-2 text-[12px] outline-none text-right" placeholder="إلى" aria-label="السعر إلى" />
            </div>
            <div className="hairline-t my-5"></div>
            <h3 className="text-[14px] text-charcoal mb-3">العلامة التجارية</h3>
            <div className="space-y-2 text-[13px]">
              {['أبتاميل', 'هيب بيو', 'نان', 'سيميلاك', 'بيبيلاك'].map((b, i) => (
                <label key={i} className="flex items-center gap-2 text-stone">
                  <input type="checkbox" className="accent-sage" />
                  <span>{b}</span>
                </label>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {/* Mobile filter pills */}
          <div className="lg:hidden overflow-x-auto no-scrollbar -mx-5 px-5">
            <div className="flex gap-2 w-max">
              {FILTERS.map((f, i) => (
                <button
                  key={i}
                  onClick={() => setFilter(i)}
                  className={`rounded-full px-4 py-[7px] text-[12px] whitespace-nowrap transition-colors ${
                    filter === i ? 'bg-charcoal text-cream' : 'bg-linen text-charcoal hairline'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Sort bar */}
          <div className="mt-5 lg:mt-0 flex items-center gap-3">
            <span className="text-[13px] text-stone">{CAT_PRODUCTS.length} منتج · مرحلة 1</span>
            <div className="ms-auto flex items-center gap-2">
              <span className="text-[12px] text-stone">ترتيب:</span>
              <select className="bg-cream hairline rounded-lg px-3 py-[6px] text-[12px] outline-none text-right" aria-label="ترتيب المنتجات">
                <option value="top">الأعلى تقييماً</option>
                <option value="cheap">الأرخص أولاً</option>
                <option value="new">الأحدث</option>
              </select>
            </div>
          </div>

          {/* Product grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-5 mt-5">
            {CAT_PRODUCTS.map((p, i) => (
              <Link
                key={i}
                href="/products/sample"
                className="bg-cream hairline rounded-xl p-3 md:p-4 text-right hover:bg-cream-hover transition-colors"
              >
                <div className="relative">
                  <ProductImage width={999} height={120} alt={p.name} radius={6} />
                  <div className="absolute top-2 left-2">
                    <VerdictPill variant={p.variant} score={p.score} />
                  </div>
                  {p.organic && (
                    <span className="absolute top-2 right-2 bg-cream text-[11px] text-sage-deep px-2 py-[2px] rounded-full hairline">عضوي</span>
                  )}
                </div>
                <div className="text-[12px] md:text-[13px] text-charcoal mt-3 leading-tight line-clamp-2 min-h-[32px]">{p.name}</div>
                <div className="text-[11px] md:text-[11px] text-stone mt-1">{p.size}</div>
                <div className="text-[13px] text-charcoal mt-2"><SarPrice amount={p.price} /></div>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <SecondaryButton>عرض المزيد</SecondaryButton>
          </div>
        </div>
      </div>
    </main>
  );
}
