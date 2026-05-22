import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const API_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface PublicOffer {
  id: string;
  slug: string;
  title: string;
  body: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  publishedAt?: string | null;
  status: string;
}

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

async function fetchOffer(slug: string): Promise<PublicOffer | null> {
  try {
    const res = await fetch(`${API_URL}/public/offers/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicOffer;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const offer = await fetchOffer(slug);
  if (!offer) return {};
  return {
    title: offer.seoTitle ?? offer.title,
    description: offer.seoDescription ?? undefined,
  };
}

export default async function OfferPage({ params }: Props) {
  const { slug } = await params;
  const offer = await fetchOffer(slug);
  if (!offer) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-charcoal mb-6">{offer.title}</h1>
      {offer.publishedAt && (
        <p className="text-sm text-charcoal/60 mb-8">
          {new Date(offer.publishedAt).toLocaleDateString()}
        </p>
      )}
      <article
        className="prose prose-stone max-w-none whitespace-pre-wrap"
        dir="auto"
      >
        {offer.body}
      </article>
    </main>
  );
}
