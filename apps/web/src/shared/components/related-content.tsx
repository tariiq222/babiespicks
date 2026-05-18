import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export interface RelatedItem {
  title: string;
  href: string;
  type: 'product' | 'best-list' | 'guide' | 'category';
  image?: string;
}

interface RelatedContentProps {
  items: RelatedItem[];
}

const TYPE_ICONS: Record<RelatedItem['type'], string> = {
  product: 'ti-package',
  'best-list': 'ti-star',
  guide: 'ti-book',
  category: 'ti-category',
};

export async function RelatedContent({ items }: RelatedContentProps) {
  if (items.length === 0) return null;
  const t = await getTranslations('related');

  return (
    <section className="mt-14">
      <div className="flex items-center gap-2 mb-5">
        <i className="ti ti-bookmarks text-sage text-[20px]"></i>
        <h2 className="text-[18px] text-charcoal">{t('title')}</h2>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory scrollbar-hide">
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.href}
            className="group shrink-0 snap-start bg-cream hairline rounded-xl p-4 hover:bg-cream-hover transition-colors min-w-[160px] max-w-[200px] flex flex-col gap-3"
          >
            {/* Icon badge */}
            <div className="w-10 h-10 rounded-lg bg-linen grid place-items-center">
              <i className={`ti ${TYPE_ICONS[item.type]} text-sage text-[18px]`}></i>
            </div>

            {/* Type label */}
            <span className="text-[10px] text-stone uppercase tracking-wider">
              {item.type === 'best-list'
                ? t('bestList')
                : item.type === 'guide'
                ? t('guide')
                : item.type === 'category'
                ? t('category')
                : t('product')}
            </span>

            {/* Title */}
            <span className="text-[13px] text-charcoal leading-snug line-clamp-2 flex-1">
              {item.title}
            </span>

            {/* Arrow */}
            <div className="flex items-center gap-1 text-sage text-[12px] mt-auto pt-1">
              <span>{t('view')}</span>
              <i className="ti ti-arrow-left text-[14px] group-hover:-translate-x-0.5 transition-transform"></i>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}