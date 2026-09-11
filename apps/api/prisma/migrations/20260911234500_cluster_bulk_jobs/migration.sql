CREATE TYPE "ClusterBulkAction" AS ENUM ('CONTEXTUALIZE', 'PUBLISH');
CREATE TYPE "ClusterBulkJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'STOPPING', 'COMPLETED', 'CANCELED');
CREATE TYPE "ClusterBulkItemStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'SKIPPED', 'FAILED', 'CANCELED');

CREATE TABLE "ClusterBulkJob" (
    "id" TEXT NOT NULL,
    "activeKey" TEXT,
    "action" "ClusterBulkAction" NOT NULL,
    "status" "ClusterBulkJobStatus" NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "retryOfJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClusterBulkJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClusterBulkJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "executionRevision" TEXT,
    "status" "ClusterBulkItemStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "aiStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClusterBulkJobItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClusterBulkJobRequest" (
    "requestId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" "ClusterBulkAction" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "retryOfJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClusterBulkJobRequest_pkey" PRIMARY KEY ("requestId")
);
CREATE UNIQUE INDEX "ClusterBulkJob_activeKey_key" ON "ClusterBulkJob"("activeKey");
CREATE INDEX "ClusterBulkJob_action_createdAt_idx" ON "ClusterBulkJob"("action", "createdAt");
CREATE INDEX "ClusterBulkJob_status_createdAt_idx" ON "ClusterBulkJob"("status", "createdAt");
CREATE UNIQUE INDEX "ClusterBulkJobItem_jobId_clusterId_key" ON "ClusterBulkJobItem"("jobId", "clusterId");
CREATE INDEX "ClusterBulkJobItem_jobId_status_createdAt_idx" ON "ClusterBulkJobItem"("jobId", "status", "createdAt");
CREATE INDEX "ClusterBulkJobRequest_jobId_idx" ON "ClusterBulkJobRequest"("jobId");
ALTER TABLE "ClusterBulkJob" ADD CONSTRAINT "ClusterBulkJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClusterBulkJobItem" ADD CONSTRAINT "ClusterBulkJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClusterBulkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClusterBulkJobRequest" ADD CONSTRAINT "ClusterBulkJobRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ClusterBulkJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
