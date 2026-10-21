import { ContentBody } from './content-body';
import type { ContentDetail } from '@/server/public-queries';

export function EditorialContent({ page, requestedLocale }: { page: ContentDetail; requestedLocale: string }) {
  return <main className="max-w-3xl mx-auto px-5 py-12">
    {page.locale !== requestedLocale && <p className="text-sm text-stone mb-4">{requestedLocale === 'en' ? 'This article is available in Arabic.' : 'هذا المحتوى متاح باللغة الأصلية.'}</p>}
    <article lang={page.locale} dir={page.locale === 'ar' ? 'rtl' : 'ltr'}>
      <h1 className="text-3xl leading-relaxed mb-6">{page.title}</h1>
      {page.publishedAt && <p className="text-sm text-stone mb-6">{new Date(page.publishedAt).toLocaleDateString(page.locale === 'ar' ? 'ar-SA' : 'en-GB')}</p>}
      <ContentBody content={page.content} />
    </article>
  </main>;
}


export function OfferContent({ offer }: { offer: { locale: string; title: string; body: string; publishedAt?: string | null } }) {
  return <main className="mx-auto max-w-3xl px-4 py-12" lang={offer.locale} dir={offer.locale === 'ar' ? 'rtl' : 'ltr'}>
    <h1 className="text-3xl font-bold text-charcoal mb-6">{offer.title}</h1>
    {offer.publishedAt && <p className="text-sm text-charcoal/60 mb-8">{new Date(offer.publishedAt).toLocaleDateString(offer.locale === 'ar' ? 'ar-SA' : 'en-GB')}</p>}
    <article className="prose prose-stone max-w-none"><ContentBody content={offer.body} /></article>
  </main>;
}
