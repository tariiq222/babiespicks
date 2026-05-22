import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('disclosure');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/disclosure', locale),
  };
}

export default async function DisclosurePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations('disclosure');
  const tcommon = await getTranslations('common');

  return (
    <main className="max-w-4xl mx-auto px-5 md:px-8 lg:px-12 pt-12 md:pt-20 pb-16">
      {/* Hero */}
      <div className="mb-10">
        <nav aria-label={t('breadcrumbAria')} className="text-[12px] mb-5 flex items-center gap-1 text-stone">
          <ol className="flex items-center gap-1">
            <li><Link href="/" className="hover:text-sage-deep">{tcommon('home')}</Link></li>
            <li aria-hidden="true" className="opacity-60"><i className="ti ti-chevron-right flip-x text-[12px]" aria-hidden="true"></i></li>
            <li aria-current="page" className="text-sage-deep">{t('title')}</li>
          </ol>
        </nav>
        <h1 className="text-[32px] md:text-[44px] text-charcoal leading-[1.3]">{t('title')}</h1>
      </div>

      {/* Disclosure content */}
      <div className="space-y-6 text-[15px] text-stone leading-[1.9]">
        <p>{t('description')}</p>

        <div className="bg-linen rounded-xl p-6 md:p-8">
          <h2 className="text-[16px] text-charcoal font-semibold mb-4">{t('title')}</h2>
          <p className="mb-4">{t('description')}</p>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <i className="ti ti-check text-sage mt-0.5 shrink-0"></i>
              <span>{t('bullet1')}</span>
            </li>
            <li className="flex items-start gap-3">
              <i className="ti ti-check text-sage mt-0.5 shrink-0"></i>
              <span>{t('bullet2')}</span>
            </li>
            <li className="flex items-start gap-3">
              <i className="ti ti-check text-sage mt-0.5 shrink-0"></i>
              <span>{t('bullet3')}</span>
            </li>
            <li className="flex items-start gap-3">
              <i className="ti ti-check text-sage mt-0.5 shrink-0"></i>
              <span>{t('bullet4')}</span>
            </li>
            <li className="flex items-start gap-3">
              <i className="ti ti-check text-sage mt-0.5 shrink-0"></i>
              <span>{t('bullet5')}</span>
            </li>
          </ul>
        </div>

        <p>
          {t('howWeReviewText')},{' '}
          <Link href="/about" className="text-sage hover:text-sage-hover underline">
            {t('howWeReviewLink')}
          </Link>
          {' '}{t('faqText')}{' '}
          <Link href="/faq" className="text-sage hover:text-sage-hover underline">
            {t('faqLink')}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
