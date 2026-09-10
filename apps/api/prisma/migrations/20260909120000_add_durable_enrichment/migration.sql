CREATE TYPE "EnrichmentJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED');
CREATE TYPE "EnrichmentItemStatus" AS ENUM ('PENDING', 'RUNNING', 'FULL_TEXT', 'PARTIAL_TEXT', 'PROPOSED', 'UNCHANGED', 'SKIPPED', 'ERROR', 'CANCELED');
CREATE TYPE "EnrichmentProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED');

ALTER TABLE "Article" ADD COLUMN "contentProvenance" JSONB, ADD COLUMN "contentAssessment" JSONB;

CREATE TABLE "ArticleContentVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "afterArticleUpdatedAt" TIMESTAMP(3) NOT NULL,
    "jobItemId" TEXT,
    "restoredFromVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArticleContentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnrichmentJob" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "EnrichmentJobStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnrichmentJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnrichmentJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "expectedArticleUpdatedAt" TIMESTAMP(3),
    "status" "EnrichmentItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "reason" TEXT,
    "proposal" JSONB,
    "proposalStatus" "EnrichmentProposalStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnrichmentJobItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArticleContentVersion_articleId_createdAt_idx" ON "ArticleContentVersion"("articleId", "createdAt");
CREATE INDEX "ArticleContentVersion_jobItemId_idx" ON "ArticleContentVersion"("jobItemId");
CREATE INDEX "EnrichmentJob_status_createdAt_idx" ON "EnrichmentJob"("status", "createdAt");
CREATE UNIQUE INDEX "EnrichmentJob_requestId_key" ON "EnrichmentJob"("requestId");
CREATE UNIQUE INDEX "EnrichmentJobItem_jobId_articleId_key" ON "EnrichmentJobItem"("jobId", "articleId");
CREATE INDEX "EnrichmentJobItem_jobId_status_leaseExpiresAt_idx" ON "EnrichmentJobItem"("jobId", "status", "leaseExpiresAt");
CREATE INDEX "EnrichmentJobItem_articleId_createdAt_idx" ON "EnrichmentJobItem"("articleId", "createdAt");

ALTER TABLE "ArticleContentVersion" ADD CONSTRAINT "ArticleContentVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrichmentJob" ADD CONSTRAINT "EnrichmentJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrichmentJobItem" ADD CONSTRAINT "EnrichmentJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "EnrichmentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
