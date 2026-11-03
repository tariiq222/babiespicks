# Global Amazon Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the dependency-bound core, or superpowers:subagent-driven-development for explicitly assigned independent packages. Steps use checkbox (`- [ ]`) syntax for tracking. This is a plan, not authorization to implement, commit, push, merge, deploy, alter external schedules, or write production data.

**Goal:** تحويل BabiesPicks إلى واجهة عالمية لعروض أمازون، تدعم التوصيل للسعودية وأمريكا أولًا، وتعرض العملات والأسعار والشحن وبرايم بوضوح، مع تحديث إيجنت المحتوى ومحدّث الأسعار ضمن التسليم.

**Architecture:** يبقى Next.js للويب، وMCP مستقلًا للإدارة، وPostgreSQL للبيانات. تملك `packages/domain` عقود المال والعرض واختيار السعر والتوصيل ورابط المتجر. تُضاف نماذج متوافقة للعرض والملاحظات والأدلة وأسعار الصرف؛ لا تغيير لمنطق التحرير أو صلاحيات النشر ضمنيًا.

**Tech Stack:** Node.js 22+، pnpm 10.11.0، TypeScript، Next.js 16، React 19، next-intl 4، Zod 4، Prisma 6، PostgreSQL 16، Hono وMCP SDK، Vitest. لا مزود مدفوع أو اعتماد جديد إلزامي في هذه الخطة.

**Spec:** [التصميم والتحليل](../../architecture/target-design.md)، [تعليمات الإيجنت](../../operations/content-agent-instructions.md)، وتعليمات `AGENTS.md` الحاكمة. حالة التصميم `INCOMPLETE` لتكامل المصادر؛ Task 1 يغلق هذه الفجوة أو يحدد الأسواق التي تبقى معطلة.

## Global Constraints

- القرار المعتمد: هوية عالمية؛ وجهتا البداية `SA` و`US`؛ اللغة `ar` أو `en` مستقلة؛ أي سوق أمازون مؤهل؛ برايم غير مطلوب.
- مقترح الخطة: SAR وUSD لعملة العرض؛ حفظ العملات الأصلية للأسواق المعتمدة؛ لا تحديد وجهة إلزامي عبر IP أو GPS.
- لا حساب إجمالي واصل مضمون، أو عضوية أمازون، أو إعادة توجيه OneLink تلقائية في الإصدار الأول.
- تحفظ المعرفات والـslugs والعناوين القديمة والتحويلات الخاصة بالصفحات المتقاعدة؛ لا تعود أدوات المقارنة/التصنيفات/التحرير كصفحات عامة.
- لا بيانات عامة قبل شرط `publishStatus=PUBLISHED`، ولا نشر من static token، ولا توسيع إذن النشر بالتعليمات.
- الترحيل إضافي؛ لا حذف جداول تاريخية أو بيانات، ولا إعادة وسم مبلغ SAR على أنه USD، ولا دمج اعتمادًا على تشابه العناوين.
- أحدث ملاحظة في السياق تسبق فحص الصلاحية والتوفر؛ لا رجوع إلى سعر أقدم لإخفاء أحدث حالة غير صالحة.
- الأصل المالي Decimal؛ الحساب الدقيق قبل تقريب العرض؛ المجهول `null` وليس صفرًا؛ لغة المستخدم لا تحدد وجهته أو عملته تلقائيًا.
- حقائق السعر والشحن والعضوية من مصادر مسموحة ومؤرخة؛ لا نموذج يولدها، ولا تتغير التقييمات التحريرية مع FX أو تحديث السعر.
- التعليمات الحالية لـ`bp_record_price` تبقى SAR-only حتى إطلاق عقد جديد مصرح. التحضير لخطة دولية لا يغير العقد الجاري.
- اختبارات الكتابة على localhost وقاعدة ينتهي اسمها `_test` فقط. اختبار MCP الحالي يشترط أيضًا احتواء الاسم `simplification_test`؛ استخدم `babiespicks_simplification_test` للقبول المشترك.
- لا اختبارات شراء أو ضغط مصطنعة أو fixtures إنتاجية. فشل cache بعد حفظ الكتابة warning ويُعاد الإبطال فقط.
- لا commit/push/merge/deploy أو تغيير مهمة خارجية أو تفعيل كاتب آخر بسبب هذه الخطة وحدها؛ تفويض التنفيذ لاحقًا يحتفظ بحدوده.

## Review Focus

1. تغيير الوجهة أو العملة في تبويب لا يترك بطاقة مساعد أو رابط شراء من سياق سابق بلا تنبيه؛ يختبر في Tasks 8 و10.
2. أدلة بائع/شاحن لا تنتقل إلى Buy Box آخر أو نسخة مختلفة؛ يختبر في Tasks 4 و6 و7.
3. سعر شامل ضريبة ومجهول/غير شامل لا ينتجان فائزًا ماليًا مختلقًا؛ يختبر في Tasks 6 و8.
4. timeout بعد نجاح الكتابة لا يولد ملاحظة جديدة أو يغيّر التفويض؛ يختبر في Tasks 4 و11.
5. ترحيل بيانات قديمة أو rollback لا يحوّل العملة أو يثبت وجهة مجهولة ولا يكسر روابط المنتج؛ يختبر في Tasks 3 و7 و12.

---

## حدود العمل والحالة الحالية

الخطة أُعدت على `main` عند `a6c732ae8922cef1c63a18030242a095cf60620b` مع التعديلات المحلية القائمة من مهمة النصوص والتحليل. افحص Git مجددًا عند التنفيذ؛ لا تستبدل تلك التعديلات أو تعمل بالتوازي مع كاتب على الملفات نفسها. لا تنقل تغييرات غير متعلقة إلى إصدار الميزة.

هذه الوثيقة تحسم واجهات داخلية مقترحة حتى يمكن التنفيذ دون إعادة التصميم كل مهمة. اختيار مزود البيانات وإجازة استخدامه ليستا مثبتتين. أسماء الأدوات والنماذج الجديدة هنا **مخطط لها** ولا تعني وجودها في الخدمة الحالية.

