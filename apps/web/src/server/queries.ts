import 'server-only';
import { prisma } from '@babiespicks/db';
import { createPublicQueries } from './public-queries';

// Deliberately uncached: withdrawing publication takes effect on the next request.
export const { getProducts, getAllProducts, getProduct, getProductsByCategory, searchProducts, getContentPages, getContentPage, getRelatedContentForProduct, getRelatedContentForCategory, getStoreBySlug, getOffer, getPublishedOffers } = createPublicQueries(prisma);
