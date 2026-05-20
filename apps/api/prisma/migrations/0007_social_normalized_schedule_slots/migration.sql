-- Replace the raw platform/scheduledAt guard from 0006 because app logic treats
-- `x` and `twitter` as the same social platform for scheduling capacity.
DROP INDEX IF EXISTS "social_posts_platform_scheduled_at_unique";

-- Prisma schema cannot express expression indexes. This unique index normalizes
-- twitter aliases and only applies to rows that actually have a scheduled slot.
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_normalized_platform_scheduled_at_unique"
ON "social_posts"(
  (CASE WHEN "platform" IN ('twitter', 'x') THEN 'twitter' ELSE "platform" END),
  "scheduledAt"
)
WHERE "scheduledAt" IS NOT NULL;
