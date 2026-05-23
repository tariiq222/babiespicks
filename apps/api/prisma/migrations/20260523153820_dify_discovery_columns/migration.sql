-- AlterTable
ALTER TABLE "content_pages" ADD COLUMN "discovery_source" TEXT;
ALTER TABLE "content_pages" ADD COLUMN "trend_score" SMALLINT;
ALTER TABLE "content_pages" ADD COLUMN "dify_run_id" UUID;

-- CreateTable
CREATE TABLE "dify_runs" (
    "id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "total_candidates" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "triggered_by" TEXT NOT NULL,
    "triggered_by_user_id" UUID,
    "error" JSONB,

    CONSTRAINT "dify_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dify_runs_started_at_idx" ON "dify_runs"("started_at");

-- CreateIndex
CREATE INDEX "content_pages_dify_run_id_idx" ON "content_pages"("dify_run_id");

-- AddForeignKey
ALTER TABLE "content_pages" ADD CONSTRAINT "content_pages_dify_run_id_fkey" FOREIGN KEY ("dify_run_id") REFERENCES "dify_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
