import { getAllProducts, getPublishedOffers } from '@/server/queries';
import { Link } from '@/i18n/navigation';
import { OfferGrid } from '@/shared/components/offer-grid';
import { CatalogFiltersPanel } from '@/shared/components/catalog-filters';
import { applyCatalogFilters, getFilterOptions, parseCatalogFilters } from '@/shared/lib/catalog-filters';
import { getLocalizedName } from '@/shared/lib/api';
import { getAlternates } from '@/shared/lib/metadata';
import { resolveShoppingContext } from '@/shared/lib/shopping-context';
import {getSavedShoppingPreferences} from '@/server/shopping-preferences';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const ar = locale === 'ar';
  // Task 8 identity: offers for your little one from Amazon around the world.
  return { title: ar ? 'عروض لطفلك من أمازون حول العالم' : 'Offers for your little one from Amazon around the world', description: ar ? 'عروض منتجات الأطفال من أسواق أمازون حول العالم، بسعرها بعملته الأصلية، وسواء مع برايم أو بدونه. تحققي من التوصيل لكل منتج لدى المتجر.' : 'Baby product offers from Amazon marketplaces around the world, in their original currency, with or without Prime. Check delivery for each item at the store.', alternates: getAlternates('', locale) };
}
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  const ar = locale === 'ar';
  const input = await searchParams;
  const q = typeof input.q === 'string' ? input.q.trim().slice(0, 200) : '';
  // Task 8: resolve the shopping context once (link → cookie → neutral); language
  // comes only from the route and never changes because of IP or destination.
  const context = resolveShoppingContext({ locale: ar ? 'ar' : 'en', query: input, cookie: await getSavedShoppingPreferences() });
  const filters = parseCatalogFilters(input);
  const [allProducts, allOffers] = await Promise.all([getAllProducts(locale), getPublishedOffers(locale)]);
  const includes = (text: string) => text.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  // Task 8: the home list keeps the current legacy contract (products with a
  // recorded legacy price). International-only products enter through the
  // Task 7 catalog read when that surface is wired to the home page.
  const priced = allProducts.filter(p => p.prices.length > 0);
  const searched = priced.filter(p => !q || includes(getLocalizedName(p, locale)) || includes(p.brand ?? ''));
  const options = getFilterOptions(searched, locale);
  const products = applyCatalogFilters(searched, filters);
  const activeCount = [filters.category, filters.brand, filters.price, filters.discount, filters.rated, filters.worth].filter(Boolean).length;
  const offers = allOffers.filter(o => !activeCount && !filters.sort && (!q || includes(o.title) || includes(o.description ?? '')));
  // Context travels with every in-page link so a context change never leaves a
  // stale purchase link behind (offer state is cleared before data refreshes).
  const query = (next: Record<string, string>) => Object.fromEntries(Object.entries({ q, category: filters.category, brand: filters.brand, price: filters.price, discount: filters.discount ? '1' : '', rated: filters.rated ? '1' : '', worth: filters.worth ? '1' : '', sort: filters.sort, shipTo: context.shipTo ?? '', currency: context.displayCurrency ?? '', ...next }).filter(([key, value]) => value || key === 'shipTo' || key === 'currency'));
  const chip = (active: boolean) => `shrink-0 rounded-full px-4 py-2 text-sm transition-colors ${active ? 'bg-sage-deep text-cream' : 'bg-linen text-charcoal hover:bg-linen-hover'}`;
  const heading = ar ? 'عروض لطفلك من أمازون حول العالم' : 'Offers for your little one from Amazon around the world';
  // T1: no source returns destination delivery evidence, so a chosen destination
  // never becomes a deliverability claim about the listing.
  const destinationNote = context.shipTo ? (ar ? 'وجهتك المختارة: ' : 'Your selected destination: ') + (context.shipTo === 'SA' ? (ar ? 'السعودية' : 'Saudi Arabia') : (ar ? 'أمريكا' : 'the United States')) + (ar ? '. لا نملك دليل توصيل لكل منتج، فتحقّقي من التوصيل والسعر النهائي لدى المتجر.' : '. We hold no per-item delivery evidence, so confirm delivery and the final price at the store.') : null;
  return <main id="main" className="max-w-7xl mx-auto px-4 md:px-8 lg:px-12 py-6 md:py-10">
    <div className="max-w-3xl mb-6"><h1 className="text-2xl md:text-4xl text-sage-deep leading-relaxed font-semibold text-balance">{heading}</h1>
      <p className="text-stone mt-2 leading-7 text-sm md:text-base">{ar ? 'عروض من أسواق أمازون حول العالم، بسعرها بعملته الأصلية، سواء مع برايم أو بدونه.' : 'Offers from Amazon marketplaces around the world, in their original currency, with or without Prime.'}</p>
      <p className="text-stone mt-2 leading-7 text-sm md:text-base">{ar ? 'قارني السعر وتقييم المتسوقين وتقييمنا التحريري قبل الشراء، ثم أكملي الطلب من المتجر.' : 'Compare the price, shopper rating and our editorial assessment, then complete your order at the store.'}</p>
      {destinationNote && <p className="text-stone mt-2 leading-7 text-sm md:text-base" role="status">{destinationNote}</p>}
      {q && <p className="text-sm text-stone mt-3" role="status">{ar ? 'نتائج البحث عن: ' : 'Search results for: '}<bdi>{q}</bdi></p>}
    </div>
    {priced.length > 0 && options.categories.length > 0 && <nav aria-label={ar ? 'التصنيفات' : 'Categories'} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"><Link scroll={false} href={{ pathname: '/', query: query({ category: '' }) }} aria-current={!filters.category ? 'true' : undefined} className={chip(!filters.category)}>{ar ? 'الكل' : 'All'}</Link>{options.categories.map(item => <Link scroll={false} key={item.slug} href={{ pathname: '/', query: query({ category: item.slug }) }} aria-current={filters.category === item.slug ? 'true' : undefined} className={chip(filters.category === item.slug)}>{item.label}</Link>)}</nav>}
    <div className={priced.length > 0 ? 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6' : ''}>
      {priced.length > 0 && <CatalogFiltersPanel filters={filters} options={options} q={q} locale={locale} activeCount={activeCount} shipTo={context.shipTo} currency={context.displayCurrency} />}
      <div className="min-w-0">
        {priced.length > 0 && <div className="no-scrollbar my-4 flex items-center gap-2 overflow-x-auto lg:mt-0"><p className="me-auto shrink-0 text-sm text-stone" role="status">{ar ? `${products.length.toLocaleString('ar-SA')} منتج` : `${products.length} products`}</p>
          <nav aria-label={ar ? 'ترتيب المنتجات' : 'Sort products'} className="flex gap-2"><Link scroll={false} href={{ pathname: '/', query: query({ sort: '' }) }} aria-current={!filters.sort ? 'true' : undefined} className={chip(!filters.sort)}>{ar ? 'الأحدث' : 'Newest'}</Link><Link scroll={false} href={{ pathname: '/', query: query({ sort: 'price' }) }} aria-current={filters.sort === 'price' ? 'true' : undefined} className={chip(filters.sort === 'price')}>{ar ? 'الأقل سعرًا' : 'Lowest price'}</Link>{options.hasDiscounts && <Link scroll={false} href={{ pathname: '/', query: query({ sort: 'discount' }) }} aria-current={filters.sort === 'discount' ? 'true' : undefined} className={chip(filters.sort === 'discount')}>{ar ? 'أعلى خصم' : 'Biggest discount'}</Link>}</nav></div>}
        <OfferGrid offers={offers} products={products} locale={locale} filtered={!!(q || activeCount)} columns={3} shipTo={context.shipTo} currency={context.displayCurrency} />
      </div>
    </div>
    <p className="text-xs text-stone mt-10">{ar ? 'تأكدي من إمكانية التوصيل لعنوانك وتكلفته وأهلية برايم لكل منتج لدى المتجر. السعر والتوفر النهائيان لدى المتجر وقت الشراء. قد نحصل على عمولة عند الشراء عبر بعض الروابط، دون تكلفة إضافية عليك.' : 'Check delivery to your address, shipping costs and Prime eligibility for each item at the store. Final price and availability are confirmed by the store at checkout. We may earn a commission from purchases through some links, at no extra cost to you.'}</p>
  </main>;
}
