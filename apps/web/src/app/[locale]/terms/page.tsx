export default function TermsPage() {
  return (
    <main>
      <article className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 py-12 md:py-20 prose-sm">
        <h1 className="text-[28px] md:text-[36px] text-charcoal leading-[1.3] mb-8">الشروط والأحكام</h1>
        <p className="text-[11px] text-stone mb-8">آخر تحديث: مايو 2026</p>

        <div className="space-y-8 text-[14px] text-stone leading-[1.9]">
          <section>
            <h2 className="text-[18px] text-charcoal mb-3">وصف الخدمة</h2>
            <p>بيبيز بيكس منصة مراجعات مستقلة لمنتجات الأمومة والطفل. نقدم آراءً وتقييمات بناءً على معايير محددة، ونوفر روابط لمتاجر إلكترونية لشراء المنتجات.</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">طبيعة المحتوى</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>آراؤنا تعبّر عن تقييمنا المستقل ولا تمثل نصيحة طبية</li>
              <li>الأسعار المعروضة قد تتغير دون إشعار مسبق</li>
              <li>نبذل جهدنا لضمان دقة المعلومات لكن لا نتحمل مسؤولية الأخطاء</li>
              <li>استشيري طبيب الأطفال قبل تغيير حليب طفلك أو اتخاذ قرارات صحية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">الروابط والعمولات</h2>
            <p>الموقع يحتوي على روابط إحالة (affiliate links) لمتاجر إلكترونية. عند الشراء عبر هذه الروابط، قد نحصل على عمولة بسيطة. هذا لا يؤثر على:</p>
            <ul className="list-disc pr-5 space-y-2 mt-2">
              <li>تقييماتنا أو آرائنا</li>
              <li>ترتيب المنتجات في القوائم</li>
              <li>السعر الذي تدفعينه (نفس السعر بدون الرابط)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">الملكية الفكرية</h2>
            <p>جميع المحتويات (نصوص، تصاميم، شعارات) محمية بحقوق الملكية الفكرية. يُمنع النسخ أو إعادة النشر بدون إذن كتابي مسبق.</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">الاستخدام المقبول</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>استخدام الموقع للأغراض الشخصية فقط</li>
              <li>عدم محاولة اختراق أو إساءة استخدام الخدمة</li>
              <li>عدم نسخ المحتوى لأغراض تجارية</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">القانون المعمول به</h2>
            <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية. أي نزاع يُحل ودياً أو عبر الجهات المختصة في الرياض.</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">التواصل</h2>
            <p>لأي استفسار: <a href="mailto:hello@babiespicks.com" className="text-sage hover:underline">hello@babiespicks.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}
