import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="bg-linen hairline-t mt-16">
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-[13px]">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-sage text-cream flex items-center justify-center text-[14px]">ب</div>
            <span className="text-[14px] text-charcoal">بيبيز بيكس</span>
          </div>
          <p className="text-stone leading-[1.8] max-w-[260px]">
            مراجعات صادقة لمنتجات الأطفال، مبنية على بيانات وذكاء اصطناعي وآراء أمهات حقيقيات.
          </p>
        </div>
        <div>
          <div className="text-charcoal mb-3">المنصة</div>
          <ul className="space-y-2 text-stone">
            <li><Link className="hover:text-charcoal" href="/about">كيف نراجع</Link></li>
            <li><Link className="hover:text-charcoal" href="/categories">الفئات</Link></li>
            <li><Link className="hover:text-charcoal" href="/best">أفضل القوائم</Link></li>
            <li><Link className="hover:text-charcoal" href="/contact">تواصل معنا</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-charcoal mb-3">قانوني</div>
          <ul className="space-y-2 text-stone">
            <li><Link className="hover:text-charcoal" href="/privacy">الخصوصية</Link></li>
            <li><Link className="hover:text-charcoal" href="/terms">الشروط</Link></li>
            <li><Link className="hover:text-charcoal" href="/disclosure">إفصاح العمولات</Link></li>
            <li><Link className="hover:text-charcoal" href="/faq">الأسئلة الشائعة</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-charcoal mb-3">تابعينا</div>
          <ul className="space-y-2 text-stone">
            <li><a href="#" className="hover:text-charcoal">إنستغرام</a></li>
            <li><a href="#" className="hover:text-charcoal">تيك توك</a></li>
            <li><a href="#" className="hover:text-charcoal">سناب شات</a></li>
            <li><Link href="#newsletter" className="hover:text-charcoal">النشرة البريدية</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pb-8 pt-2 hairline-t mt-2 flex flex-col md:flex-row items-center gap-2 text-[11px] text-stone">
        <span>© 2026 بيبيز بيكس · صُنع بحب في الرياض</span>
        <span className="md:ms-auto">المملكة العربية السعودية · العربية</span>
      </div>
    </footer>
  );
}
