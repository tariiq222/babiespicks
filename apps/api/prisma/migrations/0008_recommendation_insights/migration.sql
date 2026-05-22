-- CreateTable
CREATE TABLE "recommendation_insights" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "recommendedAction" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommendation_insights_sourceType_sourceId_idx" ON "recommendation_insights"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "recommendation_insights_insightType_idx" ON "recommendation_insights"("insightType");
