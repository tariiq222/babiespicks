import Link from 'next/link';
import {
  getProductsByCategory,
  getVerdictVariant,
  getLocalizedName,
  getLocalizedDesc,
  type Product,
} from '@/shared/lib/api';
import { VerdictPill } from '@/shared/components/verdict-pill';
import { CategoryTag } from '@/shared/components/tags';
import { SarPrice } from '@/shared/components/sar-price';
import { ProductImage } from '@/shared/components/product-image';
import { SectionHead } from '@/shared/components/section-head';
import { FaqSection } from './faq-section';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { locale, slug } = await params;
  const products = await getProductsByCategory(slug, locale);
  const categoryName = products[0]?.category?.name || slug;
  return {
    title: `أفضل ${categoryName} في السعودية 2026`,
    description: `دليل شامل لأفضل ${categoryName} - مراجعات مستقلة وأسعار محدّثة من BabiesPicks`,
  };
}

function getCheapestProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  return products.reduce((cheapest, p) => {
    const price = p.prices[0]?.price ?? Infinity;
    const cheapestPrice = cheapest.prices[0]?.price ?? Infinity;
    return price < cheapestPrice ? p : cheapest;
  });
}

function getSafestProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  return products.reduce((safest, p) => {
    const safety = p.verdict?.safetyScore ?? 0;
    const safestSafety = safest.verdict?.safetyScore ?? 0;
    return safety > safestSafety ? p : safest;
  });
}

const GUIDE = [
  {
    icon: 'ti-shield-check',
    title: 'الأمان أولاً',
    body: 'تأكدي من وجود شهادات معتمدة وتقييمات إيجابية من أمهات حقيقيات. اقرئي المكونات بعناية.',
  },
  {
    icon: 'ti-award',
    title: 'الجودة',
    body: 'ابحثي عن منتجات من علامات تجارية موثوقة مع تاريخ في سوق الأطفال. الجودة تنعكس في المتانة والأمان.',
  },
  {
    icon: 'ti-tag',
    title: 'السعر العادل',
    body: 'قارني الأسعار بين المتاجر المختلفة. التكلفة الأعلى لا تعني دائماً جودة أفضل.',
  },
  {
    icon: 'ti-stethoscope',
    title: 'الاستشارة',
    body: 'استشيري طبيب الأطفال أو أخصائي الرعاية الصحية قبل شراء منتجات ذات صلة بالصحة والتغذية.',
  },
];

const FAQS = [
  {
    q: 'كيف تُقيّمون المنتجات؟',
    a: 'نُقيّم كل منتج عبر 5 محاور: الأمان، الجودة، التقييمات، السعر، والقيمة طويلة المدى. نعتمد على مصادر مفتوحة وتقييمات أمهات حقيقيات.',
  },
  {
    q: 'هل المحتوى مدفوع من الشركات؟',
    a: 'لا. جميع مراجعاتنا مستقلة. قد نحصل على عمولة بسيطة عند الشراء من الروابط، لكن هذا لا يؤثر على تقييماتنا.',
  },
  {
    q: 'هل الأسعار محدّثة؟',
    a: 'نحاول تحديث الأسعار بانتظام، لكنها قد تتغير. نوصي بالتحقق من سعر المنتج في المتجر قبل الشراء.',
  },
  {
    q: 'هل يمكنني اقتراح منتج للمراجعة؟',
    a: 'نعم! نرحب باقتراحاتكم. يمكنكم التواصل معنا عبر صفحة "تواصل معنا".',
  },
];

