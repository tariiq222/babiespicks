import { Link } from '@/i18n/navigation';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return { title: locale === 'ar' ? 'عن بيبيز بيكس' : 'About BabiesPicks' }; }
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; const ar = locale === 'ar';
  return <main className="max-w-3xl mx-auto px-5 py-12 space-y-6"><h1 className="text-3xl">{ar ? 'عن بيبيز بيكس' : 'About BabiesPicks'}</h1>
    <p>{ar ? 'بيبيز بيكس يجمع عروض منتجات الأطفال وكوبونات المتاجر المنشورة في مكان واحد.' : 'BabiesPicks brings published baby product offers and store coupons together.'}</p>
    <h2 className="text-xl">{ar ? 'السعر والتوفر' : 'Price and availability'}</h2>
    <p>{ar ? 'نعرض ملاحظات الأسعار المتاحة، وقد يتغير السعر أو ينتهي العرض. تأكدي من السعر والشحن وشروط الكوبون لدى المتجر قبل إتمام الطلب. المنتجات التي لا يتوفر لها سعر حديث لا تظهر في قائمة الأسعار.' : 'Prices may change and offers may end. Check the price, shipping and coupon conditions at the store before ordering. Products without a recent price are excluded from the price listing.'}</p>
    <h2 className="text-xl">{ar ? 'الشراء من المتجر' : 'Buying from the store'}</h2>
    <p>{ar ? 'الشراء والدفع والشحن والإرجاع تتم لدى المتجر. قد نحصل على عمولة عبر بعض الروابط دون تكلفة إضافية عليك.' : 'Purchases, payments, delivery and returns are handled by the store. Some links may earn us a commission at no extra cost to you.'}</p>
    <Link href="/" className="inline-block text-sage-deep underline">{ar ? 'تصفحي العروض' : 'Browse offers'}</Link>
  </main>;
}
