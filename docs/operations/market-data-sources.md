# اعتماد مصادر بيانات الأسواق — BabiesPicks

تاريخ مراجعة المصدر: **2026-11-02**؛ متابعة الحساب والإعداد المحلي: **2026-11-03** (Asia/Riyadh). نطاق Task 1: قراءة فقط للمصادر والحسابات؛ التغيير الوحيد مستند محلي. **لا سوق معتمد لتفعيل أسعار دولية جديدة بهذه المراجعة**. هذا حاجز لتفعيل بيانات السوق المعني، وليس حاجزًا لتنفيذ العقود والواجهة والاختبارات المحلية ببيانات معزولة.

## معنى الدليل والحالة

- **[official] دليل أولي:** نص Amazon الحالي المجلوب مباشرة من الرابط الرسمي في هذا المستند. نجاح HTTP لصفحة وثائق ليس نجاح طلب أسعار مصادق.
- **[code] دليل محلي ثانوي:** ما يثبته المستودع فقط؛ لا يثبت حساب Amazon أو إنتاجًا أو وصولًا فعليًا.
- **[not checked]** حساب/صلاحية/سلوك غير متاح للتحقق بهذه الجلسة. **[policy]** قرار تحفظي للمشروع، لا ادعاء بإجازة قانونية من Amazon.
- `VERIFIED`: وصول فعلي مصادق للسوق، وحقول مقروءة مباشرة، وصلاحية حساب/وسم وسياسات استخدام وعمر معروفة. لا يوجد صف بهذه الحالة الآن.
- `UNVERIFIED`: المسار موثق رسميًا، لكن الحساب والوصول أو الاستخدام المطلوب لم يُثبتا. `UNAVAILABLE`: النقل المحدد غير صالح وفق الدليل؛ لا يعني عدم وجود سوق Amazon أصلًا.

## SourceApproval

`sourceId` هنا معرّف مرشح في سجل السياسة، **لا اسم adapter منفذ ولا اعتماد وصول**. جميع الصفوف `enabled:false`. قيم العمر أدناه حدود تحفظية مرشحة للناقل الحالي عند اعتماده مستقبلًا، وليست إذنًا لبدء الجلب الآن. `null` يعني غير مثبت، لا مدة غير محدودة.

