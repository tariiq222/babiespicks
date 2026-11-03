# الترحيل الدولي وإمكانية قراءة القديم — Task 3

تاريخ التنفيذ المحلي: **2026-11-02** (Asia/Riyadh). المرجع: [الخطة](../superpowers/plans/2026-11-02-international-marketplaces.md#task-3-ترحيل-إضافي-وقابلية-قراءة-القديم) و[سياسة المصادر](market-data-sources.md). هذا المستند يصف ما نُفذ محليًا وما اختُبر فعلًا وما لم يُختبر. **لا commit/push/deploy، ولا كتابة على production أو أي قاعدة حقيقية بهذه المهمة.**

## الملفات

| الملف | الدور |
|---|---|
| `packages/db/prisma/schema.prisma` | 5 نماذج دولية + جدول ربط legacy + حقول `Store` الاختيارية وقيم التعداد الجديدة |
| `packages/db/prisma/migrations/202611020001_international_offers/migration.sql` | الترحيل الإضافي بعد آخر migration فعلية (`20261030002000_product_age_range`) |
| `scripts/operations/backfill-international.ts` | سكربت backfill: dry-run افتراضيًا، كتابة تتطلب `--apply` وهدفًا صريحًا |
| `scripts/operations/backfill-international.spec.ts` | الاختبار المركز: fixtures قديمة SAR بلا قاعدة + تكامل على قاعدة `_test` معزولة |
| `docs/operations/international-migration.md` | هذا المستند |

الخصائص (كوبونات Task 9) لم تُدرج في هذا الترحيل؛ Plan Task 9 يضيفها في migration نفسها **قبل التكامل**، فالحقول الناقصة هنا معلومة ومقصودة.

## الترحيل الإضافي

`202611020001_international_offers` ينشئ فقط:

- تعدادات: `MarketplaceCode`، `OfferCondition`، `OfferAudience`، `OfferPriceAvailability`، `OfferTaxBasis`، `DeliveryCountryCode`، `OfferDeliveryPrecision`، `OfferDeliveryState`.
- `stores` أربعة أعمدة **اختيارية** (`marketplaceCode`، `nameAr`، `nameEn`، `trackingId`) وفهرس على `marketplaceCode`. لا تعبئة من الاسم أو النطاق: `null` تعني سياقًا قديمًا غير معروف.
- `marketplace_listings`، `purchase_offers`، `offer_price_observations`، `offer_delivery_evidence`، `fx_snapshots`، و`legacy_price_mappings` (دفتر ربط الـbackfill فقط، بلا سعر أو عملة أو دليل توصيل).

ضمانات صوتية مبنية على قراءة ملف SQL:

- **لا `DROP`** لأي جدول/عمود/فهرس/قيد تاريخي، ولا `ALTER` لأعمدة المال في `product_prices` أو `coupons`، ولا `UPDATE` يغيّر عملة أو يعيد وسم مبلغ. مبلغ SAR يبقى SAR ولا يصبح USD.
- **لا كتابة صفوف**، لذا القراء القدامى يعملون كما هم قبل تفعيل الميزة.
- الجداول الجديدة تبدأ فارغة لأن كل سياسة مصدر `enabled:false` (Task 1).
- `offer_delivery_evidence` موجود لكن **لا شيء ينتجه اليوم**؛ `deliveryMaxAgeSeconds=null`، و`expiresAt` إلزامي لأي كاتب مستقبلي.

### الهوية والمبالغ

مفتاح الهوية canonical و**غير nullable** في كل جدول، و`@unique` عليه وحده، فلا يمكن تكرار صف عبر NULL:

| الجدول | `identityKey` |
|---|---|
| `marketplace_listings` | productId + storeId + marketplaceCode + asin + variantKey (variantKey `''` وليس NULL) |
| `purchase_offers` | listing + sellerKey + fulfillerKey + condition + audience + version |
| `offer_price_observations` | offer + scopeKey + shipTo + taxBasis + amount + currency |
| `offer_delivery_evidence` | offer + country + precision + state + sourceId + checkedAt |
| `fx_snapshots` | base + sourceId + asOf |
| `legacy_price_mappings` | productPriceId (unique) |

المبالغ `Decimal(20,6)` في الملاحظات (عام و`originalAmount`)، وأسعار الصرف decimal strings داخل `rates` JSON. السعر المجهول = `availability=UNKNOWN` و`amount=null` (لا `0`). `fulfillerKey` nullable لأنه غير مثبت، لكن لا يُشتق من نطاق السوق؛ التوقيع في `purchase_offers` يفصل البائع عن الشاحن والنسخة والجمهور.

## سكربت الـbackfill

```bash
# 1) dry-run (الافتراضي) — قراءة وتقرير فقط
tsx scripts/operations/backfill-international.ts            # يقرأ DATABASE_URL/TEST_DATABASE_URL المحلي

# 2) كتابة تتطلب --apply مع هدف صريح
tsx scripts/operations/backfill-international.ts --apply --database-url=postgresql://…/name_test
#    أو حاوية محلية خاصة بالسكربت تُنشأ وتهاجَر وتُستخدم ثم تُزال:
tsx scripts/operations/backfill-international.ts --apply --local-test-stack --port=55448
```

قيود الهدف (تُفرض في `parseBackfillTarget` قبل أي استعلام):

- بلا هدف صريح → رفض. `--apply` وحده لا يكفي.
- `--local-test-stack` يتطلب `localhost` واسم قاعدة ينتهي `_test`.
- أي هدف غير محلي يتطلب اسم قاعدة ينتهي `_test`؛ أسماء `postgres`/`template*`/`production`/`prod` وأي اسم يحتوي `prod` مرفوضة، وكذلك مضيفات الإدارة السحابية المعروفة (`supabase`, `neon`, `rds.amazonaws.com`, …).
- التقرير يذكر الهدف بعد إخفاء كلمة المرور (`postgresql://***@host/db`) ولا يطبع أي سر.

### ماذا يفعل وماذا لا يفعل

- يعمل لكل (منتج × متجر): listing واحد، offer واحد (`sellerKey=legacy-unverified-seller`, `condition=UNKNOWN`, `audience=PUBLIC`, `version=1`)، ثم ملاحظة لكل صف `product_prices` مختلف.
- **لا تحويل ولا تغيير عملة**: يُنسخ المبلغ والعملة كما هما، وفقط عندما تكون العملة `SAR` حرفيًا. أي صف بعملة أخرى يبقى legacy ويُعدّ في التقرير.
- **لا دمج منتجين**: الهوية تحمل `productId`، و`legacy_price_mappings` يثبت ربط كل صف قديم بعرضه.
- المجال (marketplace) من رابط المصدر نفسه فقط وبعد فحص allowlist النطاقات؛ لا من الاسم، ولا من النطاق المجرد (`amazon.sa/`)، ولا من ASIN داخل query. غياب ASIN canonical أو اختلاف سوق داخل المتجر نفسه → المجموعة كلها legacy.
- `shipTo=null`، `scopeKey=legacy-sar-in-marketplace`، لا حالة توصيل ولا برايم ولا شحن مجاني، ولا FX.
- `taxBasis` افتراضي `UNKNOWN` ولا يُفترض شمول الضريبة.
- **المصدر لا يُختلق**: `sourceId=legacy-sar-backfill` معلن أنه ليس سياسة مصدر مسجلة في Task 1، و`sourceUrl` هو رابط الصف القديم نفسه. سياسات Task 1 كلها `enabled:false`، فهذه الكتابة لا تفعّل مصدرًا ولا نشرًا.
- العمر: `expiresAt = checkedAt + max-age` بحد أقصى **3600 ثانية** (احتفاظ محتوى العرض في Task 1)؛ `--max-age-seconds` لا يتجاوزه، وقيمة صفرية تُخزي فورًا. صف قديم جدًا يُخزَّن منتهيًا لا مجدَّدًا.
- **dry-run يعيد counts للصفوف القابلة للترحيل** (`migrated` في وضع القراءة = المخطط له) و`converted=0`, `merged=0`, `deliveryEvidenceCreated=0`, `fxSnapshotsCreated=0`.
- **إعادة التشغيل آمنة**: الـlisting والـoffer لا يُحدَّثان إن وُجدا (`update: {}`)، والصف القديم لا يُنسخ مرتين بفضل `legacy_price_mappings`؛ ملاحظة موجودة بمعرّفها تُربط بدل تكرارها.
- النتائج `legacyRecords` محدودة بـ200 مع `legacyRecordsTruncated` حتى لا تفيض السجلات. `legacy` في counts هو العدد الكامل.

### السجلات الملتبسة (تبقى legacy)

- منتج مفقود، أو متجر مفقود.
- عملة غير SAR.
- بلا `url`، أو رابط غير عميق/غير معتمد (بحث، صفحة مساعدة، نطاق آخر، مزيّف)، أو بلا ASIN canonical.
- صفوف متجر واحد تتناقض في السوق.

## ما نُفذ وقيس فعلًا

### قاعدة محلية معزولة (ليست production ولا قاعدة حقيقية)

- حاوية مؤقتة `docker run --rm --name bp-intl-migrate-probe -p 127.0.0.1:55439:5432 postgres:16-alpine`، ثم أُزيلت بعد النهاية. لم يُلمس `DATABASE_URL` ولا أي قاعدة قائمة على الجهاز (`sawa-postgres` لم يُقرأ).
- **مخطط ما قبل التغيير** أُعاد بناؤه من schema.prisma الحالي بأزالة الأجزاء الجديدة (`prisma migrate diff --from-empty --to-schema-datamodel`)، ثم طُبق المخطط القديم، ثم `migration.sql` الجديد، ثم `prisma migrate diff --from-url … --to-schema-datamodel …` أعاد **"This is an empty migration"** أي أن المخطط بعد الترحيل مطابق للـschema تمامًا.
- إدخال `product_prices` SAR القديمة وقراءتها عبر Prisma Client المولَّد: نفس الـproductId والـslug والمبلغ (`149.5`) والعملة (`SAR`) والرابط؛ أعمدة `Store` الجديدة `null`.
- `prisma migrate deploy` جرّب بمحاكاة تاريخ ترحيلات سابقة في `_prisma_migrations` (بدون `checksum` حقيقي، لذا نُفِّذ على قاعدة بلا تاريخ فعلي): طُبق الترحيل الجديد بنجاح، وإعادة التشغيل قالت "No pending migrations".
- اختبارات القيود على PostgreSQL 16: `identityKey` مرفوض `NULL`، مفتاح مكرر مرفوض، `Decimal(20,6)` يقبل `12345678901234.123456` ويرفض `10^14` (numeric field overflow)، ويقرّب المنزلة السابعة.
- إعادة لعب migrations في Migrations مباشرة أظهرت أن ترحيلات `2026102*`/`2026103*` القائمة **ليست** idempotent (`ADD COLUMN` بلا `IF NOT EXISTS`)؛ لذلك الجديد يستخدم `IF NOT EXISTS`/`DO $$ … duplicate_object` حتى يكون إضافيًا حتى على قاعدة تحتوي بعض الكائنات.

### الاختبار والتحقق

```bash
# Offline: fixtures قديمة فقط، بلا قاعدة
pnpm exec vitest run scripts/operations/backfill-international.spec.ts        # 10 passed, 6 skipped
# على قاعدة _test معزولة
TEST_DATABASE_URL=postgresql://…/babiespicks_simplification_test pnpm exec vitest run scripts/operations/backfill-international.spec.ts   # 16 passed
pnpm db:generate
pnpm --filter @babiespicks/db type-check        # exit 0
pnpm --filter @babiespicks/domain type-check    # exit 0
pnpm --filter @babiespicks/web type-check        # exit 0
pnpm --filter @babiespicks/mcp type-check        # exit 0
```

- مجموعة كاملة بلا قاعدة: `25 passed | 3 skipped` (ملفات)، `173 passed | 76 skipped`.
- المجموعات المعتمدة على قاعدة، **متسلسلة** على `babiespicks_simplification_test` المعزولة: `35 passed` (`domain.spec.ts`, `migration.spec.ts`, `backfill-international.spec.ts`, `postgres.integration.test.ts`)، والكل معًا `27 passed | 1 skipped`، `194 passed | 55 skipped`.
- ملاحظتان صدقيتان: (1) تشغيل مجموعات قاعدة البيانات **بالتوازي** على القاعدة نفسها يفشل في اختبارات قائمة (`migration.spec.ts` تعتمد على صفوف تبقى من اختبار سابق، وMCP test يقصر على اسم `simplification_test`)؛ هذه ليست مشكلة في الترحيل، لذا صرنا نستخدم `--fileParallelism=false` أو قاعدة لكل ملف. (2) dry-run عبر الـCLI يقرأ `DATABASE_URL`/`TEST_DATABASE_URL` فقط؛ لا يوجد علم `--database-url` في وضع القراءة، فاستخدم متغير البيئة أو `--apply` مع هدف.

## rollback وإمكانية قراء القديم

- التراجع = **تعطيل الميزة** (إيقاف الكاتب الجديد والميزة `internationalOffers.enabled:false`) مع إبقاء الجداول والأعمدة والبيانات. لا down migration تحذفها، ولا حذف أعمدة `Store`، ولا إعادة تفسير أسعار أجنبية كريال.
- القراء القدامى لم تتغير واجهتهم: `productPrice`, `product.store`, `product.prices` تعمل كما هي (مثبتة على قاعدة معزولة)، والقراء الجدد يميّزون legacy عبر `store.marketplaceCode=null` وغياب أي listing/observation.
- حجب أي بيانات مقيدة الاحتفاظ لا يتم في Backfill: لا ينسخ إلا صفوف `product_prices` المحلية الموجودة مسبقًا، ولا ينسخ محتوى مصدر لم يُعتمد (سياسة Task 1 تمنع ذلك أصلًا لأن كل المصادر معطلة).

## ما لم يُختبر / مخاطر معلومة

- [not tested] الترحيل على قاعدة production أو نسخة إنتاجية أو تاريخ `_prisma_migrations` حقيقي. الاختبار كان على مخطط قديم مُعاد بناؤه محليًا وعلى قاعدة فارغة. قبل أي طرح: backup، ثم restore معزول، ثم comparison لـ`prisma migrate diff` على نسخة الإنتاج.
- [not tested] الأداء على `product_prices` كبيرة: السكربت يعمل داخل معاملة واحدة بحد 120 ثانية، ويقرأ كل الصفوف. يحتاج قياسًا قبل تشغيله على نسخة إنتاجية.
- [known gap] حقل الكوبونات متعدد العملات (Task 9) غير موجود في هذا الترحيل، ومطلوب إدراجه في migration نفسه قبل التكامل مع Task 9.
- [known gap] لا كاتب يستخدم هذه الجداول بعد (Task 4)؛ الكتابة المتوقعة اليوم هي backfill محلي فقط.
- [design limit] صفان SAR لنفس المنتج/المتجر بمبالغ مختلفة يُخزَّنان كملاحظتين (تاريخ كامل)؛ القراء يقارنون الأحدث فقط. صفان بنفس المبلغ والعملة واللحظة يندمجان في هوية واحدة لأن لا معلومة تفصل بينهما.
- [design limit] عقد القراءة العام (Task 7) لم يُوصل بهذه الجداول بعد، لذا لا يوجد أي عرض عام جديد من البيانات الدولية.
