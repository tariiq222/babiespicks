import { getTranslations } from 'next-intl/server';
import { getAlternates } from '@/shared/lib/metadata';
import { FinderClient } from './finder-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<import('next').Metadata> {
  const { locale } = await params;
  const t = await getTranslations('tools.finder');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: getAlternates('/tools/finder', locale),
  };
}

export default function FinderPage() {
  return (
    <main>
      <FinderClient />
    </main>
  );
}
