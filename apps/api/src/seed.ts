import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const STORES = [
  { name: 'نون', slug: 'noon', url: 'https://noon.com', affiliateNetwork: 'ArabClicks' },
  { name: 'أمازون السعودية', slug: 'amazon-sa', url: 'https://amazon.sa', affiliateNetwork: 'Amazon Associates' },
  { name: 'ممزورلد', slug: 'mumzworld', url: 'https://mumzworld.com', affiliateNetwork: 'Admitad' },
  { name: 'صيدلية النهدي', slug: 'nahdi', url: 'https://nahdionline.com', affiliateNetwork: null },
];

const CATEGORIES = [
  { name: 'حليب الأطفال', slug: 'formula', description: 'حليب صناعي للرضع والأطفال' },
  { name: 'الحفاضات', slug: 'diapers', description: 'حفاضات لجميع الأعمار' },
  { name: 'كراسي السيارة', slug: 'carseats', description: 'كراسي أمان للأطفال في السيارة' },
  { name: 'الرضاعات', slug: 'bottles', description: 'رضاعات وإكسسوارات الرضاعة' },
  { name: 'ألعاب تعليمية', slug: 'toys', description: 'ألعاب تعليمية وتنموية' },
  { name: 'العناية بالطفل', slug: 'care', description: 'منتجات عناية بالبشرة والشعر' },
];

