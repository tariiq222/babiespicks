import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';
import { CalculatorClient } from './calculator-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('tools.calc');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/tools/calculator', locale),
  };
}

export default function CalculatorPage() {
  return (
    <main>
      <CalculatorClient />
    </main>
  );
}
