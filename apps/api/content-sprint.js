#!/usr/bin/env node
/**
 * Content Sprint Engine
 * Automatically generates content pages (best lists, reviews, buying guides)
 * from existing products in the database.
 *
 * Usage:
 *   node content-sprint.js [--type best|review|guide|all] [--category formula|diapers|...] [--dry-run]
 *
 * Examples:
 *   node content-sprint.js --dry-run
 *   node content-sprint.js --type best --category formula
 *   node content-sprint.js --type all --dry-run
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/src/app.module');
const { CoordinatorService } = require('./dist/src/agents/coordinator/coordinator.service');
const { PrismaService } = require('./dist/src/infrastructure/database/prisma.service');

// ── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const ARG_TYPE = getArg('type') || 'all';        // best | review | guide | all
const ARG_CATEGORY = getArg('category') || 'all'; // formula | diapers | ... | all
const DRY_RUN = hasFlag('dry-run');

// ── Category config ──────────────────────────────────────────────────────────

const CATEGORY_LABELS = {
  formula:  { ar: 'حليب الأطفال',    en: 'Baby Formula' },
  diapers:  { ar: 'الحفاضات',        en: 'Diapers' },
  carseats: { ar: 'كراسي السيارة',   en: 'Car Seats' },
  bottles:  { ar: 'الرضاعات',        en: 'Bottles' },
  toys:     { ar: 'الألعاب التعليمية', en: 'Educational Toys' },
  care:     { ar: 'العناية بالطفل',  en: 'Baby Care' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

// Which content types to run
const TYPE_MAP = {
  best:   ['BEST_LIST'],
  review: ['PRODUCT_REVIEW'],
  guide:  ['BUYING_GUIDE'],
  all:    ['BEST_LIST', 'PRODUCT_REVIEW', 'BUYING_GUIDE'],
};

// ── Slug helpers ─────────────────────────────────────────────────────────────

function bestListSlug(categorySlug) {
  return `best-${categorySlug}-2026`;
}

function reviewSlug(productSlug) {
  return `review-${productSlug}`;
}

function buyingGuideSlug(categorySlug) {
  return `guide-${categorySlug}-buying`;
}

function productSlugFromName(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║       Content Sprint Engine              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  type:     ${ARG_TYPE}`);
  console.log(`  category: ${ARG_CATEGORY}`);
  console.log(`  dry-run:  ${DRY_RUN}`);
  console.log('');

  const types = TYPE_MAP[ARG_TYPE];
  if (!types) {
    console.error(`Unknown type "${ARG_TYPE}". Use: best | review | guide | all`);
    process.exit(1);
  }

  const categories =
    ARG_CATEGORY === 'all' ? ALL_CATEGORIES : [ARG_CATEGORY];

  const unknownCat = categories.find((c) => !ALL_CATEGORIES.includes(c));
  if (unknownCat) {
    console.error(`Unknown category "${unknownCat}". Use: ${ALL_CATEGORIES.join(' | ')}`);
    process.exit(1);
  }

  // Boot NestJS application context
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false, // suppress NestJS bootstrap noise
  });

  const coordinator = app.get(CoordinatorService);
  const prisma = app.get(PrismaService);

  // ── Step 1: Load products grouped by category slug ──────────────────────
  console.log('Loading products from database...');

  const products = await prisma.product.findMany({
    where: {
      category: {
        slug: { in: categories },
      },
    },
    include: {
      category: true,
      translations: { where: { locale: 'en' }, take: 1 },
    },
  });

  console.log(`Found ${products.length} product(s) across ${categories.length} category/categories.\n`);

  // Group by category slug
  const byCategory = {};
  for (const p of products) {
    const catSlug = p.category?.slug;
    if (!catSlug) continue;
    if (!byCategory[catSlug]) byCategory[catSlug] = [];
    byCategory[catSlug].push(p);
  }

  // ── Step 2: Load existing slugs to detect duplicates ────────────────────
  const existingPages = await prisma.contentPage.findMany({
    select: { slug: true },
  });
  const existingSlugs = new Set(existingPages.map((p) => p.slug));

  // ── Step 3: Build the plan ───────────────────────────────────────────────
  const plan = [];

  for (const catSlug of categories) {
    const catProducts = byCategory[catSlug] || [];
    const catLabel = CATEGORY_LABELS[catSlug];
    const catId = catProducts[0]?.categoryId || null;

    if (types.includes('BEST_LIST')) {
      if (catProducts.length >= 2) {
        const slug = bestListSlug(catSlug);
        plan.push({
          type: 'BEST_LIST',
          slug,
          topic: `أفضل ${catLabel.ar} للأطفال في السعودية 2026`,
          productIds: catProducts.map((p) => p.id),
          categoryId: catId,
          skip: existingSlugs.has(slug),
          skipReason: existingSlugs.has(slug) ? 'slug already exists' : null,
        });
      } else {
        plan.push({
          type: 'BEST_LIST',
          slug: bestListSlug(catSlug),
          topic: `أفضل ${catLabel.ar} للأطفال في السعودية 2026`,
          productIds: [],
          categoryId: catId,
          skip: true,
          skipReason: `only ${catProducts.length} product(s) — need 2+`,
        });
      }
    }

    if (types.includes('PRODUCT_REVIEW')) {
      for (const product of catProducts) {
        const enName =
          product.translations?.[0]?.name ||
          product.name ||
          `product-${product.id}`;
        const slug = reviewSlug(productSlugFromName(enName));
        plan.push({
          type: 'PRODUCT_REVIEW',
          slug,
          topic: `مراجعة ${product.name || enName}`,
          productIds: [product.id],
          categoryId: catId,
          skip: existingSlugs.has(slug),
          skipReason: existingSlugs.has(slug) ? 'slug already exists' : null,
        });
      }
    }

    if (types.includes('BUYING_GUIDE')) {
      if (catProducts.length >= 1) {
        const slug = buyingGuideSlug(catSlug);
        plan.push({
          type: 'BUYING_GUIDE',
          slug,
          topic: `دليل شراء ${catLabel.ar} للمواليد`,
          productIds: catProducts.map((p) => p.id),
          categoryId: catId,
          skip: existingSlugs.has(slug),
          skipReason: existingSlugs.has(slug) ? 'slug already exists' : null,
        });
      }
    }
  }

  // ── Step 4: Report plan ──────────────────────────────────────────────────
  const toRun = plan.filter((p) => !p.skip);
  const toSkip = plan.filter((p) => p.skip);

  console.log(`Plan: ${plan.length} total | ${toRun.length} to run | ${toSkip.length} to skip\n`);

  if (toSkip.length > 0) {
    console.log('SKIP:');
    for (const item of toSkip) {
      console.log(`  [SKIP] ${item.type.padEnd(14)} ${item.slug} — ${item.skipReason}`);
    }
    console.log('');
  }

  if (DRY_RUN) {
    console.log('DRY RUN — the following would be generated:');
    for (const item of toRun) {
      console.log(`  [PLAN] ${item.type.padEnd(14)} ${item.slug}`);
      console.log(`         topic: ${item.topic}`);
      console.log(`         products: ${item.productIds.length}`);
    }
    if (toRun.length === 0) console.log('  (nothing to generate)');
    console.log('');
    console.log('Dry run complete. No AI calls made.');
    await app.close();
    return;
  }

  // ── Step 5: Execute ──────────────────────────────────────────────────────
  const results = { planned: [], executed: [], skipped: [], errors: [] };

  for (const item of toSkip) {
    results.skipped.push({ slug: item.slug, reason: item.skipReason });
  }

  for (let i = 0; i < toRun.length; i++) {
    const item = toRun[i];
    console.log(`\n[${i + 1}/${toRun.length}] ${item.type} — ${item.slug}`);
    console.log(`  topic:    ${item.topic}`);
    console.log(`  products: ${item.productIds.length}`);

    results.planned.push({ slug: item.slug, type: item.type });

    try {
      const result = await coordinator.runContentPipeline(
        item.type,
        item.topic,
        item.slug,
        item.productIds,
        item.categoryId || undefined,
      );

      const published = result?.published?.published ?? false;
      console.log(`  → ${published ? 'PUBLISHED' : 'SAVED (not published)'}`);
      results.executed.push({ slug: item.slug, type: item.type, published });
    } catch (error) {
      console.error(`  → FAILED: ${error.message}`);
      results.errors.push({ slug: item.slug, type: item.type, error: error.message });
    }

    // Delay between API calls to avoid rate limits
    if (i < toRun.length - 1) {
      process.stdout.write('  (waiting 5s before next call...)');
      await new Promise((r) => setTimeout(r, 5000));
      process.stdout.write('\r                                    \r');
    }
  }

  // ── Step 6: Summary ──────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('CONTENT SPRINT RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`  Executed: ${results.executed.length}`);
  console.log(`  Skipped:  ${results.skipped.length}`);
  console.log(`  Errors:   ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const e of results.errors) {
      console.log(`  [FAIL] ${e.slug} — ${e.error}`);
    }
  }

  if (results.executed.length > 0) {
    console.log('\nPublished:');
    for (const e of results.executed) {
      console.log(`  [OK] ${e.type.padEnd(14)} ${e.slug}`);
    }
  }

  console.log('');

  await app.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