تتكون الخطة من مسار تأسيسي متسلسل، ثم مستهلكين يمكن فصل ملكيتهم، ثم قبول وطرح واحد. القرار الحالي `inline` للتخطيط والعقود والمحرك؛ عند التنفيذ يمكن `partial` بتفويض حزمة الكوبونات أو المساعد بعد ثبات الواجهات، بمورد اختبار معزول لكل كاتب. لا تفويض آلي في هذه الخطوة.

## خريطة الملكية والملفات

| الحزمة | الملفات الحالية أو الجديدة | مسؤوليتها |
|---|---|---|
| إعداد الأسواق والمصادر | `packages/domain/src/marketplaces.ts`، `source-policy.ts`، `docs/operations/market-data-sources.md` | النطاقات الرسمية والعملات المصدرية والسياسات والتفعيل |
| العقود | `packages/domain/src/international-contracts.ts`، `contracts.ts`، `index.ts` | أنواع المال والسياق وأدوات الإدارة وقدراتها |
| التخزين | `packages/db/prisma/schema.prisma`، migration جديدة بعد آخر migration فعلية | القوائم والعروض والأدلة والأسعار والانتقال الإضافي |
| الكتابة | `packages/domain/src/offer-mutations.ts`، `apps/mcp/src/server.ts` و`registry.ts` عند الحاجة | صلاحيات وتزامن وإعادة محاولة ونقل الأدوات |
| الصرف والتحديث | `packages/domain/src/money.ts`، `fx.ts`، `scripts/operations/refresh-market-data.ts` | تحويل دقيق وتحديث من مصدر معتمد |
| الاختيار | `packages/domain/src/offer-selection.ts`، `prices.ts` | الأحدث والأهلية والمقارنة والرجوع المتوافق |
| القراءة والشراء | `apps/web/src/server/public-queries.ts`، `purchase-handler.ts`، مسار `/go/offer/[offerId]` الجديد | إسقاط آمن وعرض محدد وروابط قديمة |
| تجربة الويب | `shopping-context.ts`، مكونات السياق والمال والبطاقات والتفاصيل والفلاتر | لغة ووجهة وعملة مستقلة وعرض متسق |
| الكوبونات | schema والعقود و`coupons-client.tsx` و`coupons.ts` ومسارات API | عملة وشروط وانتهاء صحيح |
| مساعد الموقع | `apps/web/src/server/chat/*`، `api/chat/route.ts`، `chat-widget.tsx` | قراءة العروض والميزانية بسياقها |
| الإيجنت الخارجي | `AGENTS.md`، `docs/operations/content-agent-instructions.md`، `apps/mcp/README.md`، `automation.md` | تعليمات المشروع ومهمة الأسعار ومزامنتهما |
| القبول والتسليم | اختبارات Vitest القائمة والجديدة، `scripts/operations/international-acceptance.ts`، أدلة الإصدار | دورة كاملة محلية ثم طرح مصرح |

## الواجهات المشتركة المقترحة

تُعرّف هذه الأنواع وتصدّر من ملف لا يعتمد على Prisma أو أسرار حتى تستطيع الواجهة استعمالها. لا تُمرَّر كائنات Decimal الخاصة بالخادم إلى React أو JSON.

```ts
type DeliveryCountry = 'SA' | 'US';
type DisplayCurrency = 'SAR' | 'USD';
type Money = { amount: string; currency: string }; // decimal canonical; ISO code from approved registry
type FxSnapshot = {
  id: string; base: string; rates: Record<string, string>;
  sourceId: string; asOf: string; expiresAt: string;
};
type ShoppingContext = {
  locale: 'ar' | 'en'; shipTo: DeliveryCountry | null;
  displayCurrency: DisplayCurrency | null;
  budget: Money | null; audience: 'PUBLIC';
};
type TaxBasis = 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
type DeliveryState = 'OBSERVED_AVAILABLE' | 'OBSERVED_UNAVAILABLE' | 'UNKNOWN';
type OfferQuote = {
  offerId: string; observationId: string; productId: string;
  marketplaceCode: string; listingId: string;
  sellerKey: string; fulfillerKey: string;
  price: Money; originalPrice: Money | null;
  convertedPrice: Money | null; fxSnapshotId: string | null;
  taxBasis: TaxBasis; checkedAt: string; expiresAt: string;
  audience: 'PUBLIC' | 'MEMBERS';
  delivery: { state: DeliveryState; country: DeliveryCountry | null;
    precision: 'COUNTRY' | 'POSTAL_SAMPLE' | 'UNKNOWN'; checkedAt: string | null };
  comparisonGroup: string | null;
};
type OfferSelection = {
  quotes: OfferQuote[]; pendingDelivery: OfferQuote[];
  bestByGroup: Record<string, string>; // group -> offerId; never cross incompatible tax/context groups
  reason: 'OK' | 'NO_ELIGIBLE_OFFER' | 'NO_COMPARABLE_PRICE';
  contextKey: string; fxSnapshotId: string | null;
};
```

قيمة `displayCurrency:null` تعني عرض الأصل. `sellerKey` و`fulfillerKey` غير المعروفين مفاتيح صريحة لسياق مصدر بعينه، وليسا هوية مشتركة تدمج بائعين مجهولين. لا نُدخل أسعار أعضاء في `bestByGroup` للعامة. لا توجد عملة افتراضية تُستنتج من `locale`.

