import { OfferContent } from '@/shared/components/editorial-content';
import { getOffer } from '@/server/queries';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, locale } = await params;
  const offer = await getOffer(slug, locale);
  if (!offer) return {};
  return {
    title: offer.seoTitle ?? offer.title,
    description: offer.seoDescription ?? undefined,
  };
}

export default async function OfferPage({ params }: Props) {
  const { slug, locale } = await params;
  const offer = await getOffer(slug, locale);
  if (!offer) notFound();

  return <OfferContent offer={offer} />;
}
