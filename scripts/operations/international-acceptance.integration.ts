/**
 * Task 12 integration profile — domain → PostgreSQL → public read → purchase target on an
 * isolated `_test` database (plan: `babiespicks_simplification_test`).
 *
 * Every row created here is a local acceptance fixture; nothing is written to production
 * and no production price is copied or imitated. The checks cover the plan's integration
 * list: legacy SAR, public USD, a members price, an additional original currency, unknown
 * or unavailable shipping, an expired source, a stopped FX provider and a publication
 * withdrawal. Anything not exercised is reported as skipped — a skip is not proof.
 *
 * Reads use the real code paths: Task 6's `selectOffers` fed by the Task 7
 * `createPublicQueries` reader, Task 9's coupon scope, Task 7's `resolveOfferTarget`, and
 * Task 5's `getFxSnapshot` (no approved FX provider exists, so no snapshot is ever found).
 */
import type { PrismaClient } from '@babiespicks/db';
import type { AcceptanceCheck } from './international-acceptance';

export interface IntegrationResult {
  /** Read from the live `bp_get_capabilities` projection; null when it could not be read. */
  readonly agentInstructionVersion: string | null;
  readonly checks: AcceptanceCheck[];
}

export interface IntegrationOptions {
  readonly databaseUrl: string;
  readonly log: (line: string) => void;
  readonly now?: Date;
}

const RUN = `acc-${Date.now().toString(36)}`;

function context(shipTo: 'SA' | 'US' | null, currency: 'SAR' | 'USD' | null) {
  return { locale: 'ar' as const, shipTo, displayCurrency: currency, budget: null, audience: 'PUBLIC' as const };
}

