-- AlterEnum: durable in-flight claim state for social publishing.
ALTER TYPE "SocialPostStatus" ADD VALUE IF NOT EXISTS 'PUBLISHING';

-- CreateIndex: one platform cannot own the same non-null schedule slot twice.
CREATE UNIQUE INDEX IF NOT EXISTS "social_posts_platform_scheduled_at_unique"
ON "social_posts"("platform", "scheduledAt");
