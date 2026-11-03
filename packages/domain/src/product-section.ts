import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@babiespicks/db';
import { DomainError } from './errors';
interface SectionInput {
  id: string; section: 'verdict' | 'sources' | 'translation'; locale?: 'ar' | 'en';
  offset: number; limit: number; expectedVersion?: number; expectedHash?: string;
}
/** A bounded window of one stored section, protected against mixed-version reconstruction. */
export async function getProductSection(db: PrismaClient, input: SectionInput) {
  const { id, section, locale, offset, limit, expectedVersion, expectedHash } = input;
  const select: Prisma.ProductSelect = { id: true, version: true, publishStatus: true,
    ...(section === 'translation' ? { translations: { where: { locale }, select: { locale: true, name: true, description: true, slug: true, metaTitle: true, metaDescription: true } } }
      : section === 'verdict' ? { verdict: true } : { sources: true }),
  };
  const product = await db.product.findUnique({ where: { id }, select });
  if (!product) throw new DomainError('NOT_FOUND', 'Product not found');
  if (expectedVersion !== undefined && expectedVersion !== product.version) throw new DomainError('VERSION_CONFLICT', 'Product changed; restart section read');
  const value = section === 'translation' ? product.translations?.[0] ?? null : section === 'verdict' ? product.verdict : product.sources;
  const serialized = JSON.stringify(value ?? null);
  const sha256 = createHash('sha256').update(serialized).digest('hex');
  if (expectedHash !== undefined && expectedHash !== sha256) throw new DomainError('VERSION_CONFLICT', 'Section changed; restart section read');
  const characters = Array.from(serialized);
  if (offset > characters.length) throw new DomainError('INVALID_INPUT', 'Offset exceeds section length');
  const selected = characters.slice(offset, offset + limit);
  const chunk = selected.join('');
  const end = offset + selected.length;
  return { id: product.id, version: product.version, publishStatus: product.publishStatus, section,
    ...(section === 'translation' ? { locale } : {}), chunk, offset,
    nextOffset: end < characters.length ? end : null, totalCharacters: characters.length, sha256,
  };
}
