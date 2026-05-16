export default function PrivacyPage() {
  return (
    <main>
      <article className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 py-12 md:py-20 prose-sm">
        <h1 className="text-[28px] md:text-[36px] text-charcoal leading-[1.3] mb-8">سياسة الخصوصية</h1>
        <p className="text-[11px] text-stone mb-8">آخر تحديث: مايو 2026</p>

        <div className="space-y-8 text-[14px] text-stone leading-[1.9]">
          <section>
            <h2 className="text-[18px] text-charcoal mb-3">مقدمة</h2>
            <p>بيبيز بيكس ("المنصة") تحترم خصوصيتك وتلتزم بحماية بياناتك الشخصية وفقاً لنظام حماية البيانات الشخصية السعودي (PDPL). توضح هذه السياسة كيف نجمع ونستخدم ونحمي معلوماتك.</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">البيانات التي نجمعها</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li><strong className="text-charcoal">بيانات التصفح:</strong> عنوان IP (مجهّل)، نوع المتصفح، الصفحات المزارة، مدة الزيارة</li>
              <li><strong className="text-charcoal">ملفات تعريف الارتباط:</strong> ملفات أساسية للتشغيل + تحليلية (Google Analytics) بموافقتك</li>
              <li><strong className="text-charcoal">البريد الإلكتروني:</strong> فقط إذا اشتركتِ في النشرة البريدية طوعاً</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">الغرض من الجمع</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>تحسين تجربة التصفح وأداء الموقع</li>
              <li>إرسال النشرة البريدية (بموافقتك)</li>
              <li>تحليل إحصائيات الاستخدام بشكل مجمّع</li>
              <li>الكشف عن إساءة الاستخدام وحماية المنصة</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">مشاركة البيانات</h2>
            <p>لا نبيع بياناتك أبداً. قد نشارك بيانات مجهّلة مع:</p>
            <ul className="list-disc pr-5 space-y-2 mt-2">
              <li>Google Analytics (تحليلات مجمّعة)</li>
              <li>Cloudflare (أمان وأداء CDN)</li>
              <li>Resend (إرسال البريد الإلكتروني)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">حقوقك (نظام PDPL)</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li>حق الوصول إلى بياناتك الشخصية</li>
              <li>حق تصحيح البيانات غير الدقيقة</li>
              <li>حق حذف بياناتك ("الحق في النسيان")</li>
              <li>حق الاعتراض على المعالجة</li>
              <li>حق سحب الموافقة في أي وقت</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">مدة الاحتفاظ</h2>
            <p>نحتفظ بالبيانات لمدة 14 شهراً كحد أقصى من آخر تفاعل. بيانات النشرة البريدية تُحذف فور إلغاء الاشتراك.</p>
          </section>

          <section>
            <h2 className="text-[18px] text-charcoal mb-3">التواصل</h2>
            <p>لأي استفسار حول خصوصيتك: <a href="mailto:privacy@babiespicks.com" className="text-sage hover:underline">privacy@babiespicks.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}