| marketplaceCode | sourceId | transport | العملات المتاحة وفق الوثائق | الحقول المسموحة الآن / المرشحة | priceMaxAgeSeconds | deliveryMaxAgeSeconds | retentionSeconds | معدل الطلبات | allowConversion | allowAssistant | status | الدليل وتاريخ التحقق |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|
| SA | `amazon-creators-api-sa` | `CREATORS_API_OAUTH2` | SAR فقط؛ الاستجابة الفعلية غير مقروءة | الآن: لا محتوى مصدر جديد؛ بعد الاعتماد: F1 أدناه | 3600، حد مرشح من [Cache](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/best-programming-practices) | `null`؛ لا دليل وجهة | 3600 لمحتوى العرض كحد مشروع؛ لا أرشيف أسعار؛ بقية المحتوى غير معتمد | المخصص فعليًا `null`؛ وثائق البداية ≤1 TPS و8640 TPD، والمشروع 0 حتى الاعتماد | `false`؛ غير مثبت | `false`؛ غير مثبت | UNVERIFIED | [official: SA locale](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference/saudi-arabia)، [SA policies](https://affiliate-program.amazon.sa/help/operating/policies)، 2026-11-02 |
| US | `amazon-creators-api-us` | `CREATORS_API_OAUTH2` | USD افتراضي؛ SAR وعملات أخرى موثقة في U1 أدناه؛ الاستجابة الفعلية غير مقروءة | الآن: لا محتوى مصدر جديد؛ بعد الاعتماد: F1 أدناه | 3600، حد مرشح من [Cache](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/best-programming-practices) | `null`؛ لا دليل وجهة | 3600 لمحتوى العرض كحد مشروع؛ لا أرشيف أسعار؛ بقية المحتوى غير معتمد | المخصص فعليًا `null`؛ وثائق البداية ≤1 TPS و8640 TPD، والمشروع 0 حتى الاعتماد | `false`؛ غير مثبت | `false`؛ غير مثبت | UNVERIFIED | [official: US locale](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference/united-states)، [US policies](https://affiliate-program.amazon.com/help/operating/policies)، 2026-11-02 |
| SA | `amazon-paapi5-sa` | `PAAPI5_DEPRECATED` | غير معتمدة لهذا النقل | لا شيء؛ لا fallback | `null` | `null` | لا جمع جديد | 0 | `false` | `false` | UNAVAILABLE | [official: Deprecation Notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)، 2026-11-02 |
| US | `amazon-paapi5-us` | `PAAPI5_DEPRECATED` | غير معتمدة لهذا النقل | لا شيء؛ لا fallback | `null` | `null` | لا جمع جديد | 0 | `false` | `false` | UNAVAILABLE | [official: Deprecation Notice](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)، 2026-11-02 |

**نطاق الأسواق:** SA وUS هما المرشحان لهذه الحزمة. لا يُفعّل سوق ثالث ضمنيًا لأن تعريف الموقع عالمي؛ يلزمه صف مستقل والتحقق نفسه قبل إدخال بياناته. وجهتا `SA` و`US` ليستا قائمة بأسواق مصدر معتمدة.

### الحساب والعمولة وOneLink لكل سوق

`partnerTagRef` مرجع منطقي للضبط الخاص بالسوق؛ يدعم الكود المحلي الآن `AMAZON_ASSOCIATES_TAG_SA` و`AMAZON_ASSOCIATES_TAG_US`، لكن ذلك لا يثبت ضبط الإنتاج. القيم فارغة في أمثلة البيئة؛ لم يُربط وسم US بإعداد تشغيل. `accessApproval: not requested` يصف ما فعلته هذه المراجعة: لم تطلب/تنشئ اعتمادًا؛ حالة أي اعتماد سابق **غير متحققة**، فلا يُفهم منه أن المالك لم يطلبه سابقًا.

| marketplaceCode | accessApproval | حالة الحساب والوصول الفعلي | partnerTagRef | حالة العمولة | OneLink الفعلي | الدليل وتاريخ التحقق |
|---|---|---|---|---|---|---|
| SA | `not requested` | [not checked] لا جلسة Associates مصادقة ولا طلب Creators API ناجح متاح | `marketplace/SA/partner-tag` (غير مربوط) | غير مثبتة؛ لا tag معتمد لهذه الحزمة؛ لا تعميم للوسم القديم | غير متحقق؛ لا تغيير أو تفعيل | [official: target-market tag / EU](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/common-request-headers-and-parameters)، [OneLink accounts](https://affiliate-program.amazon.com/help/node/topic/G62UTXAN2H3MRGJL)، 2026-11-02 |
| US | `not requested` (وصول API) | [direct، 2026-11-03] أُنشئ حساب Associates وأصدرت Amazon المعرّف `babiespicks-20`؛ الدفع والضرائب غير مستكملين، ومراجعة Amazon النهائية معلقة بعد مبيعات مؤهلة؛ لم يُطلب أو يُثبت وصول Creators API | `marketplace/US/partner-tag` → `AMAZON_ASSOCIATES_TAG_US` (غير مضبوط) | الوسم موجود وغير مربوط بالموقع؛ لا دليل على عمولة مكتسبة أو اعتماد مصدر أسعار | غير متحقق؛ لا تغيير أو تفعيل | [دليل إنشاء الحساب المحلي](../../work/acceptance/2026-11-03-market-tags/amazon-us-account.png)، 2026-11-03؛ [official: target-market tag / NA](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/common-request-headers-and-parameters) |

**متابعة الحساب، 2026-11-03:** شاشة نجاح التسجيل تثبت المعرّف وإتاحة Associates Central فقط. تنص الشاشة على سحب الطلب والوصول إن لم تُحَل مبيعات مؤهلة خلال 180 يومًا؛ لا نعرض ذلك كقبول نهائي. لم تُستكمل بيانات الدفع والضرائب، ولم يُطلب وصول API أو تُولّد credentials. يبقى `amazon-creators-api-us` بالحالة `UNVERIFIED` و`enabled:false`، وتبقى العمولة المكتسبة والتوصيل غير مثبتين. لم تُفعّل OneLink أو تعليمات/مهمة خارجية.

[official] تعريف `partnerTag` الحاسم: “Specify the store ID or tracking ID of a valid associate store **from the requested marketplace**”. وتقول [FAQ](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/frequently-asked-questions): “You will need a valid Partner Tag for the target marketplace and Creators API access approved in that region.” يمكن للاعتمادات أن تعمل عالميًا من حيث آلية المصادقة، لكن ذلك **لا يعفي من الوسم المعتمد للسوق وإجازة الوصول الإقليمية**. SA مدرج EU وUS مدرج NA؛ ليست هذه وجهة شحن المستخدم.

[official] [المقدمة](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction) تشترط عضوية Associates للسوق المستهدف، وتذكر 10 مبيعات مؤهلة في آخر 30 يومًا، وتسجيل وصول API وتوليد credentials. لم يُتحقق من استيفاء الحساب لهذه الشروط. لم يُنشأ حساب أو credentials أثناء T1؛ إنشاء حساب US في متابعة 2026-11-03 لا يثبت استيفاء شروط API.

[official] OneLink ليس إثبات توصيل: [FAQ](https://affiliate-program.amazon.co.uk/help/node/topic/G8JHEWQ9GTDUN7EH) تصفه geo-redirection، مع close/exact match وقد ينتهي إلى نتائج بحث؛ التفضيلات على مستوى tracking ID. [دليل الربط](https://affiliate-program.amazon.com/help/node/topic/G62UTXAN2H3MRGJL) يطلب حسابات دولية وربطها واختيار tracking ID افتراضي. لا نعرف الإعدادات الحية؛ يجب قراءتها عند التفعيل والتحقق من عدم تبديل السوق/النسخة المختارين. الإصدار الأول لا يفعّل إعادة توجيه OneLink تلقائية.

## هل السعر خاص ببلد التوصيل؟ — لا يوجد دليل وجهة صالح من هذا المسار

[official] [Locale Reference](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference) يعرّف `Marketplace`: “Target Amazon Locale. The endpoint supplied to the marketplace parameter determines which locale the API request is targeted to.” ويذكر أن السعر يرجع بعملة السوق الافتراضية عند غياب `currencyOfPreference`؛ قد يفشل التحويل ويرجع الافتراضي. اختيار SAR لا يجعل الوجهة SA.

[official] الدليل الأدق من [OffersV2 / Price](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2):

> “Please note that the price served is a default based on an in-marketplace shipping address. The price returned by the API may differ from what any specific customer sees due to a variety of factors.”

[official] قائمة مدخلات [GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items) التي قُرئت تتضمن marketplace، العملة، اللغة، ASIN، condition، partnerTag والموارد؛ لا تتضمن `shipTo` أو عنوانًا/رمزًا بريديًا للمشتري. السعر ليس تعهدًا بسعر عميل أو توصيل خارجي. النتيجة المحافظة: **سعر افتراضي داخل السوق، وليس تسعيرة وجهة SA/US التي يختارها زائر BabiesPicks**.

[official] جدول OffersV2 يقول صراحة `Not Available` لكل من `IsAmazonFulfilled`, `IsFreeShippingEligible`, `IsPrimeEligible`, `ShippingCharges`, و`MerchantInfo.DefaultShippingCountry`. `Availability.Type=IN_STOCK` وصف توفر للعرض لا دليل وصول لبلد. كما أن OffersV2 يعيد featured listings فقط؛ غيابها قد يظهر out of stock ولا يثبت انعدام كل عروض البائعين.

**[policy] حاجز مستقل:** حتى إن صار الوصول إلى الأسعار VERIFIED، لا يكفي Creators API الموثق هنا لتوليد `OBSERVED_AVAILABLE` لأي وجهة؛ يبقى `DeliveryState=UNKNOWN`, `shipTo=null`, `deliveryMaxAgeSeconds=null`. عرض US لزائر يختار SA يبقى `pendingDelivery` ولا يدخل عروض «يوصل للسعودية» أو المقارنة المؤهلة لوجهتها. وحتى تطابق بلد السوق والوجهة لا يثبت أهلية هذا المنتج/البائع لكل عناوين البلد. يلزم مصدر مسموح مستقل ودليل قائمة/نسخة/بائع/شاحن/وجهة مؤرخ، وسياسة عمر واحتفاظ لذلك الدليل؛ لم يُثبت مصدر كهذا هنا. لا نملأ الدليل من stock أو اسم النطاق أو العملة أو OneLink أو نموذج لغوي.

### F1 — الحقول المرشحة وحدودها (وثائق، لا استجابة حساب)

المصدر الأولي: [GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items) و[OffersV2](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/resources/offersV2)، تحققا 2026-11-02.

- `asin` و`detailPageURL`، و`offersV2.listings.price.money.amount/currency`، و`merchantInfo.id/name`، وcondition، و`isBuyBoxWinner`، وavailability؛ لا تُجلب أو تُعرض بهذه الحزمة قبل الاعتماد. الحقول اختيارية فعليًا؛ غياب الهوية لا يثبت بائعًا/شاحنًا مشتركًا.
- `dealDetails.accessType` قد يكون `ALL`, `PRIME_EARLY_ACCESS`, `PRIME_EXCLUSIVE`؛ مع أوقات بداية/نهاية UTC اختيارية. يُحفظ جمهور السعر ولا يُدرج سعر أعضاء كسعر عام. غياب الحقل لا يكفي لادعاء أهلية شحن Prime.
- `savingBasis` ليس دائمًا سعرًا سابقًا: قد يكون `LIST_PRICE` أو `WAS_PRICE` أو غيرهما. لا يوصف على أنه «كان» بلا تحقق من النوع؛ حساب الخصم لا يخلط العملات أو الجماهير.
- `violatesMAP` يتطلب عدم كشف رقم محجوب؛ لا يُستخرج رقم بطرق بديلة. لا ضمان بقاء Buy Box أو البائع عند الضغط.
- لا إفادة موثقة هنا بأساس ضريبي كامل أو شاحن أو تكلفة توصيل أو رسوم استيراد؛ تبقى مجهولة. صور/تقييمات/مراجعات ليست معتمدة لهذا الإدخال؛ مجرد توثيق مورد لا يثبت إجازة جمعه أو أرشفته.

### U1 — العملات

[official] [SA](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference/saudi-arabia): SAR وحدها. [US](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/locale-reference/united-states): USD افتراضية، والقائمة الموثقة الكاملة: `AED AMD ARS AUD AWG AZN BGN BND BOB BRL BSD BZD CAD CLP CNY COP CRC DOP EGP EUR GBP GHS GTQ HKD HNL HUF IDR ILS INR JMD JPY KES KHR KRW KYD KZT LBP MAD MNT MOP MUR MXN MYR NAD NGN NOK NZD PAB PEN PHP PYG QAR RUB SAR SGD THB TRY TTD TWD TZS USD UYU VND XCD ZAR`.

[policy] هذه قائمة قدرات وثائقية، لا allowlist تفعيل كاملة للمشروع. البداية المرشحة تحفظ SAR من SA وUSD من US؛ لا يتغير المال بسبب لغة المستخدم. إن طلب المصدر عملة تفضيل فعلًا، تُقرأ عملة الاستجابة ولا يفترض النجاح. **تحويل BabiesPicks مستقل غير معتمد**؛ `allowConversion:false` حتى إثبات إجازة العرض المشتق ومصدر FX مناسب. لا adapter FX مثبت بهذه الحزمة؛ غيابه يحجب التقدير/المقارنة عبر العملات ولا يمس السعر الأصلي.

## العمر والاحتفاظ والاستخدام

[official] [Best Programming Practices](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/best-programming-practices) يحدد TTL: Offers ساعة، BrowseNodeInfo ساعة، والباقي يوم. ولأن التسمية العامة Offers مقابل المورد الحالي OffersV2 لا تبرر تمديدًا، نختار الحد الأشد **3600 ثانية لمحتوى العرض**؛ يحتاج تحققًا جديدًا عند الاعتماد. هذه قاعدة مرشحة لـTask 2، لا برهان احتفاظ منفذ. لا نحتفظ بأسعار خام/مشتقة أو revisions/سجلات تحمل قيم المصدر بلا حد؛ يجب حذف/تحديث المحتوى المقيد قبل انتهاء عمره، مع سجلات عمليات مجردة لا تحفظ المحتوى. لا تُطبق مدة عامة غير محدودة على مصدر مجهول.

[official] [License Agreement](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/license-agreement) يحيل إلى سياسة كل locale؛ [US policies](https://affiliate-program.amazon.com/help/operating/policies) و[SA policies](https://affiliate-program.amazon.sa/help/operating/policies) تقيدان تعديل/إعادة توزيع المحتوى، وتطلبان إزالته عند عدم إتاحته، وتقيّدان الأسعار/التوفر بمصدر Amazon المسموح. الصفحة العربية SA تنص أن الأصل الإنجليزي حاكم؛ محاولة `language=en_US` أعادت العربية أيضًا، فلا ندعي إغلاق مراجعة الأصل الإنجليزي. لا نعتمد 48 ساعة الموجودة في الكود القديم كترخيص.

[not checked] لم يُثبت إذن مستقل لتحويل محتوى المصدر بFX أو إرساله إلى مزود نموذج أو استعماله داخل مساعد الموقع. النصوص تقيد التطوير باستخدام ML دون موافقة مكتوبة؛ ذلك ليس دليلًا تلقائيًا على جواز أو منع كل inference. القرار التحفظي `allowAssistant:false` لمحتوى هذين المصدرين إلى أن تُراجع المعالجة/العرض وحقوق المزود وتوثق الإجازة؛ لا تدريب، ولا إرسال raw Program Content إلى طرف ثالث، ولا استنتاج سعر من النموذج. يمكن تنفيذ الاختبارات ببيانات مصطنعة منفصلة، ولا تتوسع هذه السياسة إلى ترخيص غير مفحوص.

[official] [API Rates](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/api-rates): وثائق البداية حتى 1 TPS و8640 TPD لأول 30 يومًا، ثم تتغير حسب الإيراد المشحون؛ يمكن فقد الوصول بعد 30 يومًا بلا مبيعات إحالة مؤهلة. ليست هذه حصة حساب BabiesPicks مثبتة. [GetItems](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference/operations/get-items) يسمح حتى 10 itemIds للطلب؛ لا طلب تحميل/ضغط لإثبات الحصة. [Best Practices](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/concepts/best-programming-practices) وAPI Rates يطلبان الحفاظ على روابط المصدر ومعلماتها؛ لا يمر الرابط المعاد من API في معيد كتابة tag عام يفسد نسبته.

## قاعدة التفعيل والتدهور

1. لا يبدأ أي updater ولا يعرض سعر جديد من صف غير VERIFIED أو `enabled:false`. لا scraping أو استخراج نموذج أو نسخ يدوي يعالج غياب وصول رسمي.
2. إثبات حساب السوق، وPartner Tag الصحيح، واعتماد Creators API الإقليمي، وطلب قراءة ناجح مسموح، وحدود حقول وعمر/احتفاظ فعلية شروط مستقلة. `accessApproval:approved` وحده لا يكفي.
3. لا تفعيل لأدلة وجهة من هذا الناقل كما هو؛ دليل مستقل معتمد مطلوب. المجهول يبقى pending لا نفادًا ولا توصيلًا متاحًا. فشل تحديث جديد لا يجدد checkedAt قديمًا.
4. **الرابط بلا سعر غير مُفعّل تلقائيًا الآن**: `allowBareLink:false` تحفظيًا لكلا السوقين في هذه الحزمة. يمكن مراجعته منفصلًا كرابط واضح غير متتبع دون محتوى Program Content مقيد، مع موافقة سياسة وتحقق هوية القائمة والنطاق وOneLink؛ عندئذ تُعلن حالة `UNTRACKED` ولا تُحقن عمولة سوق آخر. لا تزعم هذه المراجعة أن إزالة tag تمنح حقوق عرض المحتوى.
5. PA-API 5 مسار ميت (`PAAPI5_DEPRECATED`)؛ [Amazon نفسه](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation) يقول إنه deprecated وأن الطلبات تعيد 403 AccessDeniedException ويوجه إلى Creators API. لا نثبت تاريخ إيقاف بعينه من مدونة طرف ثالث؛ لا مصدر ثانوي مستخدم لإثبات تاريخ رسمي.
6. كل سوق لاحق يخضع للتحقق نفسه. عدم توفر مصدر لSA أوUS لا يمنع إنجاز T2–T12 محليًا في وضع معطل ببيانات اختبار معزولة؛ لا يسمى ذلك إطلاقًا دوليًا أو إذن نشر.

## نطاق التحقق الفعلي وما لم يُفحص

- [code] قُرئت [تعليمات المستودع](../../AGENTS.md)، و[Task 1](../superpowers/plans/2026-11-02-international-marketplaces.md#task-1-إثبات-المصدر-وحدود-الإطلاق)، و[التصميم](../architecture/target-design.md)، و[التشغيل](deployment.md)، و[تعليمات الإيجنت](content-agent-instructions.md). Git كان على main مع تعديلات سابقة؛ لم نغيرها.
- [code، متابعة 2026-11-03] [prices.ts](../../packages/domain/src/prices.ts) يختار وسم السوق الصريح أولًا، ثم `AMAZON_ASSOCIATES_TAG` للسعودية فقط، ثم وسم رابط المتجر المطابق للسوق. غياب الوسم يرفض الرابط، وغياب `marketplaceCode` يبقي US مرفوضًا حتى مع وجود وسم US. لا تغيير لبيانات المتاجر أو بيئة التشغيل الحية.
- [not checked، نطاق T1 في 2026-11-02] لم تتوفر أداة Amazon مصادقة أو credentials مصرح استعمالها؛ لم تُنشأ credentials أو طلبات أسعار أو نقرات عمولة أو مشتريات. متابعة 2026-11-03 أنشأت حساب Associates فقط، كما هو موثق أعلاه؛ لا تدّعي وصول API.
- [direct] محاولة GET عامة إلى [MCP المعتمد](https://mcp.babiespicks.com/mcp) أعادت HTTP 401 `MCP_UNAUTHORIZED`؛ لذلك **لم تُقرأ** `tools/list` أو `bp_get_capabilities` الحية. لا ندعي أن العقود المنشورة أو حساب المصدر متاحة من وثيقة deployment القديمة. لم تُكتب بيانات إنتاج ولم يتم cache revalidation.
- [official] جميع أدلة Amazon المذكورة جُلبت مباشرة في 2026-11-02. لا عينات أسعار حساب حقيقية حُفظت، ولا screenshot دليل وصول. صفحة مورد قديمة باسم offers أعادت 404؛ استُخدم رابط OffersV2 المنشور من GetItems بدلًا منها، وليس التفافًا على مصادقة بيانات المنتجات.

## ما يمنع التفعيل الآن

| السوق | حالة النقل المرشح | الحواجز الخاصة بالسوق | ما يمكن استكماله محليًا |
|---|---|---|---|
| SA | UNVERIFIED، معطل | حساب/وسم SA وصلاحية EU غير مثبتة؛ لا طلب ناجح؛ دليل وجهة مستقل مفقود؛ تحويل ومساعد وإجازة الأصل الإنجليزي/احتفاظ غير مغلقة | سجل سياسة معطل، عقود واختبارات وواجهة بحقائق مصطنعة |
| US | UNVERIFIED، معطل | يوجد حساب Associates ووسم `babiespicks-20` غير مربوط؛ الدفع/الضرائب ومراجعة Amazon معلقة؛ وصول API غير مطلوب وصلاحية NA غير مثبتة؛ لا طلب أسعار ناجح ولا دليل توصيل مستقل؛ تحويل ومساعد/احتفاظ غير مغلقة | السلسلة المحلية نفسها، دون جلب أو أسعار دولية عامة |

لا commit/push/deploy، ولا تعديل مهمة خارجية أو تفعيل كاتب. إعادة التحقق واجبة وقت التفعيل؛ هذا التاريخ لا يثبت صلاحية حساب مستقبلًا.
