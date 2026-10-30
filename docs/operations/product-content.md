# Product content through MCP

Keep imageUrl as the cover. imageUrls is an ordered optional list of up to 12 actual photos for the exact product. Omitting it preserves saved photos; [] clears extra photos without clearing the cover. Never fabricate image URLs or duplicate one photo to claim multiple photos. Upload media through bp_upload_image or use a verified HTTPS product image URL.

Write translations.description as Markdown with a short opening paragraph, product information, and cautions. Do not place purchase URLs or prices in description/specs; use bp_record_price and the existing store redirect. Existing inline Arabic headings remain readable.

Use reviewSummary.averageRating (0–5) and totalReviews for shopper ratings. Amazon display requires a sources entry with field reviewSummary, an actual Amazon product URL and checkedAt. A price source alone does not establish review provenance. Our rating is verdict.overallScore (0–10), consistent with existing weighted criteria and reasoning; source it with field verdict. Unknown ratings remain absent. The current values are observations, not a claim of physical testing.

Published edits require owner authorization, fresh expectedVersion, allowPublishedEdit:true, and a stable idempotencyKey. Fetch the current product first, preserve existing sources/translations/specs not being changed, and re-read on version conflict. Cache invalidation warnings are retried with bp_revalidate rather than repeating an edit. No content writes are permitted as production test fixtures.

The imageUrls schema migration is additive; old readers/writers remain compatible. Roll back the app if necessary while retaining the column and gallery data. Back up before migration and validate on an isolated restored database.

## Categories and filters

The public home page filters by category, brand, price band, discount, Amazon rating and our assessment using URL query parameters on the locale home. Every filter reads MCP-managed data; bp_get_capabilities.publicFilters lists each source. Create categories with bp_upsert_category (name for Arabic, nameEn for English, order for position), find unassigned products with bp_list_products uncategorized:true, then assign categoryId through bp_update_product under the usual published-edit rules. Keep brand spelling identical across products. Pass originalAmount to bp_record_price only when the store shows a higher pre-discount price. The category filter appears once at least one priced product has a category labelled for that locale.

## Editorial score policy
Read bp_get_capabilities.verdictPolicy. Component weights: safety25%, quality25%, reviews20%, price15%, longTerm15%. Round the weighted sum to one decimal; the stored total is this computed value. The supplied total must be within0.11 and the supplied type must match: WORTH_IT >=7.5, WORTH_IT_WITH >=6 and <7.5, WAIT >=4.5 and <6, NOT_WORTH_IT <4.5. A proposed7.6 WORTH_IT_WITH is invalid under this existing policy. Do not lower evidence-based components to force a label; report the policy conflict.

## Amazon affiliation
OpenShip web and MCP receive the owner-confirmed public tracking ID babiespicks-21. Purchase resolution uses AMAZON_ASSOCIATES_TAG first, then the selected Amazon store URL tag; a tagged saved observation is preserved when neither setting exists. The current tag is applied at redirect time, so changing it does not require inserting new price observations. Confirm the302 Location from/go/best and/go/product/store. Arrival on Amazon and eventual commission credit are separate provider outcomes.
