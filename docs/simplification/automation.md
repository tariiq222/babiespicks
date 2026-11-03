# إدارة المحتوى والروتين الخارجي

تصفح الموقع وإدارة المحتوى عبر MCP لا يحتاجان جلسة مساعد مفتوحة. مساعد التسوق العام الاختياري يستخدم مزود النموذج المهيأ له؛ وهو منفصل عن إيجنت المحتوى ومحدّث الأسعار الخارجيين. يربط المالك MCP مستقلًا، ويستطيع طلب البحث وكتابة مراجعة وتحديث سعر ونشر إصدار راجعه. الأدوات تسجل العمليات والإصدارات؛ لا حساب للمبيعات/الأرباح دون تكامل مصدر فعلي. الصور المرفوعة عامة ولو ارتبطت بمسودة.

مرجع تعليمات الإيجنت ومحدّث الأسعار هو [تعليمات التشغيل](../operations/content-agent-instructions.md)، الإصدار `2026-11-02.2` (السابق `2026-11-02.1`). تعليمات المشروع الخارجي وتعليمات المهمة المجدولة نسختان يجب مزامنتهما والتحقق منهما؛ تعديل المستودع لا يعدلهما تلقائيًا. الإصدار المستخدم يظهر في `bp_get_capabilities.internationalOffers.agentInstructionVersion`، و`enabled:false` يعني تأجيل USD والأدلة غير المدعومة لا الاستنتاج. إجراء التطبيق وحالة المزامنة الحالية (المشروع والمهمة **غير مثبتين** بعد) في [agent-sync.md](../operations/agent-sync.md)، مع احترام حدود العقد الحالي وصلاحيات النشر وفق [خطة التنفيذ](../superpowers/plans/2026-11-02-international-marketplaces.md).

تسلسل العمل: قراءة bp_get_capabilities ← جمع معلومات ومصادر مؤكدة ← إنشاء مسودة/تحديث بإصدار متوقع ← مراجعة ← bp_set_status مع confirm:true والتفويض المناسب. تعديل منشور يحتاج allowPublishedEdit:true وينعكس للعامة فورًا. خطأ VERSION_CONFLICT يستدعي القراءة والمراجعة، لا استبدال الإصدار آليًا. إعادة نفس العملية تستخدم نفس idempotencyKey؛ تغيير المدخلات يحتاج مفتاحًا جديدًا.

عند تشغيل روتين خارجي، اجعله دفعة محدودة من تحديثات الأسعار أو المحتوى ضمن نطاق المهمة. افحص المشغّل والمهمة الموجودين قبل إنشاء أي بديل، وسجّل الوقت والمنطقة الزمنية والعدد ومصادر البحث وحدود النشر. وجود مهمة في واجهة خارجية أو وصف قديم هنا لا يثبت حالتها الحالية أو اتصالها أو تفويضها؛ يُتحقق منها مباشرة دون إطلاق كاتب إضافي. تشغيل MCP محليًا لا يثبت ربط ChatGPT الحي.

إذا اعتمد المالك النشر اليومي، تحفظ المهمة حدود التفويض ولا تعممها على أي محتوى. النشر المؤجل مرتبط بعنصر وإصدار وموافقة ووقت؛ اختلاف الإصدار وقت التنفيذ يتوقف للمراجعة. الجلب المحجوب والسعر المجهول يبقيان مجهولين. quota المنتهية لا يعاد طلبها؛ الخدمة المتعثرة تسمح بمحاولة عابرة واحدة محدودة. الإشعارات عند تغيير مهم أو فشل يحتاج تدخلًا، لا لكل تشغيل ثابت.

X وتيليجرام والنشرات البريدية ليس لها ناشر نشط داخل النسخة المبسطة. سجلاتها القديمة محفوظة للمراجعة، ولا تنفيذ لها عند النقل. يحتاج استخدامها لاحقًا موصلًا خارجيًا مصرحًا ومختبرًا. لا إرسال تجريبي لعملاء أو حسابات عامة.

Current catalog-wiring instruction draft: `2026-11-03.1`; previous deployed reference: `2026-11-02.2` at `52ba693`. This adds market-scoped store administration without source activation, publishing-grant changes or external prompt synchronization. Read live schemas/capabilities before using new fields; see [agent-sync.md](../operations/agent-sync.md).

Rakazo operating version: `2026-11-03.2`. MCP-first monthly publication target50; multi-site editorial assessment is required by the owner. `bp_get_publication_progress` provides light count/reference-coverage/candidate data without product bodies. Existing publisher/updater roles and publishing grants are preserved; no Amazon API dependency or extra scheduled writer is introduced. See the canonical content-agent instructions and Rakazo team operating record.
