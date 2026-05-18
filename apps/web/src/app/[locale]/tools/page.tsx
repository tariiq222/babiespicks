import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { CategoryTag } from '@/shared/components/tags';
import { getAlternates } from '@/shared/lib/metadata';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('tools');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/tools', locale),
  };
}

export default async function ToolsPage() {
  const t = await getTranslations('tools');

  const tools = [
    {
      href: '/tools/calculator' as const,
      icon: 'ti-calculator',
      title: t('calculatorTitle'),
      desc: t('calculatorDesc'),
      cta: t('calculatorCta'),
      tint: '#E8EFE9',
    },
    {
      href: '/tools/finder' as const,
      icon: 'ti-list-search',
      title: t('finderTitle'),
      desc: t('finderDesc'),
      cta: t('finderCta'),
      tint: '#EAF0EE',
    },
  ];

  return (
    <main>
      <section className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-20">
        <CategoryTag>{t('heroTag')}</CategoryTag>
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3] mt-4">
          {t('heroTitle')}
        </h1>
        <p className="text-[15px] md:text-[16px] text-stone mt-4 leading-[1.9] max-w-xl">
          {t('heroSubtitle')}
        </p>

        <div className="mt-12 grid md:grid-cols-2 gap-6">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-2xl p-8 flex flex-col gap-5 hairline hover:shadow-md transition-shadow"
              style={{ backgroundColor: tool.tint }}
            >
              <div className="w-14 h-14 rounded-2xl bg-white/60 flex items-center justify-center">
                <i className={`ti ${tool.icon} text-sage text-[28px]`}></i>
              </div>
              <div>
                <h2 className="text-[18px] text-charcoal leading-snug">{tool.title}</h2>
                <p className="text-[13px] text-stone mt-2 leading-[1.8]">{tool.desc}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] text-sage-deep group-hover:gap-2.5 transition-all">
                {tool.cta}
                <i className="ti ti-arrow-left rtl:rotate-180"></i>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
