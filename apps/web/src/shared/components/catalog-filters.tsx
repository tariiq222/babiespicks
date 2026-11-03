import { Link } from '../../i18n/navigation';
import { Tag } from './tags';
import type { CatalogFilters as Filters, getFilterOptions } from '../lib/catalog-filters';

type Options = ReturnType<typeof getFilterOptions>;
const field = 'border-b border-beige py-4 first:pt-0 last:border-0';
const legend = 'mb-2 text-sm font-semibold';
const choice = 'flex min-h-9 items-center gap-2 text-sm';

/**
 * Task 8: the filters form keeps the chosen context (shipTo/currency) in
 * hidden fields so applying a filter never clears the shopping context, and
 * the budget row uses its own currency label — never a bare number.
 */
export function CatalogFiltersPanel({ filters, options, q, locale, activeCount, shipTo = null, currency = null, maxAmount = '', budgetCurrency = null }: { filters: Filters; options: Options; q: string; locale: string; activeCount: number; shipTo?: 'SA' | 'US' | null; currency?: 'SAR' | 'USD' | null; maxAmount?: string; budgetCurrency?: 'SAR' | 'USD' | null }) {
  const ar = locale === 'ar';
  // These bands still filter the public legacy SAR catalog, independent of display preference.
  const budgetLabel = ar ? 'ر.س' : 'SAR';
  const body = <form key={JSON.stringify(filters)} action={`/${locale}`} className="pt-3 lg:pt-0">
    {q && <input type="hidden" name="q" value={q} />}
    {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
    <input type="hidden" name="shipTo" value={shipTo ?? ''} />
    <input type="hidden" name="currency" value={currency ?? ''} />
    {maxAmount && budgetCurrency && <input type="hidden" name="maxAmount" value={maxAmount} />}
    {maxAmount && budgetCurrency && <input type="hidden" name="budgetCurrency" value={budgetCurrency} />}
    {options.categories.length > 0 && <fieldset className={field}><legend className={legend}>{ar ? 'التصنيف' : 'Category'}</legend><select name="category" defaultValue={filters.category} aria-label={ar ? 'التصنيف' : 'Category'} className="w-full rounded-lg bg-white px-3 py-2.5 text-sm hairline"><option value="">{ar ? 'كل التصنيفات' : 'All categories'}</option>{options.categories.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></fieldset>}
    {options.brands.length > 1 && <fieldset className={field}><legend className={legend}>{ar ? 'الماركة' : 'Brand'}</legend><select name="brand" defaultValue={filters.brand} aria-label={ar ? 'الماركة' : 'Brand'} className="w-full rounded-lg bg-white px-3 py-2.5 text-sm hairline"><option value="">{ar ? 'كل الماركات' : 'All brands'}</option>{options.brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></fieldset>}
    {options.bands.length > 1 && <fieldset className={field}><legend className={legend}>{ar ? (budgetLabel ? `السعر (${budgetLabel})` : 'السعر') : (budgetLabel ? `Price (${budgetLabel})` : 'Price')}</legend><label className={choice}><input type="radio" name="price" value="" defaultChecked={!filters.price} className="accent-sage-deep" />{ar ? 'أي سعر' : 'Any price'}</label>{options.bands.map(band => <label key={band.id} className={choice}><input type="radio" name="price" value={band.id} defaultChecked={filters.price === band.id} className="accent-sage-deep" />{ar ? band.ar : band.en}</label>)}</fieldset>}
    {(options.hasDiscounts || options.hasRatings || options.hasVerdicts) && <fieldset className={field}><legend className={legend}>{ar ? 'خيارات' : 'Options'}</legend>
      {options.hasDiscounts && <label className={choice}><input type="checkbox" name="discount" value="1" defaultChecked={filters.discount} className="accent-sage-deep" /><Tag tone="deal" icon="ti-discount">{ar ? 'عليه خصم' : 'On discount'}</Tag></label>}
      {options.hasRatings && <label className={choice}><input type="checkbox" name="rated" value="1" defaultChecked={filters.rated} className="accent-sage-deep" /><Tag tone="rating" icon="ti-star">{ar ? 'تقييم أمازون 4 أو أعلى' : 'Amazon rating 4 or higher'}</Tag></label>}
      {options.hasVerdicts && <label className={choice}><input type="checkbox" name="worth" value="1" defaultChecked={filters.worth} className="accent-sage-deep" /><Tag tone="verified" icon="ti-check">{ar ? 'يستاهل حسب تقييمنا' : 'Worth it in our assessment'}</Tag></label>}
    </fieldset>}
    <div className="flex items-center gap-3 pt-4"><button className="min-h-11 flex-1 rounded-lg bg-sage-deep px-4 text-sm text-cream">{ar ? 'عرض النتائج' : 'Show results'}</button>{activeCount > 0 && <Link href={{ pathname: '/', query: { ...(q ? { q } : {}), shipTo: shipTo ?? '', currency: currency ?? '' } }} className="text-sm text-sage-deep underline">{ar ? 'مسح' : 'Clear'}</Link>}</div>
  </form>;
  return <>
    <details className="rounded-xl bg-linen px-4 py-3 lg:hidden"><summary className="flex min-h-7 cursor-pointer items-center gap-2 text-sm font-medium"><i aria-hidden="true" className="ti ti-adjustments-horizontal text-lg" />{ar ? 'الفلاتر' : 'Filters'}{activeCount > 0 && <span className="rounded-full bg-sage-deep px-2 text-xs text-cream">{activeCount}</span>}</summary>{body}</details>
    <aside aria-label={ar ? 'الفلاتر' : 'Filters'} className="sticky top-20 hidden max-h-[calc(100vh-6rem)] self-start overflow-y-auto rounded-2xl bg-linen p-5 lg:block">{body}</aside>
  </>;
}
