import { Link } from '@/i18n/navigation';
import { InfoCard, PageHero } from '@/shared/components/page-hero';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return { title: locale === 'ar' ? 'عن بيبيز بيكس' : 'About BabiesPicks' }; }
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; const ar = locale === 'ar';
  const title = ar ? 'عن بيبيز بيكس' : 'About BabiesPicks';
  return <main id="main">
    <PageHero title={title} subtitle={(ar ? 'بيبيز بيكس يجمع عروض منتجات الأطفال من أي متجر أمازون حول العالم يوفّر التوصيل للسعودية أو أمريكا — من أمازون السعودية أو أمازون أمريكا — سواء مع برايم أو بدونه، إلى جانب كوبونات المتاجر المنشورة.' : 'BabiesPicks brings together baby product offers from any Amazon marketplace around the world with delivery to Saudi Arabia or the United States — Amazon Saudi Arabia or Amazon United States — with or without Prime, alongside published store coupons.')} icon="ti-heart-handshake" crumbsLabel={title} crumbs={[{ label: ar ? 'الرئيسية' : 'Home', href: '/' }, { label: title }]} />
    <div className="mx-auto grid max-w-5xl gap-4 px-5 py-8 md:grid-cols-2 md:px-8">
      <InfoCard title={ar ? 'السعر والتوفر' : 'Price and availability'} icon="ti-tag" tone="time"><p>{ar ? 'نعرض ملاحظات الأسعار المتاحة بعملتها الأصلية، وقد يتغير السعر أو ينتهي العرض. التوصيل يعتمد على المنتج والبائع وعنوانك؛ برايم ليس شرطًا لإدراج العرض ولا يعني تلقائيًا شحنًا دوليًا مجانيًا. تأكدي من السعر وإمكانية التوصيل وتكلفته وأهلية برايم وشروط الكوبون لدى المتجر قبل إتمام الطلب. المنتجات التي لا يتوفر لها سعر حديث لا تظهر في قائمة الأسعار.' : 'We show available price observations in their original currency; prices may change and offers may end. Delivery depends on the item, seller and your address; Prime is not required for listing an offer and does not automatically mean free international shipping. Check the price, delivery availability, shipping costs, Prime eligibility and coupon conditions at the store before ordering. Products without a recent price are excluded from the price listing.'}</p></InfoCard>
      <InfoCard title={ar ? 'الشراء من المتجر' : 'Buying from the store'} icon="ti-building-store" tone="info"><p>{ar ? 'الشراء والدفع والشحن والإرجاع تتم لدى المتجر. قد نحصل على عمولة عبر بعض الروابط دون تكلفة إضافية عليك.' : 'Purchases, payments, delivery and returns are handled by the store. Some links may earn us a commission at no extra cost to you.'}</p></InfoCard>
      <Link href="/" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-sage-deep px-5 text-sm font-medium text-cream hover:bg-charcoal md:col-span-2">{ar ? 'تصفحي العروض' : 'Browse offers'}<i aria-hidden="true" className="ti ti-arrow-left ltr:rotate-180" /></Link>
    </div>
  </main>;
}
