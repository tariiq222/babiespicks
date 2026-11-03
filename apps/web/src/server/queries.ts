import 'server-only';
import { prisma } from '@babiespicks/db';
import { createPublicQueries } from './public-queries';

// Deliberately uncached: withdrawing publication takes effect on the next request.
export const {
  getProducts, getAllProducts, getActiveCoupons, getProduct, getProductsByCategory, searchProducts,
  getContentPages, getContentPage, getRelatedContentForProduct, getRelatedContentForCategory,
  getStoreBySlug, getOffer, getPublishedOffers,
  getProductOffers, getCatalogPage, getOfferSelection, resolveOfferTarget, legacyPriceFor, offerRows,
} = createPublicQueries(prisma);
export { CATALOG_PAGE_SIZE, CATALOG_MAX_LIMIT, encodeCatalogCursor, decodeCatalogCursor } from './public-queries';