const PRODUCTS = [
  {
    name: 'Aptamil Stage 1 900g',
    slug: 'aptamil-stage-1',
    brand: 'Aptamil',
    category: 'formula',
    store: 'noon',
    sourceUrl: 'https://www.amazon.sa/dp/B07GZLMKN5',
    price: 89, originalPrice: 125,
    nameAr: 'حليب أبتاميل المرحلة الأولى 900 جرام',
    descAr: 'حليب أبتاميل مرحلة أولى للرضع من الولادة حتى 6 شهور. غني بـ DHA و ARA لدعم نمو الدماغ.',
    nameEn: 'Aptamil Stage 1 Baby Formula 900g',
    descEn: 'Aptamil Stage 1 infant formula from birth to 6 months. Rich in DHA and ARA for brain development.',
    verdict: { type: 'WORTH_IT' as const, overall: 8.7, safety: 9.2, quality: 8.8, reviews: 8.5, price: 8.0, longTerm: 8.5 },
    reasonAr: 'منتج موثوق بسجل سلامة ممتاز، شهادات أوروبية كاملة، وتقييمات إيجابية من 234 أم سعودية.',
    reasonEn: 'Trusted product with excellent safety record, full European certifications, and positive reviews from 234 Saudi mothers.',
  },
  {
    name: 'Hipp Bio Stage 1 800g',
    slug: 'hipp-bio-stage-1',
    brand: 'Hipp',
    category: 'formula',
    store: 'amazon-sa',
    sourceUrl: 'https://www.amazon.sa/dp/B00JLN3KVC',
    price: 115, originalPrice: null,
    nameAr: 'حليب هيب بيو المرحلة الأولى 800 جرام',
    descAr: 'حليب عضوي من أبقار ترعى في مزارع عضوية معتمدة. خالي من المواد المعدلة وراثياً.',
    nameEn: 'Hipp Bio Organic Stage 1 800g',
    descEn: 'Organic formula from organically raised cows. Free from GMOs and artificial additives.',
    verdict: { type: 'WORTH_IT' as const, overall: 9.2, safety: 9.5, quality: 9.3, reviews: 8.8, price: 7.5, longTerm: 9.0 },
    reasonAr: 'أعلى درجة أمان في فئته. عضوي 100٪ مع شهادات EU-Bio. السعر أعلى لكن الجودة تبرره.',
    reasonEn: 'Highest safety score in its category. 100% organic with EU-Bio certifications. Higher price justified by quality.',
  },
  {
    name: 'NAN Optipro 1 400g',
    slug: 'nan-optipro-1',
    brand: 'Nestlé NAN',
    category: 'formula',
    store: 'noon',
    sourceUrl: 'https://www.amazon.sa/dp/B084TGBQ8J',
    price: 62, originalPrice: 75,
    nameAr: 'حليب نان أوبتي برو المرحلة الأولى 400 جرام',
    descAr: 'تركيبة متطورة مع بروتين OPTIPRO المحسّن وبريبيوتيكس BL لصحة الأمعاء.',
    nameEn: 'NAN Optipro Stage 1 400g',
    descEn: 'Advanced formula with optimized OPTIPRO protein and BL prebiotics for gut health.',
    verdict: { type: 'WORTH_IT' as const, overall: 8.4, safety: 8.8, quality: 8.5, reviews: 8.2, price: 8.5, longTerm: 8.0 },
    reasonAr: 'خيار متوازن بسعر معقول. تركيبة محسّنة من نستله مع سجل طويل في السوق السعودي.',
    reasonEn: 'Balanced choice at a reasonable price. Improved Nestlé formula with a long track record in the Saudi market.',
  },
  {
    name: 'Pampers Premium Care Size 4',
    slug: 'pampers-premium-care-4',
    brand: 'Pampers',
    category: 'diapers',
    store: 'noon',
    sourceUrl: 'https://www.amazon.sa/dp/B07GZLMKN6',
    price: 115, originalPrice: 145,
    nameAr: 'حفاضات بامبرز برميوم كير مقاس 4',
    descAr: 'حفاضات فائقة النعومة مع قنوات امتصاص وخاصية عدم التسريب لمدة 12 ساعة.',
    nameEn: 'Pampers Premium Care Size 4 Diapers',
    descEn: 'Ultra-soft diapers with absorption channels and 12-hour leak protection.',
    verdict: { type: 'WORTH_IT' as const, overall: 8.4, safety: 9.0, quality: 8.7, reviews: 8.3, price: 7.2, longTerm: 8.2 },
    reasonAr: 'أفضل حفاضات من حيث النعومة والامتصاص. السعر أعلى من المنافسين لكن الجودة تستحق.',
    reasonEn: 'Best diapers for softness and absorption. Higher price than competitors but quality is worth it.',
  },
  {
    name: 'Chicco NextFit Car Seat',
    slug: 'chicco-nextfit',
    brand: 'Chicco',
    category: 'carseats',
    store: 'mumzworld',
    sourceUrl: 'https://www.amazon.sa/dp/B01BYBFGOE',
    price: 899, originalPrice: 1200,
    nameAr: 'كرسي سيارة شيكو نكست فيت',
    descAr: 'كرسي سيارة قابل للتحويل من حديثي الولادة حتى 30 كجم. 9 أوضاع إمالة.',
    nameEn: 'Chicco NextFit Convertible Car Seat',
    descEn: 'Convertible car seat from newborn to 30kg. 9 recline positions.',
    verdict: { type: 'WORTH_IT_WITH' as const, overall: 7.2, safety: 8.5, quality: 7.8, reviews: 7.0, price: 5.5, longTerm: 7.5 },
    reasonAr: 'كرسي ممتاز من حيث الأمان لكن السعر مرتفع. يستاهل إذا لقيتيه بخصم 25٪+.',
    reasonEn: 'Excellent safety but expensive. Worth it if you find it at 25%+ discount.',
    conditionsAr: ['اشتريه بخصم 25٪ أو أكثر', 'تأكدي من التوافق مع سيارتك'],
    conditionsEn: ['Buy at 25% or more discount', 'Verify compatibility with your car'],
  },
  {
    name: 'Philips Avent Natural Glass',
    slug: 'philips-avent-glass',
    brand: 'Philips Avent',
    category: 'bottles',
    store: 'noon',
    sourceUrl: 'https://www.amazon.sa/dp/B00MGMHHL8',
    price: 55, originalPrice: 69,
    nameAr: 'رضّاعة فيليبس أفنت الزجاجية',
    descAr: 'رضاعة زجاجية مقاومة للحرارة مع حلمة طبيعية تحاكي الرضاعة الطبيعية.',
    nameEn: 'Philips Avent Natural Glass Bottle',
    descEn: 'Heat-resistant glass bottle with natural nipple that mimics breastfeeding.',
    verdict: { type: 'WORTH_IT' as const, overall: 8.1, safety: 9.2, quality: 8.5, reviews: 7.8, price: 7.0, longTerm: 8.0 },
    reasonAr: 'زجاج = أمان أعلى من البلاستيك. الحلمة الطبيعية تسهل التنقل بين الثدي والرضاعة.',
    reasonEn: 'Glass = higher safety than plastic. Natural nipple eases transition between breast and bottle.',
  },
  {
    name: 'Johnson Baby Oil Almond',
    slug: 'johnson-baby-oil-almond',
    brand: 'Johnson & Johnson',
    category: 'care',
    store: 'nahdi',
    sourceUrl: 'https://www.amazon.sa/dp/B000GCFK3E',
    price: 32, originalPrice: null,
    nameAr: 'مرطّب جونسون بزيت اللوز',
    descAr: 'زيت ترطيب للأطفال بتركيبة زيت اللوز الحلو. خفيف ولطيف على البشرة.',
    nameEn: 'Johnson Baby Oil with Almond',
    descEn: 'Baby moisturizing oil with sweet almond oil formula. Light and gentle on skin.',
    verdict: { type: 'WAIT' as const, overall: 5.8, safety: 5.5, quality: 6.0, reviews: 6.5, price: 8.0, longTerm: 4.5 },
    reasonAr: 'يحتوي على معادن بترولية (mineral oil). فيه بدائل طبيعية أفضل بنفس السعر تقريباً.',
    reasonEn: 'Contains mineral oil. There are better natural alternatives at nearly the same price.',
  },
  {
    name: 'Bebelac Stage 1 400g',
    slug: 'bebelac-stage-1',
    brand: 'Bebelac',
    category: 'formula',
    store: 'noon',
    sourceUrl: 'https://www.amazon.sa/dp/B07HGZBVFQ',
    price: 39, originalPrice: 45,
    nameAr: 'حليب بيبيلاك المرحلة الأولى 400 جرام',
    descAr: 'تركيبة اقتصادية مع FOS/GOS لدعم الجهاز الهضمي. متوفر بسعر مناسب.',
    nameEn: 'Bebelac Stage 1 400g',
    descEn: 'Economical formula with FOS/GOS for digestive support. Available at an affordable price.',
    verdict: { type: 'WORTH_IT' as const, overall: 7.8, safety: 8.2, quality: 7.5, reviews: 7.8, price: 9.2, longTerm: 7.0 },
    reasonAr: 'أفضل قيمة مقابل المال. تركيبة أساسية جيدة بسعر اقتصادي. مثالي للميزانيات المحدودة.',
    reasonEn: 'Best value for money. Good basic formula at an economical price. Ideal for limited budgets.',
  },
  {
    name: 'Fisher-Price Laugh & Learn',
    slug: 'fisher-price-laugh-learn',
    brand: 'Fisher-Price',
    category: 'toys',
    store: 'amazon-sa',
    sourceUrl: 'https://www.amazon.sa/dp/B01NAAFYOK',
    price: 145, originalPrice: 189,
    nameAr: 'لعبة فيشر برايس التعليمية',
    descAr: 'لعبة تفاعلية تعليمية تعلم الأحرف والأرقام والألوان بـ 3 مستويات تعلم.',
    nameEn: 'Fisher-Price Laugh & Learn Smart Stages',
    descEn: 'Interactive learning toy teaching letters, numbers, and colors with 3 learning levels.',
    verdict: { type: 'WORTH_IT_WITH' as const, overall: 7.4, safety: 8.0, quality: 7.5, reviews: 7.2, price: 6.8, longTerm: 7.0 },
    reasonAr: 'لعبة ممتازة لكنها بالإنجليزي فقط. يستاهل إذا تبين تأسيس طفلك بالإنجليزي مبكراً.',
    reasonEn: 'Excellent toy but English-only. Worth it if you want early English foundation for your child.',
    conditionsAr: ['مناسبة إذا تريدين تعليم الإنجليزي مبكراً', 'الأفضل لعمر 6-36 شهر'],
    conditionsEn: ['Suitable if you want early English learning', 'Best for ages 6-36 months'],
  },
  {
    name: 'Sudocrem Antiseptic Cream',
    slug: 'sudocrem-antiseptic',
    brand: 'Sudocrem',
    category: 'care',
    store: 'nahdi',
    sourceUrl: 'https://www.amazon.sa/dp/B000GCFK3F',
    price: 18, originalPrice: null,
    nameAr: 'كريم سودوكريم المطهر لحفاض الأطفال',
    descAr: 'كريم متعدد الاستخدامات لعلاج والوقاية من التهابات الحفاض.',
    nameEn: 'Sudocrem Antiseptic Healing Cream',
    descEn: 'Multi-purpose cream for treating and preventing diaper rash.',
    verdict: { type: 'NOT_WORTH_IT' as const, overall: 4.2, safety: 4.5, quality: 4.0, reviews: 5.0, price: 8.5, longTerm: 3.0 },
    reasonAr: 'يحتوي على أكسيد الزنك بتركيز منخفض. بدائل أفضل بنفس السعر مثل كريم ديسيتين.',
    reasonEn: 'Contains low-concentration zinc oxide. Better alternatives at the same price like Desitin cream.',
  },
];

