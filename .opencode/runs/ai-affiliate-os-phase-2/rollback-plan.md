# Rollback Plan

## Principle

Phase 2 is fully additive: new controllers, new services, new DTOs, new tests, and new dashboard UI sections. No existing models, controllers, or flows are modified in ways that would break existing behavior.

## Rollback Steps (if needed after deployment)

### 1. Revert backend controllers and services

Delete the following files:

```
apps/api/src/features/affiliate-ai-os/offer-enrichments.controller.ts
apps/api/src/features/affiliate-ai-os/offer-enrichments.service.ts
apps/api/src/features/affiliate-ai-os/content-drafts.controller.ts
apps/api/src/features/affiliate-ai-os/content-drafts.service.ts
apps/api/src/features/affiliate-ai-os/phase-2.dto.ts
```

### 2. Revert module registration

In `apps/api/src/features/affiliate-ai-os/affiliate-ai-os.module.ts`, remove:

```ts
import { OfferEnrichmentsController } from './offer-enrichments.controller';
import { OfferEnrichmentsService } from './offer-enrichments.service';
import { ContentDraftsController } from './content-drafts.controller';
import { ContentDraftsService } from './content-drafts.service';
```

And remove from `controllers` array: `OfferEnrichmentsController`, `ContentDraftsController`.
And remove from `providers` array: `OfferEnrichmentsService`, `ContentDraftsService`.
And remove from `exports` array: `OfferEnrichmentsService`, `ContentDraftsService`.

### 3. Revert test additions

Delete the following files:

```
apps/api/src/features/affiliate-ai-os/__tests__/offer-enrichments.service.spec.ts
apps/api/src/features/affiliate-ai-os/__tests__/offer-enrichments.controller.spec.ts
apps/api/src/features/affiliate-ai-os/__tests__/content-drafts.service.spec.ts
apps/api/src/features/affiliate-ai-os/__tests__/content-drafts.controller.spec.ts
```

### 4. Revert dashboard UI additions

In `apps/web/src/app/[locale]/admin/affiliate-os/page.tsx`, remove:
- `OfferEnrichment` and `ArticleContentDraft` interfaces
- `offerEnrichments` and `articleContentDrafts` fields from `DashboardData`
- `isOfferEnrichment` and `isArticleContentDraft` guard functions
- Fetches for `offerEnrichments` and `articleContentDrafts` in `fetchAllData()`
- Three new Panel sections: "Ready for Enrichment", "Offer Enrichments", "Article Drafts / Content Queue"
- Any related state, handlers, or extracted data

### 5. Revert translation additions

Remove the following keys from `apps/web/messages/ar.json` (section `admin.affiliateOs.phase2`) and `apps/web/messages/en.json` (section `admin.affiliateOs.phase2`):
- `readyForEnrichment`, `noReadyForEnrichment`, `readyForEnrichmentCaption`
- `generateEnrichment`, `enrichmentGenerated`
- `offerEnrichments`, `noOfferEnrichments`, `offerEnrichmentsCaption`
- `offerTitle`, `targetAudience`, `keyBenefits`, `positioningAngle`, `confidence`
- `generateArticleDraft`, `articleDraftGenerated`
- `articleDrafts`, `noArticleDrafts`, `articleDraftsCaption`
- `approvalStatus`, `angle`, `articleApproved`, `articleRejected`

### 6. Revert documentation

Delete:
```
docs/ai-affiliate-os/phase-2-offer-enrichment-content-drafts.md
```

## Database Safety

- **No destructive migrations.** Zero tables dropped, zero columns removed.
- **Offer enrichments** are stored as `AiRun` rows — these are not referenced by any other table and can remain as-is after rollback.
- **ArticleDraft records** created during Phase 2 deployment will remain as orphaned rows. They do not affect existing `ContentPage`, `ProductDraft`, or `SocialPost` queries because there are no foreign-key constraints from `ArticleDraft` to those models.
- **ApprovalAuditEvent records** are append-only and remain valid even after rollback.

## Order of Safety

1. **Frontend rollback first** — removes user-facing UI immediately, reducing confusion.
2. **API rollback second** — stops new offer enrichment and content draft creation.
3. **Database cleanup last** (optional) — orphaned `AiRun` and `ArticleDraft` rows can be cleaned up with a targeted DELETE if desired, but are not required for rollback safety.

## Validation After Rollback

```bash
pnpm --dir apps/api type-check
pnpm --dir apps/web type-check
pnpm --dir apps/api test src/features/affiliate-ai-os
pnpm turbo test
```

All existing Phase 1 tests must continue to pass. No broken module references should remain in the module graph.