## تسلسل الاعتماد

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 10 → 11 → 12`، مع `9 → 10`.

Task 9 يعتمد على 2 و3 و4 و5، ويمكن تنفيذه منفصلًا بعد تثبيت هذه العقود مع تنسيق ملكية schema/contracts. Task 10 يعتمد على 6 و7 وعقد سياق Task 8. يكتمل دليل الإيجنت الخارجي عند 11 قبل السماح بالتفعيل في 12. يمكن إكمال الحسابات والواجهات محليًا ببيانات مصطنعة إذا تعذر المصدر؛ يظل تفعيل بياناته الخارجية محجوبًا ولا تُسمى المهمة إطلاقًا دوليًا ناجحًا.

### Task 1: إثبات المصدر وحدود الإطلاق

**Files:** Create `docs/operations/market-data-sources.md`; reference `docs/operations/deployment.md` and the official sources already linked in the design.

**Interfaces:** ينتج `SourceApproval` لكل سوق: `marketplaceCode`, `sourceId`, `transport`, العملات المتاحة، الحقول المسموحة، مدة السعر/الدليل والاحتفاظ، معدل الطلبات، السماح بالتحويل واستخدام المساعد، وحالة `VERIFIED|UNAVAILABLE|UNVERIFIED`. المرجع المكتوب لا يحتوي أسرارًا.

- [ ] اقرأ مصدر البيانات الفعلي وحساب السوق وإعداد OneLink ومعرّف العمولة المتاح، بأدوات قراءة فقط؛ لا تنشئ حسابًا أو طلبًا مدفوعًا.
- [ ] حدّد هل السعر يخص بلدًا/بائعًا/عضوية، وما إذا كان المصدر يعيد دليل توصيل صالحًا أو مخزونًا عامًا فقط. احفظ دليل الحقول وحدودها دون تخزين محتوى محظور.
- [ ] اكتب صفًا لكل سوق يراد تفعيله؛ يجب أن يكون `VERIFIED` قائمًا على دليل مباشر وليس وصفًا قديمًا أو screenshot.
- [ ] عيّن قاعدة تفعيل صريحة: سوق غير مثبت المصدر لا يعرض رقم سعر جديد؛ إذا كان الرابط المجرد مسموحًا يمكن إظهاره بوضوح دون سعر، وإلا يبقى معطلًا. لا يتحول مصدر يدوي/محجوب إلى scraping تلقائي.
- [ ] راجع المصادر الرسمية الحالية الخاصة بالسوق عند التنفيذ؛ نتائج 2 نوفمبر لا تثبت صلاحية حساب لاحقًا.

**Acceptance:** كل سوق مفعل له مصدر وصلاحية وصول وقاعدة عمر وإعداد عمولة معلوم أو حالة غير متتبع معلنة. إذا لم تتوفر صلاحية المصدر، يُسمى ذلك blocker لتفعيل السوق فقط؛ لا تُختلق adapter أو credentials. لا فائدة لاختبار وحدة يكرر نص الجدول.

### Task 2: تثبيت العقود والسياسات وقدرات MCP

**Files:** Create `packages/domain/src/international-contracts.ts`, `marketplaces.ts`, `source-policy.ts`, and `international-contracts.spec.ts`; modify `contracts.ts` وexports في `index.ts` و`packages/domain/package.json`.

**Interfaces:** تصدير الأنواع أعلاه؛ `resolveSourcePolicy(sourceId, marketplaceCode): SourcePolicy`; `parseShoppingContext(input): ShoppingContext`. `SourcePolicy` يحمل `priceMaxAgeSeconds`, `deliveryMaxAgeSeconds`, `retentionSeconds`, `enabled`, وعمليات الاستخدام المسموحة بحسب Task 1، دون قيمة عامة تستبدل المصدر المجهول.

- [ ] اكتب اختبارات ترفض مبلغًا بلا عملة، ومصدرًا غير معتمد، وبلدًا غير SA/US، ونطاقًا مقلدًا، وخلط سعرين بعملتين مختلفتين في خصم واحد. السعر غير المتاح يسمح بغياب المبلغ، لا `0` مصطنع.
- [ ] شغّل `pnpm exec vitest run packages/domain/src/international-contracts.spec.ts`؛ يجب أن يفشل أولًا عند واجهات لم تنفذ، ثم ينجح بعد إضافتها.
- [ ] عرّف سجل نطاقات رسميًا لكل سوق مفعل، مع أسماء ar/en وISO للعملات المسموحة. التحقق الدقيق لا يقبل `amazon.com.evil.test` أو اعتمادًا على substring.
- [ ] أضف export subpath مثل `@babiespicks/domain/international` للأنواع/القيم المشتركة الآمنة للعميل، يشير إلى ملف مستقل دون Prisma أو `node:fs` أو env؛ لا تستورد واجهة React من root الحالي الذي يحمّل منطق الخادم.
- [ ] أضف إلى `bp_get_capabilities` تحت `internationalOffers`: `contractVersion:2`, `enabled`, `deliveryCountries`, `displayCurrencies`, `sourcePolicies`, `agentInstructionVersion`. لا تظهر secrets أو claims هوية من العميل. أبق الحقول القديمة متوافقة.
- [ ] أبق `bp_record_price` القديم SAR-only. عرّف الأدوات الجديدة المخططة في Task 4 بمخططات strict؛ لا توسع القديم بصمت.

**Acceptance:** المخططات والقدرات تصف ما يعمل فعلًا؛ `enabled:false` حتى نهاية التحقق. اختبارات auth الحالية تظل دون توسيع grants. الاختبار الهندسي المناسب: `pnpm --filter @babiespicks/domain type-check`.

### Task 3: ترحيل إضافي وقابلية قراءة القديم

**Files:** Modify `packages/db/prisma/schema.prisma`; add migration بعد آخر migration فعلية باسم `international_offers`; create `scripts/operations/backfill-international.ts` و`backfill-international.spec.ts` و`docs/operations/international-migration.md`.

**Interfaces:** Add `MarketplaceListing` (productId, storeId, marketplaceCode, asin, variantKey, sourceUrl)، `PurchaseOffer` (listingId, sellerKey, fulfillerKey, condition, audience, version, isActive)، `OfferPriceObservation` (offerId, scopeKey, shipTo nullable, Money، taxBasis، sourceId، sourceUrl، checkedAt، expiresAt، availability)، `OfferDeliveryEvidence` (offerId, country, precision, state, sourceId, sourceUrl, checkedAt, expiresAt)، و`FxSnapshot` (base، rates كـdecimal strings، sourceId، asOf، expiresAt). حقول Store المضافة nullable: marketplaceCode، nameAr، nameEn، trackingId. حقول الكوبون في Task 9 تُدرج ضمن migration نفسها قبل التكامل.

- [ ] اكتب fixture قديمًا SAR واختبار dry-run يحفظ الرقم والعملة والـIDs والـslugs، ولا ينشئ وجهة أو بائعًا أو حالة برايم من اسم النطاق.
- [ ] أضف قيود هوية listing وoffer وفق السوق والنسخة وسياق البائع. استخدم مفتاح هوية canonical غير nullable؛ لا تعتمد على unique مع nullable يتيح التكرار.
- [ ] خزّن المبالغ `Decimal(20,6)` أو تمثيلًا دقيقًا مكافئًا، دون تقليص جداول القديم. السعر المجهول يُمثَّل بملاحظة توفر بلا مبلغ، وليس مبلغًا موجبًا مفترضًا.
- [ ] اجعل backfill dry-run افتراضيًا؛ الكتابة تتطلب `--apply` وتحقق هدف صريح. لا تحول السعر أو تجمع منتجين؛ السجلات الملتبسة تبقى legacy وتُعد في التقرير.
- [ ] شغّل الاختبار المركز ثم `pnpm db:generate` و`pnpm --filter @babiespicks/db type-check`. جرّب migration على قاعدة محلية مستعادة معزولة، لا production.

**Acceptance:** القراء القدامى يعملون قبل التفعيل، والجدد يميزون legacy مجهول السياق. اختبر rollback بتعطيل الميزة مع إبقاء الأعمدة والجداول، لا down migration محذوفة البيانات. لا نسخ بيانات مقيدة الاحتفاظ دون موافقة مصدر Task 1.

### Task 4: أدوات MCP لكتابة العرض والأدلة دون خلط التحرير

**Files:** Create `packages/domain/src/offer-mutations.ts`, `offer-mutations.spec.ts`; modify `contracts.ts`, `index.ts`, `apps/mcp/src/domain-contract.test.ts`, `postgres.integration.test.ts`؛ modify transport/registry فقط عند ضرورة التسجيل والإبطال.

**Interfaces:** `bp_upsert_listing`, `bp_upsert_offer`, `bp_get_offer`, `bp_record_offer_price`, `bp_record_delivery_evidence`, `bp_record_fx_snapshot`. كل mutation له `idempotencyKey`؛ تعديل metadata للعرض له `expectedVersion` و`allowPublishedEdit` عند كونه عامًا؛ الملاحظات لا تغير إصدار Product أو verdict. `applyOfferMutation(tx, name, args, actor): Promise<SavedMutation>` داخل transaction الموجودة.

- [ ] اكتب اختبارات publisher/editor، stale version، retries متطابقة ومتعارضة، وكتابة سعر لعرض بائع مختلف عن دليل التوصيل. أضف نتيجة شبكة غامضة بعد commit وإعادة نفس المفتاح: سجل واحد ونتيجة محفوظة.
- [ ] نفذ الهوية والصلاحيات من actor الخادم فقط؛ لو المنتج منشور يلزم grant النشر. احفظ revision للتعديل في المعاملة نفسها؛ لا تجعل كتابة ملاحظة تغيّر الحكم التحريري.
- [ ] تحقق من sourceId والسوق والعملة والوقت ونطاق الرابط؛ لا يسمح timestamp مستقبلي خارج سماح الساعة الحالي البالغ 60 ثانية. لا يعامل agent حقلًا عامًا مثل `verified:true` كدليل.
- [ ] اشتق `scopeKey` من الحقول canonical على الخادم، واحتسب `expiresAt` من توقيت المصدر والسياسة المعتمدة؛ لا يثق الخادم بتاريخ صلاحية يرسله الإيجنت لتمديد العمر. يحتفظ رابط المصدر بالصلة الصحيحة بالقائمة والبائع عند توفر تلك الهوية.
- [ ] سجل سعر الأعضاء منفصلًا، ودليل SA مستقلًا عن US؛ هوية الدليل تعود إلى Offer والبائع والشاحن. رفض مصدر غير مفعل خطأ `INVALID_INPUT` بلا محاولة بديلة تخمينية.
- [ ] أدرج الأدوات في `tools/list`، وحدث وصفها للعملة والمصدر والدقة؛ أعد تحذير revalidation بعد الحفظ مع retry-only الموجود.
- [ ] شغّل `pnpm exec vitest run packages/domain/src/offer-mutations.spec.ts apps/mcp/src/domain-contract.test.ts`؛ وأضف التكامل بقاعدة `_test` المعزولة فقط.

**Acceptance:** قراءة وكتابة عبر SDK الحقيقي في البيئة المعزولة؛ لا bypass API أو DB في إيجنت التشغيل. لا يسجل fixture إنتاجي لإثبات النجاح.

### Task 5: الصرف ومصدر التحديث مع تدهور واضح

**Files:** Create `packages/domain/src/money.ts`, `fx.ts`, `money.spec.ts`, `fx.spec.ts`, `scripts/operations/refresh-market-data.ts`; update `.env.example` وملفات Compose المحلية و`deploy/openship/compose.yml` لتوثيق أسماء إعدادات فقط، دون قيم سرية.

**Interfaces:** `convertMoney(value:Money, target:string, fx:FxSnapshot, now:Date): Money|null`; `getFxSnapshot(db, currencies:string[], now:Date): Promise<FxSnapshot|null>`؛ `refreshMarketData(config, clients): Promise<RefreshReport>` مع clients محقونة ومصادر Task 1 فقط. حساب دقيق بالخادم عبر Prisma.Decimal؛ النوع المشترك يبقى decimal string.

- [ ] اختبر اتجاه الزوج وسعرًا بقاعدة ثالثة، ومبالغ صغيرة، وJPY، وoverflow، وعدم وجود SAR، وانتهاء الصلاحية وعطلة مزود موثقة. لا تحول null إلى 0.
- [ ] احتفظ بـasOf وsourceId وexpiresAt، واستخدم snapshot واحدة للطلب. لا تجلب سعر صرف من المتصفح أو لكل بطاقة.
- [ ] نفذ adapter فقط للمصدر المثبت في Task 1؛ إذا تعذر، يبقى المصدر معطلًا ويستمر عرض الأصل. لا تنشئ خدمة مدفوعة ولا تفترض ECB وحده يغطي SAR.
- [ ] اجعل updater يستعمل نفس عقود MCP ومفاتيح المصدر/الملاحظة، بحدود دفعة ومهلة ومحاولة عابرة واحدة. لا يتصل بالقاعدة مباشرة، ولا يستعمل model لاستخراج أسعار من النص عند فشل المصدر.
- [ ] شغّل `pnpm exec vitest run packages/domain/src/money.spec.ts packages/domain/src/fx.spec.ts` بعملاء mocked؛ تحقق من توقف التحويل عند انقطاع المصدر دون مسح السعر الأصلي.

**Acceptance:** فصل واضح بين تحديث مصدر السعر وتحديث FX، وتقرير آخر نجاح/فشل. لا تفعيل جدول جديد؛ تتكامل آلية التحديث مع مهمة واحدة موجودة ومصرح بها بعد Task 11.

### Task 6: محرك اختيار ومقارنة مشترك

**Files:** Create `packages/domain/src/offer-selection.ts`, `offer-selection.spec.ts`; modify `prices.ts` وexports في `index.ts` و`verdict-policy.ts` فقط إذا احتاج تعليق سياق دون تغيير الأوزان.

**Interfaces:** `selectOffers(input:{productId:string; observations:OfferObservation[]; delivery:DeliveryEvidence[]; context:ShoppingContext; fx:FxSnapshot|null; policies:SourcePolicy[]; now:Date}):OfferSelection`. تعريف `OfferObservation` و`DeliveryEvidence` في `international-contracts.ts` يحوّل Decimal إلى Money canonical قبل إسقاط العرض العام.

- [ ] اختبر SA/US لنفس السوق دون حذف أحدهما، والأحدث غير المتاح دون الرجوع للأقدم، وسعر أعضاء أقل من العام، و40 USD مقابل100 SAR باستخدام FX مصطنع وأساس ضريبي موحد.
- [ ] اختبر أساسًا ضريبيًا مختلفًا أو UNKNOWN، وشحنًا منتهي الدليل، وغياب FX، وملاحظة لسياق بائع آخر. المتوقع مجموعات متجانسة أو `NO_COMPARABLE_PRICE` دون فائز شامل.
- [ ] طبق الأحدث لكل offer/scope قبل شروط الصلاحية. scope عام وscope لوجهة محددة لا يندمجان دون قاعدة موثقة للمصدر؛ راجع الخاص بالوجهة أولًا، ولا تستعمل العام لتجاوز أحدث عدم توفر خاص بها.
- [ ] احسب الخصم من الملاحظة نفسها ونفس العملة والجمهور، مع snapshot تحويل واحدة للسعر ومقابله عند العرض. يظل verdict ثابتًا.
- [ ] اجعل تساوي الأسعار حتميًا بمفتاح offerId؛ `comparisonGroup` لا يضم UNKNOWN كأنها أساس معروف. استبعد غير المتاح؛ ضع غير المعروف في `pendingDelivery` عند وجود وجهة.
- [ ] شغّل `pnpm exec vitest run packages/domain/src/offer-selection.spec.ts packages/domain/src/affiliate-verdict.spec.ts`.

**Acceptance:** ترجع كل الواجهات نفس القرار لنفس السياق والتوقيت؛ لا إعادة اختراع الفرز في React أو chat. الأصل يظل معروضًا عند غياب المقارنة.

### Task 7: القراءة العامة والعمولة والروابط القديمة

**Files:** Modify `apps/web/src/server/public-queries.ts`, `queries.ts`, `shared/lib/api.ts`, `server/purchase-handler.ts`, `packages/domain/src/prices.ts`; create `apps/web/src/app/go/offer/[offerId]/route.ts`; update existing public-query/HTTP/affiliate tests.

**Interfaces:** `getProductOffers(productId, context): Promise<OfferSelection>` و`getCatalogPage(context, filters, cursor): Promise<CatalogPage>`؛ `CatalogPage` يحمل `items:Array<{product:Product; offers:OfferSelection}>`, `nextCursor:string|null`, `total:number`, و`filterOptions` محسوبة على كامل مجموعة النتائج المؤهلة. `resolveOfferTarget(db,{offerId,observationId,shipTo},now):Promise<ResolvedOffer|null>`؛ `ResolvedOffer` يحمل `url`, `offerId`, `listingId`, `observedSellerKey`, `price:Money`, دون الزعم بتثبيت Buy Box. العملات والسياق تحوّل إلى إسقاط JSON آمن قبل خروجها من الخادم.

- [ ] اكتب اختبارات لا تكشف draft أو مصادر داخلية، وتستبعد expired source، وتعرض العملات الأصلية دون تصفيتها إلى SAR، وتبقي سحب النشر فوريًا.
- [ ] اربط الاستعلام بمحرك Task 6، وأضف pagination للقراءة الدولية بدل تحميل كل الملاحظات والكتالوج؛ حجم الصفحة 24، حد أقصى48، ومفتاح cursor حتمي. لا تحسب خيارات الفلاتر من الصفحة الحالية فقط.
- [ ] استعمل trackingId لسوق العرض. الإعداد العام القديم fallback للسوق المثبت له فقط؛ ممنوع كتابته فوق جميع الأسواق. اسم Store يبقى اسم السوق، وهوية Seller منفصلة.
- [ ] مسار العرض يحمل observationId ووجهة صريحة عند وجودها. إذا تغيرت الملاحظة أو انتهت فلا يستبدل السوق/النسخة؛ يعيد صفحة توضيح مع رابط خيارات المنتج. لا يقبل `returnUrl` حرًا ولا Open Redirect.
- [ ] حافظ على `/go/best/[productId]` و`/go/[productId]/[storeId]`: إذا كان هناك خيار واحد صالح في سياقه الحالي يمكن حله؛ عند الالتباس أظهر اختيارًا في صفحة المنتج بدل التخمين. لا تعطل الروابط القديمة بمجرد إضافة الحقول.
- [ ] شغّل `pnpm exec vitest run apps/web/src/server/__tests__/public-queries.spec.ts apps/web/src/server/__tests__/public-http.spec.ts packages/domain/src/affiliate-verdict.spec.ts` مع الحالات الجديدة.

**Acceptance:** زر البطاقة والتفاصيل والمساعد يشير إلى السوق والقائمة والنسخة المقصودة؛ عدم ضمان البائع/سعر الدفع واضح. فشل إحصاء الضغط لا يحجب الرابط، ولا يُحتسب وصول داخلي كعمولة مؤكدة.

### Task 8: واجهة عالمية وسياق مستقل وتنسيق المال

**Files:** Create `apps/web/src/shared/lib/shopping-context.ts`, `shopping-context.spec.ts`, `money-format.ts`, `money-format.spec.ts`, components `shopping-preferences.tsx`, `money-price.tsx`; modify home, layout, header/footer/messages, product-card/details/sticky, home-product-grid, catalog-filters, store-link, analytics-events, product-details, metadata, sitemap.

**Interfaces:** `resolveShoppingContext({query,cookie,locale}):ShoppingContext` بأولوية اختيار الرابط الصالح ثم المحفوظ ثم المحايد؛ `formatMoney(value:Money,locale):string`؛ `MoneyPrice({price,convertedPrice,locale})`. URL: `shipTo=SA|US`, `currency=SAR|USD`, وسقف ميزانية `maxAmount` مع `budgetCurrency` يحوّل إلى `context.budget`؛ لا تحول قيمة مالية بلا وحدتها. حد أدنى مستقل يمكن إضافته لاحقًا ولا يدخل هذا العقد الأول.

- [ ] اختبر زيارة عربية من أمريكا بوجهة SA، وVPN، ورابط en صريح، وحذف/فساد cookie، وفتح رابط مشترك بعملة مختلفة. لا تبديل لغة أو وجهة بسبب IP.
- [ ] احفظ اختيارًا صريحًا في cookie تفضيلات صغيرة بلا عنوان أو IP. غير المختار يبدأ محايدًا؛ بعد اختيار SA اقترح SAR وUS اقترح USD فقط إذا لم تُحدد العملة صراحة. تغيير اللغة يحفظ السياق.
- [ ] اعرض الأصل دائمًا، والتقدير عند صلاحيته مع أساس الشحن/الضريبة. ميّز USD/CAD/AUD، واعزل الاتجاه. حدّث كل استعمال SarPrice الفعلي؛ يبقى wrapper للقديم عند الحاجة فقط دون استخدامه لمبلغ غير SAR.
- [ ] طبق الفرز داخل مجموعات المقارنة، وحدود الميزانية بوحدتها، وحالة «يحتاج التحقق من التوصيل». لا ينتهي غياب سعر حديث أو مصدر غير متاح إلى محتوى مختلق؛ الرابط بلا سعر يظهر فقط إذا سمحت سياسة Task 1 بذلك.
- [ ] اعتمد العنوان «عروض لطفلك من أمازون حول العالم» وترجمته المناسبة؛ أزل قيد البلد من هوية التذييل دون حذف اسم سوق العرض الحقيقي. حدث about وSEO وprompt وصف الموقع المتعلق بالنطاق.
- [ ] اجعل JSON-LD يطابق الأصل الظاهر بعملته؛ لا يكتب تقدير FX كسعر أصلي. احتفظ `/ar` و`/en` وcanonical/hreflang، ولا تفهرس كل تركيبات التفضيل كصفحات دول مستقلة.
- [ ] سجل في التحليلات العملة الأصلية ووجهة الاختيار وسوق العرض مستقلة؛ لا ترسل عنوانًا أو نص محادثة. امسح حالة العرض القديم عند تغيير السياق قبل تحديث البيانات لمنع رابط ضغط بوجهة سابقة.
- [ ] شغّل اختبارات المال والسياق، ثم اختبارات rendering/catalog/public-honesty القائمة. اختبر متصفحًا فعليًا على localhost للهاتف وسطح المكتب عبر أداة المتصفح المتاحة عند التنفيذ، مع صور للبطاقة والفلاتر والاختيار؛ لا يتطلب ذلك إضافة مكتبة اختبار جديدة تلقائيًا.

**Acceptance:** من أول عرض إلى زر الشراء يتطابق السياق والسعر والعملات. لا ومضة سعر بعملة خاطئة بين SSR والمتصفح، ولا cache مشترك يخلط وجهتين. لا تنشأ مسارات فئات عامة جديدة.

### Task 9: كوبونات متعددة العملات وشروط واضحة

**Files:** Modify Coupon schema ضمن migration Task 3، `contracts.ts`, `index.ts`, `public-queries.ts`, API coupons، `coupons-client.tsx`, `coupons.ts` و`coupons.spec.ts`; create `packages/domain/src/coupon-scope.spec.ts`.

**Interfaces:** `couponCurrency`, `minimumSpend:Money|null`, `eligibleCountries:DeliveryCountry[]|null`, `audience`, `sourceId`, `checkedAt`, `validUntil` UTC. يفرض العقد currency للخصم الثابت؛ النسبة لا تتطلب عملة إلا لحد/سقف مالي. ISO timestamp بoffset، ولا استنتاج timezone من لغة الوصف.

- [ ] اختبر خصم10 USD مع تفضيل SAR: الرقم الأصلي ثابت، والتحويل اختياري واضح؛ شرط الشراء بالدولار لا يصبح حدًا بالريال تلقائيًا.
- [ ] اختبر انتهاء عرض بتوقيت سوق أجنبي وعرض أعضاء وبلد غير مؤهل. المصدر غير المتحقق لا يصبح `verified` لكل المنتجات.
- [ ] توقف عن استخراج شرط مالي متعدد العملات من نص regex الحالي؛ استخدم الحقول المنظمة. بيانات legacy ذات العملة المجهولة لا تُملأ SAR آليًا؛ احتفظ بالنص مع غياب الادعاء المنظم حتى المراجعة.
- [ ] شغّل `pnpm exec vitest run apps/web/src/shared/lib/coupons.spec.ts packages/domain/src/coupon-scope.spec.ts`.

**Acceptance:** صفحة الكوبون وبطاقة المساعد وAPI تعرض الشرط المالي نفسه؛ المنتهي لا يكشف الرمز وفق السلوك القائم. لا يظهر الكوبون كخصم منتج بعينه دون دليل.

### Task 10: مساعد الموقع بالسياق والميزانية الصحيحين

**Files:** Modify `apps/web/src/server/chat/chat-policy.ts`, `chat-tools.ts`, `chat-service.ts`, `chat-fixtures.ts`, `chat-service.spec.ts`, `apps/web/src/app/api/chat/route.ts`, `shared/components/chat-widget.tsx`.

**Interfaces:** طلب chat يحمل `shipTo`, `displayCurrency` صريحين مع locale؛ يطبقهما الخادم عبر `parseShoppingContext`. بطاقات الرد تحمل `OfferQuote` المختصرة و`contextKey`; البحث `budget:Money|null`، و`maxPrice` القديم يعالج بعقد توافق معلن لا بالتخمين.

- [ ] اختبر «أقل من100 دولار» و«أقل من100 ريال» و«أقل من100» دون عملة مختارة؛ الأخير يطلب تحديد العملة بدل افتراضها. اجعل فهم العملة في budget contract/typed tool، وليس رقمًا يترجمه النموذج بحرية.
- [ ] اربط search/deals/details بنفس اختيار Task 6 وسياسة الكوبون. لا ترشيح عرض للوجهة الأخرى أو جمهور الأعضاء للعامة.
- [ ] حدّث البطاقات لتعرض العملة والمصدر والتقدير الصحيحين. عند تغيير contextKey امسح/علّم بطاقات السياق السابق واطلب نتائج جديدة؛ لا تعيد استعمال سعر مخزن في نص المحادثة.
- [ ] حافظ على الردود الطبية وخارج النطاق والتحقق من النص وعدم تخزين المحادثات. لا ترسل عنوانًا شخصيًا أو مفاتيح إلى النموذج.
- [ ] شغّل `pnpm exec vitest run apps/web/src/server/chat/chat-service.spec.ts` بموفر mocked. لا تشغّل `chat-eval.live.spec.ts` أو inference مدفوعًا لإثبات هذا الجزء دون تفويض مستقل.

**Acceptance:** طلب HTTP/رد API/بطاقة المستخدم متطابقة ماليًا مع الموقع؛ الـLLM لا يكون مصدر الأسعار أو أحكام التوصيل.

### Task 11: الإيجنت الخارجي ومحدّث الأسعار والمزامنة

**Files:** Update `AGENTS.md`, `docs/operations/content-agent-instructions.md`, `docs/operations/product-content.md`, `docs/simplification/automation.md`, `apps/mcp/README.md`, وtool descriptions في `contracts.ts`; create `docs/operations/agent-sync.md` ودليل قبول redacted خارج Git إن احتوى بيانات حسابات.

**Interfaces:** التعليمات الحالية `2026-11-02.1` تعمل مع SAR القديم؛ عند نجاح Tasks 2–10 يصدر نص `international-offers-v2` يطابق `agentInstructionVersion` في capabilities. مزامنة المشروع والمهمة عمليتان منفصلتان، لا تعديل ضمني لجدول أو نشر.

- [ ] حدد مشروع BabiesPicks الخارجي ومهمة محدّث الأسعار المقصودين من المصدر الفعلي، لا من الصورة وحدها. افحص التوقيت والصلاحيات والنسخة المحفوظة دون تشغيلهما. إذا لم تتوفر أداة تعديل، جهز نص كل سطح والهوية المطلوبة وسجل تطبيقه الخارجي كغير مثبت؛ لا تدّع المزامنة.
- [ ] حدّث النص الكامل: النطاق العالمي، الوجهتان، العملة الأصلية، source policy، فصل البائع والشاحن وبرايم، عدم التحويل اليدوي، version/idempotency، وحدود النشر والتقارير. احفظ النسخة السابقة دون أسرار.
- [ ] لا تحوّل الإيجنت إلى v2 قبل نشر أدواته. عند كون `enabled:false` أو contract قديم يؤجل USD والأدلة غير المدعومة بدل محاولة حشوها في الوصف.
- [ ] اختبر عبر MCP معزول دورة: قراءة قدرات → تحديد سوق/قائمة صحيحة → كتابة سعر أصلي → دليل SA منفصل → قراءة عامة بالسياق → تعارض/إعادة محاولة → تقرير ما حُفظ وما أُجّل. استخدم SDK ومسار إدخال الإيجنت الفعلي متى توفر محليًا؛ لا تختبره على production.
- [ ] اختبر محدّث الأسعار: عدم تعديل العنوان أو الصورة أو verdict، عدم تجديد timestamp عند حجب المصدر، عدم نقل دليل شحن بائع آخر. ملكية السياق ومفاتيح العملية تمنع كاتبًا إضافيًا أو duplication.
- [ ] بعد نقل النص إلى المشروع والمهمة المصرح بتعديلهما، أعد قراءة النص المحفوظ وتحقق من الإصدار/المعنى. تطابق محتوى Git لا يثبت سياق جلسة نشطة؛ يقرأ الإيجنت القدرات في دفعة جديدة دون إيقاظ مهمة لمجرد الإعلان.

**Acceptance:** قبول محلي لسلوك الإيجنت عبر الأدوات؛ دليل منفصل لتطبيق النص على المشروع والمهمة؛ حفاظ الجدول والإشعارات ونطاق التفويض. تعذر مزامنة سطح خارجي فجوة تسليم معلنة، لا نجاح مفترض.

### Task 12: قبول متكامل وترحيل وطرح مصرح

**Files:** Create `scripts/operations/international-acceptance.ts`, `docs/operations/international-release.md`; modify release configuration وأدلة التشغيل عند التنفيذ الفعلي فقط.

**Interfaces:** سكربت القبول يرفض أي DB لا ينتهي اسمها `_test` أو web/MCP خارج localhost. ينتج تقرير JSON بحالات passed/failed/skipped، والـcommit/config/agentInstructionVersion، دون أسرار أو أسعار إنتاج مصطنعة.

- [ ] نفذ بالترتيب: `pnpm db:generate`، `pnpm type-check`، `pnpm lint`، الاختبارات المركزة المدمجة، ثم `env -u DEPLOY_API_KEY pnpm test` في بيئة اختبار لا تعيد تحميل مفاتيح حية، ثم `pnpm build`. إذا كان harness يحمّل المفتاح من ملف، استبعد `chat-eval.live.spec.ts` صراحة في أمر المجموعة. لا تسمح لمجرد وجود DEPLOY_API_KEY بتشغيل inference حي تلقائيًا.
- [ ] شغّل تكامل MCP والقاعدة وHTTP على `babiespicks_simplification_test` المعزولة: legacy SAR، USD عام، سعر أعضاء، عملة أصلية إضافية، شحن مجهول/غير متاح، مصدر منتهي، مصدر FX متوقف، وسحب نشر. سجل أي skip كغير مثبت.
- [ ] تحقق بمتصفح فعلي من ar/en وSA/US وSAR/USD، تغيير السياق والفلاتر والميزانية، بطاقات المساعد، الهاتف/سطح المكتب، وزر العرض. استخدم بيانات محلية وروابط تحويل يلتقطها الاختبار دون تنفيذ شراء أو ضغط إنتاجي.
- [ ] احفظ مصدر كل نسخة وتعليمات الإيجنت ونتائج الاختبار. نفذ backup ثم restore معزول قبل ترحيل بيانات قائمة؛ لا تسقط قيود الاحتفاظ بالمصدر على النسخ الاحتياطية.
- [ ] افحص إعداد OpenShip/webhook الحالي قبل أي push؛ الوثيقة التاريخية تذكر auto-deploy على main. لا يُنشر إلى فرع يفعّل الإنتاج إلا بتفويض النشر المناسب. استخدم checkout/فرعًا معزولًا عند تنفيذ التغييرات مع حفظ العمل الحالي.
- [ ] تسلسل الطرح المقترح عند التفويض: additive migration → إصدار قراءة متوافق والميزة معطلة → عقد MCP/نسخة التعليمات المتوافقة دون جداول جديدة → مراجعة بيانات حقيقية مسموحة → تفعيل سوق/وجهة محدودة → فحوص read-only. لا تُكتب fixtures على الإنتاج.
- [ ] شروط الإيقاف: تحويل خاطئ، عملة غير متسقة، ربط سوق خطأ، تسرب draft، تجاوز source expiry، تلف هوية أو double-write. الرجوع يعطل القدرة الدولية والكاتب الجديد ويعيد الصورة المتوافقة؛ لا يحذف الأعمدة ولا يعيد تفسير أسعار أجنبية كريال.
- [ ] بعد القبول والنشر فقط، حدّث فقرة عقد العملة الجاري في AGENTS وتعليمات الإيجنت إلى الواقع الجديد، مع مرجع الإصدار. أبق التقييمات والروابط والجداول التاريخية والـpermissions كما هي.

**Acceptance:** دورة الإيجنت→MCP→DB→الواجهة→رابط السوق، مع نسخة تعليمات معلومة، ناجحة محليًا. القبول الإنتاجي قراءة فقط ومفصول عن الاختبار المحلي. إثبات العمولة الفعلي يعتمد تقارير أمازون، لا HTTP302 أو event ضغط.

## أثر كل مرحلة على المستخدم

| الدفعة | النتيجة القابلة للمراجعة | ما يمنع تفعيلها |
|---|---|---|
| 1–4 | عقود وبيانات وإيجنت لا يختلق غير المدعوم | مصدر/صلاحيات غير مثبتة أو كسر توافق |
| 5–7 | سعر أصلي وتحويل واختيار ورابط صحيح | FX/أساس مقارنة غير صالح أو توصيل غير مثبت |
| 8–10 | تجربة عربية/إنجليزية عالمية بوجهة وعملة مستقلة | تضارب UI/API أو تسرب سياق قديم |
| 11 | إيجنت المشروع ومحدّث الأسعار متوافقان مع العقد | نص خارجي لم يُطبّق أو writer غير منضبط |
| 12 | إصدار قابل للتفعيل والرجوع بأدلة | اختبارات ناقصة أو غياب تفويض الطرح |

## تغطية التصميم والقرارات المتبقية

| المتطلب | المالك | الدليل |
|---|---|---|
| مصدر مسموح وعمر ومحتوى مرخص | 1 و2 و5 | matrix موثقة + فشل مغلق عند غياب المصدر |
| فصل المكان/الوجهة/اللغة/العملة | 2 و8 | اختبارات سياق + متصفح |
| أصل مالي وتحويل وخصم صحيح | 2 و5 و6 | اختبارات حساب وsnapshot واحدة |
| بائع/شحن/برايم وسياقات مستقلة | 3 و4 و6 | تكامل قاعدة وأهلية |
| روابط وعمولة ومراجعات الأسواق | 7 و8 | tests النطاق والتوجيه ومصدر التقييم |
| كوبونات ومساعد الميزانية | 9 و10 | HTTP/rendering وprovider mocked |
| تعليمات الإيجنت والمهمة | 11 | SDK قبول محلي + قراءة النص الخارجي |
| نشر آمن وحفظ قديم واستعادة | 3 و12 | migrations/restore وتوافق وروابط |

اختيار المصدر/المزود والسماح بتحويل محتواه واستخدامه داخل المساعد نقاط غير مثبتة حاليًا، لها خطوة حسم صريحة في Task 1. لا يعرقل ذلك إعداد الخطة أو العمل المحلي المعزول بعد اعتماده، لكنه يمنع الادعاء بأن إطلاق كل سوق جاهز. لا يوجد تقدير أيام أو استهلاك موثوق قبل معرفة المصدر وحجم البيانات؛ يُعاد التقدير بعد Task 1 دون ادعاء توفير.

## مراجعة الخطة وحالة التسليم

- [x] ربط كل مجال في التصميم بمهمة ومخرج وقبول، بما فيه الإيجنت الخارجي ومهمة الأسعار.
- [x] تثبيت واجهات المال والسياق والاختيار وعقود التوافق ومنع العملة المصطنعة.
- [x] ترتيب المهام حسب الاعتماد؛ حزم المستهلكين تُفصل فقط بعد ثبات العقود وملكية الملفات.
- [x] تسمية اختبارات الحالات الخمس في Review Focus ودمج القبول عبر الحدود.
- [x] فصل المصدر المجهول عن التنفيذ المحلي، وفصل المحلي عن الإنتاج وتفويض النشر.
- [x] تضمين إبطال cache بعد الحفظ، الصلاحيات، version/idempotency، الرجوع والاستعادة.

حالة هذه المهمة: **خطة مكتوبة للمراجعة، ولم يبدأ تنفيذ الميزة أو نشرها.** تعليمات الإيجنت المرجعية أُعدت محليًا، وتطبيقها على المشروع الخارجي والمهمة غير مثبت. التوصية التنفيذية: المنفذ نفسه ينفذ النواة المتسلسلة، ويمكن تفويض حزمة مستقلة بعد ثبات العقود مع مراجعة نهائية واحدة؛ لا يلزم عامل جديد لكل مهمة.

قياس الاستهلاك لهذا التخطيط غير مكتمل: baseline التقط بعد بدء القراءة، وأداة الإرفاق المحلية أظهرت في المهمة السابقة `KeyError: participants` ولم تُصلح ضمن نطاق المشروع. لا تستنتج إجمالي tokens أو توفيرًا من هذا الملف.