export default async function BestListPage({ params }: Props) {
  const { locale, slug } = await params;
  const products = await getProductsByCategory(slug, locale);
  const sorted = [...products].sort(
    (a, b) => (b.verdict?.overallScore || 0) - (a.verdict?.overallScore || 0),
  );

  const categoryName = products[0]?.category?.name || slug;
  const topProduct = sorted[0] || null;
  const cheapestProduct = getCheapestProduct(sorted);
  const safestProduct = getSafestProduct(sorted);

  const hasEnoughForSummary = sorted.length >= 3;
  const restProducts = sorted.slice(1);

  return (
    <main>
      {/* Header */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 pt-8 md:pt-12">
        <nav aria-label="مسار التنقل" className="text-[12px] text-stone mb-4">
          <ol className="flex items-center gap-1">
            <li>
              <Link href="/" className="hover:text-charcoal">الرئيسية</Link>
            </li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li>
              <Link href={`/categories/${slug}`} className="hover:text-charcoal">
                {categoryName}
              </Link>
            </li>
            <li aria-hidden="true" className="opacity-50">←</li>
            <li aria-current="page" className="text-charcoal">أفضل الاختيارات</li>
          </ol>
        </nav>
        <CategoryTag>دليل شراء · 2026</CategoryTag>
        <h1 className="text-[30px] md:text-[44px] lg:text-[50px] text-charcoal leading-[1.3] mt-4 max-w-3xl">
          أفضل {categoryName}
          <br className="hidden md:inline" /> في السعودية 2026
        </h1>
        <p className="text-[14px] md:text-[16px] text-stone mt-4 max-w-2xl leading-[1.8]">
          {products.length > 0
            ? `راجعنا ${products.length} منتج، اخترنا الأفضل بناءً على الأمان والجودة والتقييمات. كل النتائج مدعومة بمصادر مفتوحة وتقييمات أمهات حقيقيات.`
            : `دليل شامل لأفضل ${categoryName} - مراجعات مستقلة وأسعار محدّثة من BabiesPicks.`}
        </p>
        <div className="mt-6 max-w-3xl bg-lavender rounded-lg px-4 py-3 flex items-center gap-2 text-[12px] text-lavender-text">
          <i className="ti ti-info-circle text-[16px]"></i>
          <span>إفصاح: قد نحصل على عمولة عند الشراء من الروابط أدناه. هذا لا يؤثر على آرائنا.</span>
        </div>
      </section>

      {sorted.length === 0 ? (
        <section className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16 text-center">
          <div className="bg-linen rounded-xl p-12">
            <i className="ti ti-package-off text-[48px] text-stone mb-4 block"></i>
            <p className="text-[16px] text-stone">لا توجد مراجعات بعد لهذه الفئة</p>
          </div>
        </section>
      ) : (
        <>
          {/* QUICK SUMMARY */}
          {hasEnoughForSummary && (
            <section id="quick-summary" className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12">
              <SectionHead>خلاصة سريعة</SectionHead>
              <div className="grid md:grid-cols-3 gap-4">
                {topProduct && (
                  <Link
                    href={`/products/${topProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div className="text-[28px]" aria-hidden="true">🏆</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">الأفضل عموماً</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(topProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{topProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
                {cheapestProduct && (
                  <Link
                    href={`/products/${cheapestProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div className="text-[28px]" aria-hidden="true">💰</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">أفضل سعر</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(cheapestProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{cheapestProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
                {safestProduct && (
                  <Link
                    href={`/products/${safestProduct.slug}`}
                    className="bg-linen rounded-xl p-5 md:p-6 text-right flex items-center gap-4 hover:bg-linen-hover transition-colors"
                  >
                    <div className="text-[28px]" aria-hidden="true">🛡️</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-stone">الأكثر أماناً</div>
                      <div className="text-[14px] text-charcoal mt-1 leading-tight">
                        {getLocalizedName(safestProduct, locale)}
                      </div>
                    </div>
                    <div className="bg-verdict-good-bg text-verdict-good-text rounded-md text-center px-3 py-2 leading-none">
                      <div className="text-[20px]">{safestProduct.verdict?.overallScore ?? '—'}</div>
                      <div className="text-[11px] opacity-70 mt-[2px]">/100</div>
                    </div>
                  </Link>
                )}
              </div>
            </section>
          )}

          {/* DETAILED REVIEWS */}
          <section
            id="detailed-reviews"
            className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-12 md:mt-16 grid lg:grid-cols-[1.4fr_1fr] gap-10"
          >
            <div>
              <SectionHead>المراجعات التفصيلية</SectionHead>

              {/* Featured #1 */}
              {topProduct && (
                <Link href={`/products/${topProduct.slug}`} className="block">
                  <article className="bg-cream border border-sage rounded-2xl p-5 md:p-8 relative hover:bg-cream/80 transition-colors">
                    <div className="absolute -top-3 right-6 bg-sage text-cream text-[11px] px-3 py-1 rounded-full">
                      🏆 الأفضل عموماً
                    </div>
                    <div className="grid sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr] gap-5 md:gap-7 mt-2">
                      <div className="bg-linen rounded-xl p-4 grid place-items-center">
                        <ProductImage
                          src={topProduct.imageUrl || undefined}
                          width={150}
                          height={180}
                          alt={getLocalizedName(topProduct, locale)}
                        />
                      </div>
                      <div>
                        <CategoryTag>{categoryName}</CategoryTag>
                        <h3 className="text-[18px] md:text-[22px] text-charcoal mt-3 leading-snug">
                          {getLocalizedName(topProduct, locale)}
                        </h3>
                        <p className="text-[13px] text-stone mt-2 leading-[1.8]">
                          {getLocalizedDesc(topProduct, locale) || 'لا يوجد وصف متاح.'}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-4">
                          {topProduct.verdict && (
                            <VerdictPill
                              variant={getVerdictVariant(topProduct.verdict.type)}
                              score={topProduct.verdict.overallScore}
                            />
                          )}
                          {topProduct.prices[0]?.originalPrice && (
                            <span className="text-[13px] text-stone line-through">
                              <SarPrice amount={topProduct.prices[0].originalPrice} />
                            </span>
                          )}
                          {topProduct.prices[0] && (
                            <span className="text-[16px] text-charcoal">
                              <SarPrice amount={topProduct.prices[0].price} />
                            </span>
                          )}
                        </div>
                        <div className="mt-5 inline-flex items-center gap-2 bg-sage text-cream rounded-lg px-4 py-3 text-[14px] hover:bg-sage-hover active:bg-sage-active transition-colors">
                          <span>عرض المراجعة الكاملة</span>
                          <i className="ti ti-arrow-left text-[16px]"></i>
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              )}

              {/* Ranked list */}
              {restProducts.length > 0 && (
                <div className="mt-5 space-y-3">
                  {restProducts.map((product, index) => {
                    const rank = index + 2;
                    const variant = product.verdict
                      ? getVerdictVariant(product.verdict.type)
                      : 'good';
                    const price = product.prices[0];
                    return (
                      <Link
                        key={product.id}
                        href={`/products/${product.slug}`}
                        className="w-full bg-linen rounded-xl p-4 md:p-5 text-right flex items-center gap-4 md:gap-5 hover:bg-linen-hover"
                      >
                        <div className="text-[22px] md:text-[26px] text-stone w-8 text-center">
                          {rank}
                        </div>
                        <div
                          className="bg-cream rounded-lg p-2 hidden sm:block"
                          style={{ width: 80 }}
                        >
                          <ProductImage
                            src={product.imageUrl || undefined}
                            width={70}
                            height={85}
                            alt={getLocalizedName(product, locale)}
                            radius={6}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] md:text-[14px] text-charcoal leading-tight">
                            {getLocalizedName(product, locale)}
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            {product.verdict && (
                              <VerdictPill
                                variant={variant}
                                score={product.verdict.overallScore}
                              />
                            )}
                            {price && (
                              <SarPrice
                                amount={price.price}
                                className="text-[12px] text-stone"
                              />
                            )}
                          </div>
                        </div>
                        <i className="ti ti-chevron-left text-stone text-[20px]"></i>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:sticky lg:top-24 lg:self-start space-y-5">
              <div className="bg-linen rounded-xl p-5">
                <h3 className="text-[15px] text-charcoal mb-3">في هذه القائمة</h3>
                <ul className="space-y-2 text-[12px] text-stone">
                  <li>
                    <a href="#quick-summary" className="hover:text-charcoal">
                      خلاصة سريعة
                    </a>
                  </li>
                  <li>
                    <a href="#detailed-reviews" className="hover:text-charcoal">
                      المراجعات التفصيلية
                    </a>
                  </li>
                  <li>
                    <a href="#buying-guide" className="hover:text-charcoal">
                      دليل الشراء
                    </a>
                  </li>
                  <li>
                    <a href="#faqs" className="hover:text-charcoal">
                      أسئلة شائعة
                    </a>
                  </li>
                </ul>
              </div>
              <div className="bg-lavender rounded-xl p-5">
                <div className="text-[18px] mb-2">💌</div>
                <h3 className="text-[14px] text-lavender-text">ابقي على اطلاع</h3>
                <p className="text-[12px] text-lavender-text/80 mt-2 leading-[1.7]">
                  رسالة أسبوعية بأفضل المراجعات والعروض.
                </p>
              </div>
              <div className="bg-cream hairline rounded-xl p-5">
                <h3 className="text-[14px] text-charcoal mb-3">منهجيتنا</h3>
                <p className="text-[12px] text-stone leading-[1.8]">
                  نُقيّم كل منتج عبر 5 محاور: الأمان، الجودة، التقييمات، السعر،
                  والقيمة طويلة المدى. الدرجة من 100.
                </p>
              </div>
            </aside>
          </section>

          {/* BUYING GUIDE */}
          <section
            id="buying-guide"
            className="max-w-7xl mx-auto px-5 md:px-8 lg:px-12 mt-16"
          >
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
          <section
            id="faqs"
            className="max-w-3xl mx-auto px-5 md:px-8 lg:px-12 mt-16"
          >
            <SectionHead>أسئلة شائعة</SectionHead>
            <FaqSection faqs={FAQS} />
          </section>
        </>
      )}
    </main>
  );
}
