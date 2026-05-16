import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-linen mx-auto grid place-items-center mb-6">
          <i className="ti ti-mood-puzzled text-sage text-[36px]"></i>
        </div>
        <h1 className="text-[24px] text-charcoal mb-3">الصفحة غير موجودة</h1>
        <p className="text-[14px] text-stone leading-[1.8] mb-6">
          عذراً، لم نجد الصفحة التي تبحثين عنها. ربما تم نقلها أو حذفها.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="bg-sage text-cream rounded-lg px-6 py-3 text-[14px] hover:bg-[#5b7d6f] inline-flex items-center justify-center gap-2">
            <span>العودة للرئيسية</span>
            <i className="ti ti-arrow-left text-[14px]"></i>
          </Link>
          <Link href="/categories" className="border border-sage text-sage rounded-lg px-6 py-3 text-[14px] hover:bg-[#6B8E7F0d] inline-flex items-center justify-center">
            تصفّحي الفئات
          </Link>
        </div>
      </div>
    </main>
  );
}
