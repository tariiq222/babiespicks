import { CategoryTag } from '@/shared/components/tags';

export default function AboutPage() {
  return (
    <main>
      <section className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-16">
        <CategoryTag>عن المنصة</CategoryTag>
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3] mt-4">
          نراجع كل منتج لطفلكِ،<br />
          <span className="text-sage-deep">برأي صادق ومستقل.</span>
        </h1>
        <p className="text-[15px] md:text-[16px] text-stone mt-6 leading-[1.9] max-w-2xl">
          بيبيز بيكس منصة سعودية مستقلة، أُسست لمساعدة الأمهات في اتخاذ قرارات شراء أفضل لأطفالهن. نراجع كل منتج بخمسة معايير واضحة ونعطيكِ رأياً صريحاً وشفافاً.
        </p>

        {/* 5 Axes */}
        <div className="mt-12">
          <h2 className="text-[22px] text-charcoal mb-6">معايير التقييم الخمسة</h2>
          <div className="grid md:grid-cols-5 gap-4">
            {[
              { icon: 'ti-shield-check', title: 'الأمان', weight: '25%', desc: 'شهادات، فحوصات، تقارير سلامة' },
              { icon: 'ti-award', title: 'الجودة', weight: '25%', desc: 'مكوّنات، تركيبة، متانة' },
              { icon: 'ti-star', title: 'التقييمات', weight: '20%', desc: 'آراء أمهات حقيقيات' },
              { icon: 'ti-tag', title: 'السعر', weight: '15%', desc: 'قيمة عادلة مقابل المال' },
              { icon: 'ti-infinity', title: 'القيمة طويلة المدى', weight: '15%', desc: 'إعادة استخدام، نمو، استدامة' },
            ].map((axis, i) => (
              <div key={i} className="bg-linen rounded-xl p-5 text-center">
                <div className="w-12 h-12 rounded-full bg-cream mx-auto grid place-items-center">
                  <i className={`ti ${axis.icon} text-sage text-[24px]`}></i>
                </div>
                <div className="text-[14px] text-charcoal mt-3">{axis.title}</div>
                <div className="text-[20px] text-sage mt-1">{axis.weight}</div>
                <div className="text-[11px] text-stone mt-2">{axis.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 14-day rule */}
        <div className="mt-12 bg-verdict-cond-bg rounded-xl p-6 md:p-8" style={{ borderRight: '4px solid #C8924A' }}>
          <h3 className="text-[18px] text-verdict-cond-text mb-3">قاعدة الـ 14 يوم</h3>
          <p className="text-[14px] text-verdict-cond-text/90 leading-[1.8]">
            لا نُصدر حكماً على أي منتج إلا بعد تتبع سعره لمدة 14 يوماً على الأقل. هذا يحمي الأمهات من الخصومات الوهمية والأسعار المتضخمة مؤقتاً.
          </p>
        </div>

        {/* Trust signals */}
        <div className="mt-12">
          <h2 className="text-[22px] text-charcoal mb-6">لماذا تثقين بنا؟</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { icon: 'ti-coin-off', title: 'لا نتلقى أموالاً من العلامات', desc: 'آراؤنا مستقلة 100٪. لا شركة تدفع لنا لتحسين تقييمها.' },
              { icon: 'ti-eye', title: 'شفافية كاملة', desc: 'نفصح عن كل علاقة عمولة. كل رابط affiliate مُعلّم بوضوح.' },
              { icon: 'ti-robot', title: 'مدعوم بالذكاء الاصطناعي', desc: 'نستخدم AI لتحليل آلاف المراجعات واستخراج أنماط لا تراها العين.' },
              { icon: 'ti-users', title: 'آراء أمهات حقيقيات', desc: 'نجمع تقييمات من +1200 أم سعودية عبر المتاجر المحلية.' },
            ].map((t, i) => (
              <div key={i} className="bg-cream hairline rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <i className={`ti ${t.icon} text-sage text-[22px]`}></i>
                  <h3 className="text-[15px] text-charcoal">{t.title}</h3>
                </div>
                <p className="text-[13px] text-stone leading-[1.8]">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Affiliate disclosure */}
        <div className="mt-12 bg-lavender rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <i className="ti ti-info-circle text-lavender-text text-[20px]"></i>
            <h3 className="text-[15px] text-lavender-text">إفصاح العمولات</h3>
          </div>
          <p className="text-[13px] text-lavender-text/90 leading-[1.8]">
            بيبيز بيكس قد يحصل على عمولة بسيطة عند شرائك من الروابط في موقعنا. هذا يساعدنا في تغطية تكاليف التشغيل والاستمرار بتقديم مراجعات مستقلة. العمولة لا تؤثر أبداً على آرائنا أو تقييماتنا.
          </p>
        </div>
      </section>
    </main>
  );
}
