# Product content through MCP

Keep imageUrl as the cover. imageUrls is an ordered optional list of up to 12 actual photos for the exact product. Omitting it preserves saved photos; [] clears extra photos without clearing the cover. Never fabricate image URLs or duplicate one photo to claim multiple photos. Upload media through bp_upload_image or use a verified HTTPS product image URL.

Write translations.description as Markdown with a short opening paragraph, product information, and cautions. Do not place purchase URLs or prices in description/specs; use bp_record_price and the existing store redirect. Existing inline Arabic headings remain readable.

Use reviewSummary.averageRating (0–5) and totalReviews for shopper ratings. Amazon display requires a sources entry with field reviewSummary, an actual Amazon product URL and checkedAt. A price source alone does not establish review provenance. Our rating is verdict.overallScore (0–10), consistent with existing weighted criteria and reasoning; source it with field verdict. Unknown ratings remain absent. The current values are observations, not a claim of physical testing.

Published edits require owner authorization, fresh expectedVersion, allowPublishedEdit:true, and a stable idempotencyKey. Fetch the current product first, preserve existing sources/translations/specs not being changed, and re-read on version conflict. Cache invalidation warnings are retried with bp_revalidate rather than repeating an edit. No content writes are permitted as production test fixtures.

The imageUrls schema migration is additive; old readers/writers remain compatible. Roll back the app if necessary while retaining the column and gallery data. Back up before migration and validate on an isolated restored database.