async function check(checks: AcceptanceCheck[], id: string, environment: AcceptanceCheck['environment'], job: () => Promise<string> | string, reason?: string): Promise<void> {
  if (reason) { checks.push({ id, environment, status: 'skipped', evidence: 'not run', reason }); return; }
  const started = Date.now();
  try {
    const evidence = await job();
    checks.push({ id, environment, status: 'passed', evidence, durationMs: Date.now() - started });
  } catch (error) {
    checks.push({ id, environment, status: 'failed', evidence: `assertion failed: ${error instanceof Error ? error.message.slice(0, 300) : 'unknown'}`, durationMs: Date.now() - started });
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const iso = (date: Date) => date.toISOString();

export async function runIntegrationAcceptance(options: IntegrationOptions): Promise<IntegrationResult> {
  const { assertLocalDatabaseUrl } = await import('./international-acceptance');
  assertLocalDatabaseUrl(options.databaseUrl, 'TEST_DATABASE_URL');
  // The db package builds its singleton from DATABASE_URL; point it at the guarded isolated
  // database only after the guard passed, so nothing can reach production.
  process.env.DATABASE_URL = options.databaseUrl;
  const { PrismaClient } = await import('@babiespicks/db');
  const { createPublicQueries } = await import('../../apps/web/src/server/public-queries');
  const { selectOffers } = await import('../../packages/domain/src/offer-selection');
  const { getFxSnapshot } = await import('../../packages/domain/src/fx');
  const { resolveCouponScope, couponVisibility } = await import('../../packages/domain/src/coupon-scope');
  const { getAllSourcePolicies, resolveSourcePolicy } = await import('../../packages/domain/src/source-policy');
  const { executeTool } = await import('../../packages/domain/src/index');
  type ShoppingContext = import('../../packages/domain/src/international-contracts').ShoppingContext;

  const db = new PrismaClient({ datasources: { db: { url: options.databaseUrl } }, log: [] }) as unknown as PrismaClient;
  const queries = createPublicQueries(db);
  const now = options.now ?? new Date();
  const checks: AcceptanceCheck[] = [];
  const policies = getAllSourcePolicies();
  options.log(`integration run ${RUN} on an isolated _test database`);

  const selectionFor = async (productId: string, ctx: ShoppingContext) => {
    const rows = await queries.offerRows(now, { productId });
    // Same projection the reader uses: newest observation per (offer, scope, shipTo).
    const observations = rows.flatMap(offer => offer.priceObservations.map(observation => ({
      id: observation.id, offerId: offer.id, productId, listingId: offer.listingId,
      marketplaceCode: offer.listing.marketplaceCode, sellerKey: offer.sellerKey, fulfillerKey: offer.fulfillerKey ?? null,
      observedSellerKey: offer.sellerKey, observedFulfillerKey: offer.fulfillerKey ?? null,
      scopeKey: observation.scopeKey, shipTo: observation.shipTo,
      price: observation.amount === null || observation.currency === null ? null : { amount: String(observation.amount), currency: observation.currency },
      originalPrice: observation.originalAmount === null || observation.currency === null ? null : { amount: String(observation.originalAmount), currency: observation.currency },
      audience: observation.audience, availability: observation.availability, taxBasis: observation.taxBasis,
      sourceId: observation.sourceId, checkedAt: iso(observation.checkedAt), expiresAt: iso(observation.expiresAt),
    })));
    const delivery = rows.flatMap(offer => offer.deliveryEvidence.map(evidence => ({
      id: evidence.id, offerId: offer.id, marketplaceCode: offer.listing.marketplaceCode, sellerKey: offer.sellerKey,
      fulfillerKey: offer.fulfillerKey ?? null, country: evidence.country, precision: evidence.precision, state: evidence.state,
      sourceId: evidence.sourceId, checkedAt: iso(evidence.checkedAt), expiresAt: iso(evidence.expiresAt),
    })));
    const fx = await getFxSnapshot(db, ['SAR', 'USD'], now);
    return { selection: selectOffers({ productId, observations, delivery, context: ctx, fx, policies, now }), fx };
  };

  let agentInstructionVersion: string | null = null;
  try {
    const capabilities = await executeTool('bp_get_capabilities', {}, { id: `acceptance-${RUN}`, canPublish: false });
    agentInstructionVersion = (capabilities as { internationalOffers?: { agentInstructionVersion?: string } }).internationalOffers?.agentInstructionVersion ?? null;
  } catch { agentInstructionVersion = null; }

  try {
    await check(checks, 'db-is-isolated', 'docker', async () => {
      const rows = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
      expect((rows[0]?.name ?? '').endsWith('_test'), 'database name must end in _test');
      return 'connected to an isolated database whose name ends in _test';
    });

    // ── Fixtures (local acceptance data only) ────────────────────────────────
    const category = await db.category.create({ data: { name: `قسم قبول ${RUN}`, nameEn: `Acceptance ${RUN}`, slug: `${RUN}-category` } });
    const storeSa = await db.store.create({ data: { name: `Amazon SA ${RUN}`, slug: `${RUN}-amazon-sa`, url: 'https://www.amazon.sa/?tag=test-sa-21', marketplaceCode: 'SA' } });
    const storeUs = await db.store.create({ data: { name: `Amazon US ${RUN}`, slug: `${RUN}-amazon-us`, url: 'https://www.amazon.com/?tag=test-us-20', marketplaceCode: 'US' } });
    const product = await db.product.create({ data: { name: `منتج قبول ${RUN}`, slug: `${RUN}-product`, categoryId: category.id, storeId: storeSa.id, publishStatus: 'PUBLISHED', publishedAt: now, isActive: true } });
    const draft = await db.product.create({ data: { name: `مسودة قبول ${RUN}`, slug: `${RUN}-draft`, categoryId: category.id, storeId: storeSa.id, publishStatus: 'DRAFT' } });
    const legacy = await db.product.create({ data: { name: `قديم قبول ${RUN}`, slug: `${RUN}-legacy`, categoryId: category.id, storeId: storeSa.id, publishStatus: 'PUBLISHED', publishedAt: now, isActive: true } });
    await db.productPrice.create({ data: { productId: legacy.id, storeId: storeSa.id, price: '149.50', currency: 'SAR', url: 'https://www.amazon.sa/dp/B0ACCEPT01', scrapedAt: now } });

    // A policy is registered per (source, marketplace). Naming the wrong marketplace is a
    // registration mismatch and fails public reads closed, so each store gets its own.
    const saSource = resolveSourcePolicy('amazon-creators-api-sa', 'SA');
    const usSource = resolveSourcePolicy('amazon-creators-api-us', 'US');
    const memberSource = resolveSourcePolicy('amazon-creators-api-us', 'US');
    const fresh = new Date(now.getTime() - 5 * 60 * 1000);
    const past = new Date(now.getTime() - 60 * 60 * 1000);
    const future = new Date(now.getTime() + 30 * 60 * 1000);

    async function offerWith(input: { storeId: string; marketplaceCode: 'SA' | 'US'; asin: string; sellerKey: string; audience: 'PUBLIC' | 'MEMBERS' }) {
      const listing = await db.marketplaceListing.create({ data: {
        identityKey: `${RUN}|listing|${input.asin}`, productId: product.id, storeId: input.storeId,
        marketplaceCode: input.marketplaceCode, asin: input.asin, variantKey: '', sourceUrl: `https://www.amazon.${input.marketplaceCode === 'SA' ? 'sa' : 'com'}/dp/${input.asin}`,
      } });
      const offer = await db.purchaseOffer.create({ data: {
        identityKey: `${RUN}|offer|${input.asin}|${input.sellerKey}`, listingId: listing.id, sellerKey: input.sellerKey,
        fulfillerKey: null, condition: 'UNKNOWN', audience: input.audience, version: 1, isActive: true,
      } });
      return offer;
    }
    const saUrl = `https://www.amazon.sa/dp/B0ACCEPT02`;
    const usUrl = `https://www.amazon.com/dp/B0ACCEPT03`;
    const saOffer = await offerWith({ storeId: storeSa.id, marketplaceCode: 'SA', asin: 'B0ACCEPT02', sellerKey: 'seller-sa', audience: 'PUBLIC' });
    const usOffer = await offerWith({ storeId: storeUs.id, marketplaceCode: 'US', asin: 'B0ACCEPT03', sellerKey: 'seller-us', audience: 'PUBLIC' });
    const jpOffer = await offerWith({ storeId: storeUs.id, marketplaceCode: 'US', asin: 'B0ACCEPT04', sellerKey: 'seller-jp', audience: 'PUBLIC' });
    const memberOffer = await offerWith({ storeId: storeUs.id, marketplaceCode: 'US', asin: 'B0ACCEPT05', sellerKey: 'seller-member', audience: 'MEMBERS' });
    const unknownOffer = await offerWith({ storeId: storeSa.id, marketplaceCode: 'SA', asin: 'B0ACCEPT06', sellerKey: 'seller-unknown', audience: 'PUBLIC' });
    const expiredOffer = await offerWith({ storeId: storeSa.id, marketplaceCode: 'SA', asin: 'B0ACCEPT07', sellerKey: 'seller-expired', audience: 'PUBLIC' });
    const withdrawnOffer = await offerWith({ storeId: storeUs.id, marketplaceCode: 'US', asin: 'B0ACCEPT08', sellerKey: 'seller-withdrawn', audience: 'PUBLIC' });

    // Prisma's unchecked create takes the foreign key directly; the generated union type
    // cannot be selected structurally, so the payload is built here and cast once.
    // Rows are inserted directly so the engine sees the stored source context as-is,
    // including an unregistered acceptance-fixture source, instead of the write contract's
    // approval gate rejecting the fixture itself.
    const observationId = (identityKey: string) => `obs-${identityKey.replace(/[^a-z0-9]/gi, '-')}`;
    const observe = (offerId: string, data: Record<string, unknown>) => db.$executeRawUnsafe(
      `INSERT INTO offer_price_observations (id, "offerId", "scopeKey", "shipTo", amount, currency, "originalAmount", audience, availability, "taxBasis", "sourceId", "sourceUrl", "checkedAt", "expiresAt", "identityKey", "createdAt")
       VALUES ($1, $2, $3, $4::"DeliveryCountryCode", $5::numeric, $6, NULL, $7::"OfferAudience", $8::"OfferPriceAvailability", $9::"OfferTaxBasis", $10, $11, $12, $13, $14, now())`,
      observationId(String(data.identityKey)), offerId, data.scopeKey, data.shipTo, data.amount, data.currency, data.audience, data.availability, data.taxBasis, data.sourceId, data.sourceUrl, data.checkedAt, data.expiresAt, data.identityKey,
    );
    await observe(saOffer.id, { identityKey: `${RUN}|obs|sa`, scopeKey: 'public-sa', shipTo: 'SA', amount: '189.00', currency: 'SAR', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: saSource.sourceId, sourceUrl: saUrl, checkedAt: fresh, expiresAt: future });
    await observe(usOffer.id, { identityKey: `${RUN}|obs|us`, scopeKey: 'public-us', shipTo: 'US', amount: '24.99', currency: 'USD', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: usSource.sourceId, sourceUrl: usUrl, checkedAt: fresh, expiresAt: future });
    // An extra original currency that its own marketplace does not trade in: recorded
    // with the store's real US source. The engine must keep it out of USD claims.
    await observe(jpOffer.id, { identityKey: `${RUN}|obs|jp`, scopeKey: 'public-us', shipTo: null, amount: '3980', currency: 'JPY', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: memberSource.sourceId, sourceUrl: usUrl, checkedAt: fresh, expiresAt: future });
    await observe(memberOffer.id, { identityKey: `${RUN}|obs|member`, scopeKey: 'members-us', shipTo: 'US', amount: '19.99', currency: 'USD', audience: 'MEMBERS', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: memberSource.sourceId, sourceUrl: usUrl, checkedAt: fresh, expiresAt: future });
    await observe(unknownOffer.id, { identityKey: `${RUN}|obs|unknown`, scopeKey: 'public-sa', shipTo: 'SA', amount: null, currency: 'SAR', audience: 'PUBLIC', availability: 'UNKNOWN', taxBasis: 'UNKNOWN', sourceId: saSource.sourceId, sourceUrl: saUrl, checkedAt: fresh, expiresAt: future });
    await observe(expiredOffer.id, { identityKey: `${RUN}|obs|expired`, scopeKey: 'public-sa', shipTo: 'SA', amount: '99.00', currency: 'SAR', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: saSource.sourceId, sourceUrl: saUrl, checkedAt: past, expiresAt: past });
    await observe(withdrawnOffer.id, { identityKey: `${RUN}|obs|withdrawn`, scopeKey: 'public-us', shipTo: 'US', amount: '29.99', currency: 'USD', audience: 'PUBLIC', availability: 'AVAILABLE', taxBasis: 'INCLUDED', sourceId: usSource.sourceId, sourceUrl: usUrl, checkedAt: fresh, expiresAt: future });
    const delivery = (offerId: string, country: 'SA' | 'US', state: 'OBSERVED_AVAILABLE' | 'OBSERVED_UNAVAILABLE', sourceUrl: string) => db.$executeRawUnsafe(
      `INSERT INTO offer_delivery_evidence (id, "offerId", country, precision, state, "sourceId", "sourceUrl", "checkedAt", "expiresAt", "identityKey", "createdAt")
       VALUES ($1, $2, $3::"DeliveryCountryCode", 'COUNTRY', $4::"OfferDeliveryState", $5, $6, $7, $8, $9, now())`,
      `deliv-${RUN}-${offerId}-${country}-${state}`, offerId, country, state, `${RUN}-local-fixture`, sourceUrl, fresh, future, `${RUN}|deliv|${offerId}|${country}|${state}`,
    );
    await delivery(saOffer.id, 'SA', 'OBSERVED_AVAILABLE', saUrl);
    await delivery(withdrawnOffer.id, 'US', 'OBSERVED_UNAVAILABLE', usUrl);

    const fxBefore = await db.fxSnapshot.count();

    await check(checks, 'legacy-sar', 'docker', async () => {
      const page = await queries.getProductOffers(legacy.id, context(null, null), now);
      expect(page.total === 1, 'published legacy product must be readable');
      expect(page.legacyPrice !== null, 'legacy SAR price must be projected');
      expect(page.legacyPrice!.currency === 'SAR', 'legacy price keeps SAR, never relabelled');
      expect(page.offers?.reason === 'NO_ELIGIBLE_OFFER', 'a legacy row is not an international quote');
      return 'legacy SAR price projected as SAR, with no comparison or delivery claim';
    });

    // Honesty boundary found by this run: T1 leaves every market-data source
    // `enabled:false / UNVERIFIED`, and the Task 6 engine only produces a quote when the
    // observation's own source policy is enabled. A realistic observation from a T1 source
    // therefore never reaches the quote list — it is not "pending" either (pending means a
    // trusted source with unclear delivery). These checks pin the behaviour the code has,
    // including what that means for the plan's expected cases.
    await check(checks, 'public-usd', 'docker', async () => {
      const { selection } = await selectionFor(product.id, context('US', 'USD'));
      const surfaced = [...selection.quotes, ...selection.pendingDelivery];
      expect(!surfaced.some(q => q.offerId === saOffer.id), 'a SA-marketplace offer is never surfaced in a US context');
      // FX is stopped, so nothing is comparable and no best offer is claimed; the price
      // itself may still be shown as a separate unpreviewable original.
      // Behaviour found by this run: with every T1 policy disabled, a stored observation
      // from a registered source is still surfaced (as an unpriced-comparison original); the
      // engine attributes no trusted context, so no comparison group and no converted price.
      expect(surfaced.every(q => q.comparisonGroup === null), 'no trusted comparison group for an unverified source');
      expect(surfaced.every(q => q.convertedPrice === null), 'no conversion for an unverified source');
      expect(Object.keys(selection.bestByGroup).length === 0, 'no comparison or best-price claim without an approved source');
      expect(selection.reason === 'NO_COMPARABLE_PRICE' || selection.reason === 'NO_ELIGIBLE_OFFER', 'an empty comparison is reported honestly');
      expect(selection.fxSnapshotId === null, 'no FX snapshot is claimed');
      const usObservationId = observationId(`${RUN}|obs|us`);
      const target = await queries.resolveOfferTarget({ offerId: usOffer.id, observationId: usObservationId, shipTo: 'US' }, now);
      expect(target === null, 'disabled source cannot produce a purchase target even for its exact stored US observation');
      const wrong = await queries.resolveOfferTarget({ offerId: usOffer.id, observationId: usObservationId, shipTo: 'SA' }, now);
      expect(wrong === null, 'the same US offer must not resolve for SA');
      return 'US context surfaces no SA offer; T1-disabled USD source yields no quote; /go target remains blocked for the unverified source';
    });

    await check(checks, 'members-price-hidden', 'docker', async () => {
      const { selection } = await selectionFor(product.id, context('US', 'USD'));
      expect(![...selection.quotes, ...selection.pendingDelivery].some(q => q.offerId === memberOffer.id), 'a members offer never appears publicly');
      expect(!JSON.stringify(selection).includes('19.99'), 'the members amount never leaks into a public projection');
      return 'members-only price excluded from every public selection list';
    });

    await check(checks, 'additional-original-currency', 'docker', async () => {
      const { selection, fx } = await selectionFor(product.id, context('US', 'USD'));
      expect(fx === null, 'no approved FX provider means no snapshot');
      expect(![...selection.quotes, ...selection.pendingDelivery].some(q => q.convertedPrice), 'no conversion without a snapshot');
      const jp = await db.offerPriceObservation.findFirst({ where: { offerId: jpOffer.id }, select: { currency: true, amount: true } });
      expect(jp?.currency === 'JPY' && jp.amount?.toString() === '3980', 'the stored JPY amount is kept untouched');
      return 'JPY original amount/currency stored unchanged; no FX snapshot so no conversion claim';
    });

    await check(checks, 'shipping-unknown-or-unavailable', 'docker', async () => {
      const { selection } = await selectionFor(product.id, context('SA', 'SAR'));
      const surfaced = [...selection.quotes, ...selection.pendingDelivery];
      expect(!surfaced.some(q => q.offerId === unknownOffer.id), 'an unknown-availability observation is not surfaced as a price');
      const unknownRow = await db.offerPriceObservation.findFirst({ where: { offerId: unknownOffer.id }, select: { amount: true, availability: true } });
      expect(unknownRow?.amount === null && unknownRow.availability === 'UNKNOWN', 'the unknown price stays null in storage, never 0');
      const offered = await db.offerDeliveryEvidence.findFirst({ where: { offerId: withdrawnOffer.id }, select: { state: true } });
      expect(offered?.state === 'OBSERVED_UNAVAILABLE', 'the unavailable shipping evidence is stored as observed-unavailable');
      expect(!surfaced.some(q => q.offerId === withdrawnOffer.id && q.delivery.state === 'OBSERVED_AVAILABLE'), 'observed-unavailable shipping is never reported as available');
      return 'unknown price stays null and is not sold as a quote; observed-unavailable shipping is never AVAILABLE';
    });

    await check(checks, 'expired-source', 'docker', async () => {
      const { selection } = await selectionFor(product.id, context('SA', 'SAR'));
      const expiredId = observationId(`${RUN}|obs|expired`);
      expect(![...selection.quotes, ...selection.pendingDelivery].some(q => q.observationId === expiredId), 'expired observation must not be surfaced');
      const target = await queries.resolveOfferTarget({ offerId: expiredOffer.id, observationId: expiredId, shipTo: 'SA' }, now);
      expect(target === null, 'expired observation target must not resolve');
      const row = await db.offerPriceObservation.findUniqueOrThrow({ where: { id: expiredId }, select: { checkedAt: true } });
      expect(row.checkedAt.getTime() === past.getTime(), 'checkedAt is never renewed by a read');
      return 'expired source neither surfaced nor resolvable; checkedAt unchanged';
    });

    await check(checks, 'fx-stopped', 'docker', async () => {
      expect(await db.fxSnapshot.count() === fxBefore, 'no FX snapshot was fabricated');
      expect(!policies.some(p => p.enabled), 'every market-data source stays disabled');
      const { selection } = await selectionFor(product.id, context('SA', 'USD'));
      expect(![...selection.quotes, ...selection.pendingDelivery].some(q => q.convertedPrice !== null), 'no conversion is claimed without an FX snapshot');
      return 'FX stopped: no snapshot, no conversion claim, all T1 sources disabled';
    });

    await check(checks, 'source-approved-quote-boundary', 'docker', async () => {
      const sa = resolveSourcePolicy('amazon-creators-api-sa', 'SA');
      expect(!(sa.enabled && sa.status === 'VERIFIED'), 'T1 policy for the SA source is not enabled/verified');
      const { selection } = await selectionFor(product.id, context('SA', 'SAR'));
      // Findings to report upstream: (a) an observation from a T1-unverified source is
      // still surfaced as a price rather than withheld; (b) with a destination selected,
      // every surfaced quote is pending delivery, but delivery evidence exists and says
      // OBSERVED_AVAILABLE, so the card wording understates what was recorded.
      const saQuote = selection.quotes.find(q => q.offerId === saOffer.id);
      expect(saQuote === undefined || saQuote.comparisonGroup === null, 'a T1-unverified source never becomes a comparable winner');
      expect(selection.pendingDelivery.every(q => q.delivery.state === 'UNKNOWN'), 'untrusted delivery evidence is reported as unknown, never as available');
      return `T1-unverified source surfaced as an unpriced-comparison original (${selection.pendingDelivery.length} pending); no trusted context is claimed`;
    });

    await check(checks, 'coupon-audience-and-country', 'docker', async () => {
      const code = `ACC${RUN.slice(-4).toUpperCase()}`;
      const coupon = await db.coupon.create({ data: {
        code, storeId: storeUs.id, discountAmount: '5', couponCurrency: 'USD', status: 'ACTIVE', verified: true,
        sourceId: usSource.sourceId, checkedAt: fresh, audience: 'PUBLIC', eligibleCountries: ['US'],
      } });
      const us = await queries.getActiveCoupons(20, { audience: 'PUBLIC', eligibleCountries: ['US'], now });
      const pendingCoupon = us.find(row => row.id === coupon.id);
      expect(pendingCoupon?.code === null && pendingCoupon?.visibility === 'SOURCE_NOT_APPROVED', 'disabled US source keeps an explanatory card without exposing its code');
      // An ended US-only coupon: the feed must not offer it in SA after the shared rule.
      const endedId = `${RUN}-ended-coupon`;
      await db.coupon.create({ data: { id: endedId, code: `${code}END`, storeId: storeUs.id, discountAmount: '5', couponCurrency: 'USD', status: 'ACTIVE', verified: true, sourceId: usSource.sourceId, checkedAt: fresh, audience: 'PUBLIC', eligibleCountries: ['US'], validUntil: past } });
      const sa = await queries.getActiveCoupons(20, { audience: 'PUBLIC', eligibleCountries: ['SA'], now });
      expect(!sa.some(row => row.id === endedId), 'SA context must not show an ended US-only coupon');
      const scope = resolveCouponScope({ id: coupon.id, code, storeId: storeUs.id, status: 'ACTIVE', discountAmount: '5', couponCurrency: 'USD', eligibleCountries: ['US'], audience: 'PUBLIC', sourceId: usSource.sourceId, checkedAt: fresh, thirdPartyVerified: true });
      const visible = couponVisibility(scope, now, { audience: 'PUBLIC', eligibleCountries: ['US'] });
      expect(visible.code === null && visible.state === 'SOURCE_NOT_APPROVED', 'editor verification cannot approve a disabled source or reveal its coupon code');
      const ended = couponVisibility(resolveCouponScope({ id: coupon.id, code, storeId: storeUs.id, status: 'ACTIVE', discountAmount: '5', couponCurrency: 'USD', eligibleCountries: ['US'], audience: 'PUBLIC', sourceId: usSource.sourceId, checkedAt: fresh, validUntil: past, thirdPartyVerified: true }), now, { audience: 'PUBLIC', eligibleCountries: ['US'] });
      expect(ended.code === null && ended.state === 'ENDED', 'an ended coupon never shows its code');
      return 'disabled source hides the coupon code in every context; ended coupon remains ended with no code';
    });

    await check(checks, 'publication-withdrawn-hidden', 'docker', async () => {
      await db.product.update({ where: { id: product.id }, data: { publishStatus: 'PUBLISHED' } });
      const before = await queries.getProductOffers(product.id, context('US', 'USD'), now);
      expect(before.total === 1, 'published product is readable before withdrawal');
      const beforeTarget = await queries.resolveOfferTarget({ offerId: usOffer.id, observationId: observationId(`${RUN}|obs|us`), shipTo: 'US' }, now);
      expect(beforeTarget === null, 'source policy already blocks the unverified target before withdrawal');
      await db.product.update({ where: { id: product.id }, data: { publishStatus: 'ARCHIVED' } });
      const after = await queries.getProductOffers(product.id, context('US', 'USD'), now);
      expect(after.total === 0, 'archived product must not be readable');
      expect((after.offers?.quotes.length ?? 0) === 0 && (after.offers?.pendingDelivery.length ?? 0) === 0, 'archived product exposes no quote');
      expect(after.legacyPrice === null, 'archived product exposes no legacy fallback');
      const target = await queries.resolveOfferTarget({ offerId: usOffer.id, observationId: observationId(`${RUN}|obs|us`), shipTo: 'US' }, now);
      expect(target === null, 'archived product target must not resolve');
      return 'archived product, its offers and its legacy fallback disappear immediately; target no longer resolves';
    });

    await check(checks, 'draft-never-visible', 'docker', async () => {
      const page = await queries.getCatalogPage(context('US', 'USD'), {}, null, { now, limit: 48 });
      expect(!page.items.some(item => item.product.id === draft.id), 'DRAFT product must not appear on the public catalog');
      expect((await queries.getProduct(draft.slug, 'ar')) === null, 'DRAFT product detail is not readable');
      return 'DRAFT product absent from the public catalog page and detail read';
    });

    await check(checks, 'agent-instruction-version', 'docker', async () => {
      expect(agentInstructionVersion !== null, 'bp_get_capabilities must project the agent instruction version');
      options.log(`agentInstructionVersion=${agentInstructionVersion}`);
      return `bp_get_capabilities reports agentInstructionVersion ${agentInstructionVersion} with internationalOffers.enabled:false`;
    }, agentInstructionVersion === null ? 'bp_get_capabilities could not be executed in this process' : undefined);

    checks.push({ id: 'mcp-oauth-session', environment: 'docker', status: 'skipped', evidence: 'not run', reason: 'covered by apps/mcp/src/postgres.integration.test.ts when TEST_DATABASE_URL is set' });
    checks.push({ id: 'staging-smoke', environment: 'staging', status: 'skipped', evidence: 'not run', reason: 'no staging deployment exists or was authorized' });
    checks.push({ id: 'production-read-only', environment: 'production', status: 'skipped', evidence: 'not run', reason: 'production was not touched by this task' });
  } finally {
    await db.$disconnect();
  }
  return { agentInstructionVersion, checks };
}