async function seed() {
  console.log('Seeding database...');

  // Create stores
  for (const store of STORES) {
    await prisma.store.upsert({
      where: { slug: store.slug },
      update: {},
      create: store,
    });
  }
  console.log(`✓ ${STORES.length} stores`);

  // Create categories
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log(`✓ ${CATEGORIES.length} categories`);

  // Create products with verdicts
  for (const p of PRODUCTS) {
    const category = await prisma.category.findUnique({ where: { slug: p.category } });
    const store = await prisma.store.findUnique({ where: { slug: p.store } });

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        brand: p.brand,
        categoryId: category!.id,
        storeId: store!.id,
        sourceUrl: p.sourceUrl,
        dataSource: 'MANUAL',
        confidence: 1.0,
        isActive: true,
        updatedAt: new Date(),
        translations: {
          create: [
            { locale: 'ar', name: p.nameAr, description: p.descAr, slug: p.slug },
            { locale: 'en', name: p.nameEn, description: p.descEn, slug: p.slug },
          ],
        },
        prices: {
          create: {
            storeId: store!.id,
            price: p.price,
            originalPrice: p.originalPrice,
            currency: 'SAR',
          },
        },
        verdict: {
          create: {
            type: p.verdict.type,
            overallScore: p.verdict.overall,
            safetyScore: p.verdict.safety,
            qualityScore: p.verdict.quality,
            reviewsScore: p.verdict.reviews,
            priceScore: p.verdict.price,
            longTermScore: p.verdict.longTerm,
            reasoningAr: p.reasonAr,
            reasoningEn: p.reasonEn,
            conditionsAr: (p as any).conditionsAr || null,
            conditionsEn: (p as any).conditionsEn || null,
            isPublished: true,
            updatedAt: new Date(),
          },
        },
      },
    });

    console.log(`  ✓ ${p.nameAr} (${p.verdict.type}: ${p.verdict.overall}/10)`);
  }

  console.log(`\n✓ ${PRODUCTS.length} products seeded with verdicts`);
  console.log('Done!');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
