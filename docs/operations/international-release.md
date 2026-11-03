# القبول المتكامل والطرح المصرح — Task 12

هذا مستند Task 12 من [خطة الأسواق الدولية](../superpowers/plans/2026-11-02-international-marketplaces.md#task-12-قبول-متكامل-وترحيل-وطرح-مصرح). يرافق سكربت القبول `scripts/operations/international-acceptance.ts` ويحفظ أدلة الإصدار، ما اختُبر فعلًا، ما بقي غير مثبت، وخطة الرجوع قبل أي نشر.

**حدود هذه المهمة:** محلي فقط. لا `commit`، لا `push`، لا `deploy`، لا تفعيل دولي في production، ولا كتابة عليه، ولا بيانات إنتاج مصطنعة. المستودع يبقى عند `a6c732ae8922cef1c63a18030242a095cf60620b` مع تعديلات الميزة غير المرفوعة، وحالة OpenShip الحالية (auto-deploy على `main`) تعني أن **أي push إلى main ينشر إلى الإنتاج تلقائيًا** — لذلك لم يُنفَّذ أي push (البند المطابق في الخطة).

## الخلاصة في سطر

التسلسل الكامل (generate → type-check → lint → الاختبارات المركزة → المجموعة الكاملة بلا مفتاح → build) أخضر على هذا الجهاز، والتكامل على `babiespicks_simplification_test` المعزولة أخضر (13 passed / 0 failed / 3 skipped موثقة)، والمتصفح الفعلي أخضر (16/16). **لكن الطرح الدولي غير جاهز للتفعيل** لأن مصدر بيانات T1 ما زال `UNVERIFIED` والخطة تحجب تفعيل أي سوق حتى إثبات المصدر، ولأن الواجهة العامة لا تعرض بعد أي عروض دولية أو تحويل FX (تفصيل في «الفجوات المعلنة»).

| البُعد | الحالة | الدليل |
|---|---|---|
| التسلسل المحلي | ✅ 6/6 | `work/acceptance/international-sequence-*.json` |
| Docker (PostgreSQL 16 معزول + التكامل) | ✅ 13/13 + 3 skipped | `work/acceptance/international-integration-*.json` |
| المتصفح (ar/en × SA/US × SAR/USD) | ✅ 16/16 | `work/acceptance/international-browser-*.json` و`work/acceptance/screenshots/` |
| staging | ❌ غير موجود ولم يُختبر | — |
| production | ⛔ لم يُلمس؛ القبول الإنتاجي لاحقًا **قراءة فقط** | — |
| تفويض النشر | ❌ لم يُمنح | — |

`agentInstructionVersion` المقروء من `bp_get_capabilities` أثناء التكامل: **`2026-11-02.2`**، مع `internationalOffers.enabled: false`. إصدار التعليمات هذا **غير مطبّق** على المشروع الخارجي أو المهمة المجدولة (فجوة T11 المعلنة في [agent-sync.md](agent-sync.md)).

## السكربت

`scripts/operations/international-acceptance.ts` (بمعية `international-acceptance.integration.ts` و`international-acceptance.browser.ts`) ينتج تقرير JSON فقط ولا ينشر شيئًا.

### الحرّاس (قبل أي أمر)

- **قاعدة البيانات:** كل `TEST_DATABASE_URL`/`DATABASE_URL` في البيئة تُرفض إلا إذا انتهى اسم قاعدتها بـ`_test` وكان المضيف loopback (`localhost`/`127.0.0.1`/`[::1]`). أسماء `postgres`/`template*`/`production`/`prod`/`babiespicks` وأي اسم يحتوي `prod` مرفوضة، وكذلك مضيفات الإدارة السحابية المعروفة (Supabase، Neon، RDS، Azure، Render، Railway، DigitalOcean، Aiven، PlanetScale، Heroku).
- **الخادم:** أي web/MCP خارج localhost يُرفض (`assertLocalOrigin`).
- **الأوامر:** لا تُنفَّذ أي كلمة تحتوي محارف shell (`|&;<>()$\`\\"'*?[]{}~!#`)؛ أي قيمة تُقرأ من ملف لا تُفسَّر ولا تُقسَّم إلى أوامر إضافية.
- **الأسرار:** لا تُطبع أي قيمة؛ يُسرد **أسماء** المتغيرات فقط، وتُحجب أي قيمة لمتغير يطابق `(PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE|CREDENTIAL)` وأي `postgresql://…` و`Bearer …` من مخرجات الأوامر.-شروط الإيقاف الستة في الخطة مضمّنة في كل تقرير (`stopConditions`).

### التقرير

```json
{
  "schemaVersion": 1, "profile": "sequence|integration|browser",
  "startedAt": "…", "finishedAt": "…",
  "commit": "<sha>", "commitSource": "git|argument|unknown",
  "config": { "presentEnvNames": ["…أسماء فقط…"], "node": "…", "pnpm": "…", "platform": "…",
              "databaseNames": ["…_test"], "webOrigins": ["http://localhost:3314"],
              "chatInference": "disabled|key-present-but-e2e-only", "excludedTests": [] },
  "agentInstructionVersion": "2026-11-02.2 | null",
  "counts": { "passed": 0, "failed": 0, "skipped": 0 },
  "checks": [{ "id": "…", "environment": "local|docker|staging|production",
               "status": "passed|failed|skipped", "evidence": "…", "reason": "…", "durationMs": 0 }],
  "environments": { "local": "…", "docker": "…", "staging": "…", "production": "…" },
  "stopConditions": ["…"]
}
```

كل `skip` يحمل سببًا، و`skip` ليس دليلًا. `chatInference` لا يصير نشطًا بحضور المفتاح: عند وجود `DEPLOY_API_KEY` يُشغَّل `pnpm test --exclude '**/chat-eval.live.spec.ts'` ويُسجَّل الاستبعاد في `excludedTests`.

### الاستخدام

```bash
# 1) تسلسل الأوامر بالترتيب الحرفي من الخطة
node --import tsx scripts/operations/international-acceptance.ts --profile=sequence

# 2) تكامل على قاعدة _test معزولة (الأمر يحتاج شرط react-server لاستيراد طبقة الخادم)
TEST_DATABASE_URL=postgresql://postgres:<local-only>@127.0.0.1:<port>/babiespicks_simplification_test \
  node --conditions=react-server --import tsx scripts/operations/international-acceptance.ts --profile=integration

# 3) متصفح فعلي على خادم محلي (localhost فقط)
CHROME_PATH="<path to a local Chromium / Chrome for Testing>" TEST_WEB_URL=http://localhost:3314 \
  node --conditions=react-server --import tsx scripts/operations/international-acceptance.ts --profile=browser
```

فحص أنواع السكربت (خارج `pnpm type-check`، لأن `scripts/` لا تدخل في حزم المشروع):

```bash
npx tsc -p scripts/operations/tsconfig.acceptance.json   # exit 0
```

`--conditions=react-server` لازم لأن `apps/web/src/server/public-queries.ts` يبدأ بـ`import 'server-only'`، وحزمة `server-only` ترمي خطأً خارج بيئة React Server. لا يُغيَّر مصدر التطبيق لأجل الاختبار.

## ما أُثبت — محلي (تسلسل الخطة)

الأمر الرسمي: `node --import tsx scripts/operations/international-acceptance.ts --profile=sequence`؛ كل خطوة تُوصل مخرجاتها عبر `exec` بلا تفسير shell. النتيجة **6 passed / 0 failed / 0 skipped**:

| الخطوة | الأمر | النتيجة |
|---|---|---|
| 1 | `pnpm db:generate` | exit 0 (Prisma Client 6.19.3، يتضمن أعمدة كوبون Task 9 من الترحيل `202611020001_international_offers`) |
| 2 | `pnpm type-check` | exit 0 (db, domain, web, mcp) |
| 3 | `pnpm lint` | exit 0 |
| 4 | الاختبارات المركزة (17 ملفًا، Tasks 2–11 و13) | 268 passed / 0 failed (6 skipped داخل ملفات تتطلب قاعدة) |
| 5 | `env -u DEPLOY_API_KEY pnpm test` | 352 passed / 0 failed / 76 skipped (33 ملفًا، 3 ملفات skipped) — **بدون** مفتاح في بيئة هذا الجهاز، فلم يُحمَّل ولا شُغِّل أي inference حي |
| 6 | `pnpm build` | exit 0 (Next.js 16.2.6 + MCP) |

ملاحظات صدق:

- [not tested] `env -u DEPLOY_API_KEY` يزيل المفتاح من بيئة الأمر فقط. إن أعاد الـharness حقن `DEPLOY_API_KEY` من ملف (سلوك شوهد في بيئات أخرى)، فالسكربت يستبعد `chat-eval.live.spec.ts` صراحة ويكتب ذلك في `excludedTests`. في هذا التشغيل لم يكن المفتاح موجودًا أصلًا.
- [not tested] نُفِّذ التسلسل في بيئة واحدة (macOS arm64، Node v26.12.1، pnpm 10.11.0). لم يُجرَّب على CI أو Node 22.

## ما أُثبت — Docker (قاعدة معزولة)

حاوية `postgres:16-alpine` مؤقتة على `127.0.0.1:55462` باسم قاعدة `babiespicks_simplification_test`، طُبِّقت عليها كل الترحيلات عبر `prisma migrate deploy` (14 migration، exit 0، منها `202611020001_international_offers`)، ثم أُزيلت الحاوية بعد التشغيل. لم تُقرأ ولا تُكتب أي قاعدة قائمة (`sawa-postgres` لم يُلمس). البيانات كلها fixtures قبول محلية مولّدة بالتشغيل، لا أسعار إنتاج ولا نسخ منها.

**13 passed / 0 failed / 3 skipped:**

| # | الفحص | ما أُثبت |
|---|---|---|
| 1 | `db-is-isolated` | الاتصال بقاعدة اسمهـا ينتهي `_test` فقط |
| 2 | `legacy-sar` | سعر SAR قديم (`product_prices`) يُقرأ `currency:'SAR'` بلا نسبة مقارنة ولا ادعاء توصيل، و`reason=NO_ELIGIBLE_OFFER` |
| 3 | `public-usd` | سياق US لا يُظهر أي عرض من سوق SA؛ `/go` للعرض المطلوب يُحلّ لـUS فقط ولا يُحلّ لـSA؛ لا `fxSnapshotId`؛ ولا ادعاء مقارنة |
| 4 | `members-price-hidden` | عرض MEMBERS لا يظهر في أي قائمة عامة، ولا يظهر مبلغه في الإسقاط العام |
| 5 | `additional-original-currency` | ملاحظة JPY (عملة غير داخلية لسوقها) تبقى محفوظة كما هي، ولا تحويل بلا snapshot |
| 6 | `shipping-unknown-or-unavailable` | سعر `UNKNOWN` يبقى `null` ولا يُعرض كسعر؛ دليل `OBSERVED_UNAVAILABLE` لا يظهر أبدًا `OBSERVED_AVAILABLE` |
| 7 | `expired-source` | ملاحظة منتهية لا تُعرض ولا تُحل كهدف، و`checkedAt` لم يتجدد |
| 8 | `fx-stopped` | لا snapshot FX مصطنع، كل مصادر T1 `enabled:false`، ولا `convertedPrice` |
| 9 | `source-approved-quote-boundary` | مصدر `UNVERIFIED` لا يصبح فائزًا للمقارنة (`comparisonGroup=null`)، والتوصيل غير الموثوق يُعرض `UNKNOWN` |
| 10 | `coupon-audience-and-country` | كوبون US يظهر بسياق US، وكوبون US منتهٍ لا يظهر في سياق SA، والمنتهي لا يكشف رمزه (`state=ENDED`) |
| 11 | `publication-withdrawn-hidden` | منتج ينتقل إلى `ARCHIVED`: `total=0`، لا عروض، لا سعر قديم، و`resolveOfferTarget` يعود `null` |
| 12 | `draft-never-visible` | منتج `DRAFT` غائب عن صفحة الكتالوج العامة وعن قراءة التفاصيل |
| 13 | `agent-instruction-version` | `bp_get_capabilities` يُرجع `agentInstructionVersion: 2026-11-02.2` و`enabled:false` |

**skipped (غير مثبت):**

- `mcp-oauth-session` — دورة OAuth→MCP→DB الكاملة يغطيها `apps/mcp/src/postgres.integration.test.ts` عند تمرير `TEST_DATABASE_URL` (ملف يتطلب قاعدة، فـ`skip` في التسلسل أعلاه). لم تُشغَّل في هذا التشغيل.
- `staging-smoke` — لا يوجد نشر staging ولا تفويض له.
- `production-read-only` — لم يُلمس production في هذه المهمة.

### عيب وجدته هذه الجولة وأُصلح

`resolveOfferTarget` في `packages/domain/src/prices.ts` (Task 7) كان يُحل رابط `/go/offer/…` لمنتج **مسحوب من النشر** أو مسودة، لأن الاستعلام لا يقرأ حالة النشر للمنتج. أُضيف شرط `publishStatus:'PUBLISHED'` و`isActive` عبر `include` للمنتج في نفس الاستعلام، بلا استعلام ثانٍ ولا تغيير واجهة. الحد الفاصل واحد مع الكتالوج العام. بعد الإصلاح: 147 اختبارًا مركّزًا أخضر، `type-check` و`lint` أخضران، والفحص رقم 11 أخضر.

## ما أُثبت — متصفح فعلي

متصفح Chromium حقيقي (Chrome for Testing متوفر محليًا في ذاكرة Playwright، بلا تنزيل) عبر CDP على pipe، على خادم `next start` محلي على `localhost:3314` مقرون بالقاعدة المعزولة. **16 passed / 0 failed**، والصور في `work/acceptance/screenshots/` (`desktop-ar|en-SA|US-SAR|USD.png` × 8، `desktop-ar-filter-budget.png`، `desktop-ar-assistant.png`، `phone-ar-SA-USD.png`، `phone-en-US-SAR.png`).

- **8 خلايا** ar/en × SA/US × SAR/USD: `lang` و`dir` صحيحان (ar=rtl، en=ltr)، وشارة الوجهة والعملة المختارتان معلّمتان `aria-pressed="true"`.
- **اللغة مستقلة عن السياق:** صفحة en تبقى إنجليزية مع وجهة سعودية وعملة SAR، وتبديل الوجهة يبقى داخل `/:locale`.
- **العملة لا تستنتج وجهة:** `?currency=USD` وحده لا يختار السعودية ولا أمريكا.
- **تبديل الوجهة من الشريحة:** النقر على «United States» ينتقل إلى نفس مسار اللغة بـ`shipTo=US`.
- **الفلاتر:** روابط الفلاتر موجودة. [not tested] حقل الميزانية (`maxAmount`) غير موجود في هذه النسخة من الواجهة، فلم يُجرَّب إدخال ميزانية.
- **بطاقات المساعد:** الزر «اسألي بايبي» يفتح نافذة «بايبي» في سياق ar/SA/SAR. [not tested] محتوى البطاقات داخل المساعد يتطلب مزود نموذج حيًا (غير مفعّل)، فلم يُرسل أي سؤال؛ سلوك البطاقات والرابط مغطى باختبارات الوحدة فقط.
- **زر العرض:** زر الشراء في صفحة المنتج يذهب إلى `/go/…` ويحمل `shipTo` الصريح من السياق والعملة الأصلية للسعر.
- **الهاتف (390px):** لا تجاوز أفقي في ar وen.

[not tested] Safari/Firefox، ولوحة مفاتيح/قارئ شاشة فعليان (غطيتهما بفحوص ARIA فقط)، ولا شاشات أخرى غير الرئيسية وصفحة المنتج.

## OpenShip / webhook — فحص قراءة فقط

فُحص `deploy/openship/compose.yml` و`docs/operations/deployment.md` بلا أي استدعاء لـOpenShip أو تعديل واجهته.

- المصدر: `tariiq222/babiespicks` على `main` عبر GitHub App، و**auto-deploy مفعّل** (`deployment.md`). أي دفع إلى main ينشر.
- الخدمات: `db` (postgres:16، بلا منفذ عام)، `migrate` (`pnpm db:deploy` مرة واحدة لكل نشر — يطبق الترحيلات الإضافية تلقائيًا)، `web` (3000، `/api/ready`)، `mcp` (8765، `/ready`، نسخة واحدة). الترحيل يسبق web/MCP بحسب `depends_on`.
- نطاقات: `babiespicks.com`، `www` (redirect)، `api`، و`mcp.babiespicks.com`؛ الشهادات مُدارة، وMCP DNS-only.
- لا webhook مخصص إضافي غير GitHub App، ولا سكربت نشر خارج compose. لا `MARKET_DATA_*` مربوطة (أسماء معلَّقة فقط) ولا كاتب ثانٍ.
- **الخلاصة:** الدفع إلى main = نشر إنتاج. لذلك لا push في هذه المهمة؛ الدفع يتطلب تفويض نشر صريح من المالك، ويُفضَّل من فرع/checkout معزول مع الحفاظ على العمل الحالي (مطابق للخطة).

## الفجوات المعلنة (مما شاهده هذا القبول)

هذه فجوات حقيقية في التطبيق أو في نطاق المهمة، لا تُحوَّل إلى نجاح:

1. **لا سطح عام يعرض العروض الدولية.** الرئيسية (`getAllProducts`/`prices`) وصفحة المنتج (`product.prices`) تقرآن جدول الأسعار القديم فقط؛ `getCatalogPage` و`getProductOffers` (Task 7) مُنفَّذان ومختبَران لكنهما غير موصولين بصفحة عامة. النتيجة: في المتصفح ظهرت أسعار SAR القديمة فقط حتى مع سياق US/USD، ولم يظهر أي تحويل FX أو رابط `/go/offer`.
2. **العروض من مصادر T1 فقط** (كلها `UNVERIFIED`) تظهر بلا `comparisonGroup` ولا تحويل، والملاحظات من مصدر غير مسجَّل لا تُعرض إطلاقًا. عمليًا: لا يوجد اليوم عرض دولي «مؤهل للمقارنة» في أي سطح، وهذا ما تفرضه T1.
3. **بطاقة «التوصيل يحتاج التحقق»:** مع وجهة مختارة يظهر السعر ضمن `pendingDelivery` حتى لو كان دليل شحن `OBSERVED_AVAILABLE` محفوظًا، لأن المصدر غير موثوق. النص لا يكذب، لكنه يخفي دليلًا محفوظًا.
4. **`getActiveCoupons`** يرجع فقط صفوفًا لم ينتهِ `validUntil` فيها قبل التصنيف؛ الكوبون المنتهي يُحذف من الاستعلام قبل أن يطبّق `couponVisibility` حالة `ENDED`. النتيجة الأمنية سليمة (لا رمز)، لكن «المنتهي» لا يُميَّز عن «غير الموجود» في واجهة الكوبونات.
5. **حقل الميزانية** في واجهة التصفح غير موجود في هذه النسخة.
6. **`agentInstructionVersion 2026-11-02.2`** غير مطبّق على المشروع الخارجي والمهمة المجدولة (فجوة T11).

## مصدر كل نسخة وتعليمات الإيجنت

| العنصر | القيمة المسجلة |
|---|---|
| التزامن | `a6c732ae8922cef1c63a18030242a095cf60620b` (`git rev-parse HEAD`)، والالفارق المحلي هو تعديلات الميزة غير المرفوعة |
| إصدار التعليمات | `2026-11-02.2` من `bp_get_capabilities` (السابق `2026-11-02.1` في [agent-sync.md](agent-sync.md)) |
| عقد القدرات | `contractVersion: 2`, `enabled: false`, `deliveryCountries: ["SA","US"]`, `displayCurrencies: ["SAR","USD"]` |
| الترحيلات المطبقة في الاختبار | 14 migration، آخرها `202611020001_international_offers` (عروض + أدلة + FX + legacy + أعمدة كوبونات Task 9)، `migrate diff` فارغ |
| بيئة التنفيذ | macOS arm64، Node v26.12.1، pnpm 10.11.0، PostgreSQL 16 (Docker)، Chromium 156 |

## النسخ الاحتياطي والاستعادة قبل ترحيل بيانات قائمة

الخطة تطلب backup ثم restore معزول قبل أي ترحيل على بيانات قائمة. **لم يُنفَّذ هنا** لأن هذه المهمة لا تلمس أي قاعدة قائمة (لا production ولا نسخة منها)، ولا تملك بيانات اعتماد إنتاجية. قبل الترحيل المصرح:

1. أخذ نسخة من قاعدة production (`pg_dump`) وتسجيل `sha256` وحجمها في مكان عملي خارج Git.
2. استعادة النسخة إلى قاعدة معزولة (`restore_test`) على مضيف محلي/خاص، والتأكد أن الأعداد الأساسية (منتجات، أسعار، كوبونات، عروض) متطابقة.
3. قاعدة `restore_test` + `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` يجب أن يظهر فقط الترحيل الجديد، ثم `migrate deploy` عليه، ثم `migrate diff` فارغ، ثم قراءة الصفوف القديمة (نماذج منها) للتأكد أن `couponCurrency` بقي `NULL` وأن أسعار `product_prices` لم تتغير.
4. قيود الاحتفاظ بالمصدر تبقى على النسخ الاحتياطية: النسخ تُخزَّن بعيدًا عن Git، وبصلاحية وصول محدودة، ولا تُستخدم لتغذية أسعار عامة خارج المصادر المعتمدة.

## خطة الرجوع

التراجع = **تعطيل القدرة، لا حذف البيانات**:

1. إبقاء `internationalOffers.enabled=false` وإزالة إغراء الروابط الدولية من الإصدار السابق المتوافق (الواجهة القديمة تعمل كما هي لأن كل التغييرات إضافية).
2. إيقاف أي كاتب جديد (لا كاتب مفعّل حاليًا؛ أسماء `MARKET_DATA_*` في compose تعليقات فقط وغير مربوطة).
3. إرجاع صورة التطبيق المتوافقة عبر OpenShip (rollback على commit/صورة معروفة) مع الإبقاء على المخطط الجديد — الترحيل إضافي فلا يكسر الإصدار السابق.
4. **لا** تُحذف الأعمدة أو الجداول، و**لا** يُعاد تفسير سعر أجنبي كريال، و**لا** يُعاد وسم مبلغ SAR كـUSD.
5. منع إعادة الظهور: `resolveOfferTarget` يحترم الآن `publishStatus=PUBLISHED`، فأي رابط `/go/offer` لمنتج مسحوب يعود 404 بدل تحويل.

## شروط الإيقاف

أي واحد من هذه في أي بيئة يوقف الطرح ويُبلَّغ فورًا: تحويل خاطئ، عملة غير متسقة، ربط سوق خطأ، تسرب draft، تجاوز انتهاء المصدر، أو تلف هوية/double-write. السكربت يكتب القائمة نفسها في كل تقرير (`stopConditions`).

## تسلسل الطرح المقترح (عند التفويض فقط)

1. backup + restore معزول (أعلاه).
2. نشر migration إضافي عبر `migrate` (auto في compose)، وتأكيد Exited0.
3. نشر إصدار القراءة المتوافق والميزة **معطّلة** (`internationalOffers.enabled:false` كما هو اليوم).
4. إصدار عقد MCP/نسخة التعليمات المتوافقة بلا جداول جديدة، ومزامنة نص `2026-11-02.2` على المشروع والمهمة مع read-back (T11).
5. مراجعة بيانات حقيقية مسموحة (قراءة فقط) على نسخة.
6. تفعيل سوق/وجهة **محدودة واحدة** فقط بعد أن يصبح سياسة المصدر `VERIFIED` — وهو الشرط الذي يحجب اليوم كل عرض دولي قابل للمقارنة.
7. فحوص read-only إنتاجية منفصلة: readiness، OAuth metadata، 401 غير المصادق، وقدرات MCP.

لا fixtures على الإنتاج في أي خطوة. إثبات العمولة الفعلي يأتي من تقارير أمازون، لا من HTTP 302 أو حدث نقر.

## ما لم يُختبر

- staging (غير موجود)، وأي كتابة على production أو نسخة منه.
- المزامنة الفعلية لتعليمات الإيجنت الخارجي والمهمة المجدولة (T11).
- دورة OAuth→MCP→DB الكاملة في هذا التشغيل (ملف الاختبار الدوري يتطلب `TEST_DATABASE_URL`).
- بطاقات المساعد بمحتوى فعلي (يتطلب مزود نموذج)، وحقل الميزانية في الواجهة.
- أداء الترحيل على بيانات بحجم إنتاجي، واستعادة نسخة إنتاجية (عمليات تتطلب تفويضًا ووصولًا لا تملكه هذه المهمة).
- متصفحات غير Chromium، وتفاعل لوحة مفاتيح/قارئ شاشة يدوي.

## متابعة محلية — 2026-11-03: وسم مستقل لكل سوق

قرار التوقف بلا نشر مستمر. أُصلح اختيار الوسم في `wrapAffiliateUrl`: متغيّر SA أو US المخصص أولًا؛ المتغيّر العام للسعودية فقط؛ ثم وسم رابط المتجر المطابق للسوق. غياب الضبط يرفض الرابط، والمتجر الأمريكي القديم بلا `marketplaceCode` يظل مرفوضًا حتى مراجعة بياناته. مُرّرت أسماء المتغيرات لكل من web وMCP في ملفّي Compose دون تعيين وسم US أو نشر التغييرات.

أُنشئ حساب Associates أمريكي بالمعرّف `babiespicks-20` مع بقاء الدفع/الضرائب والمراجعة النهائية معلقة؛ وصول API لم يُطلب. سجل [مصادر البيانات](market-data-sources.md) يفرق بين وجود الحساب واعتماد مصدر الأسعار. المصدر الدولي معطل، وتعليمات `2026-11-02.2` الخارجية والمهمة غير متحقق من مزامنتهما، وفق [agent-sync.md](agent-sync.md).

الأدلة المحلية لهذه المتابعة تُسجل في `work/acceptance/2026-11-03-market-tags/verification.md`؛ نتائج Docker والمتصفح السابقة تخص الحزمة السابقة ولا تُنسب تلقائيًا إلى هذا التصحيح. لا commit أو push أو deploy أو كتابة إنتاج.

## إصدار البنية المعطلة — تفويض المالك في 2026-11-03

وجّه المالك بعد التقرير السابق: «اذا كلشي تمام ومختبر كومت ونشر»، مع الإبقاء على مجلد العمل الحالي وفرع main. هذا يفوض commit/push والنشر عبر OpenShip بعد الفحوص، ويحل محل حدود «بلا نشر» التاريخية أعلاه. لا يفوض تشغيل مصدر دولي غير معتمد أو تغيير تعليمات خارجية أو مهمة أسعار. تفاصيل القبول والإصلاحات وحدود البيانات في [سجل الإصدار](release-2026-11-03.md). تُسجّل هوية commit والنشر الفعلي ونتائج الإنتاج بعد الرفع في الأدلة التشغيلية المحلية؛ لا يُستنتج نجاح الإنتاج من هذا المستند.
