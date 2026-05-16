import { useTranslations } from 'next-intl';

export default function Home() {
  const t = useTranslations();

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-2xl px-6">
        <h1 className="text-5xl font-bold text-sage-deep mb-6">
          {t('brand.name')}
        </h1>
        <p className="text-2xl text-sage mb-4">
          {t('home.heroTitle')}
        </p>
        <p className="text-lg text-warm-gray mb-8">
          {t('home.heroSubtitle')}
        </p>
        <p className="text-sm text-warm-gray-light">
          {t('home.comingSoon')}
        </p>
      </div>
    </main>
  );
}
