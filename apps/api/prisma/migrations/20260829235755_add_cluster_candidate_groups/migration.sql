/*
  Warnings:

  - You are about to drop the column `articleId` on the `ClusterCandidate` table. All the data in the column will be lost.
  - You are about to drop the column `clusterId` on the `ClusterCandidate` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `ClusterCandidate` table. All the data in the column will be lost.
  - Added the required column `algorithm` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `articlesCount` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minClusterSize` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `similarityThreshold` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeWindowDays` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ClusterCandidate` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ClusterCandidate" DROP CONSTRAINT "ClusterCandidate_articleId_fkey";

-- DropForeignKey
ALTER TABLE "ClusterCandidate" DROP CONSTRAINT "ClusterCandidate_clusterId_fkey";

-- DropIndex
DROP INDEX "ClusterCandidate_articleId_clusterId_key";

-- DropIndex
DROP INDEX "ClusterCandidate_articleId_idx";

-- DropIndex
DROP INDEX "ClusterCandidate_clusterId_idx";

-- AlterTable
ALTER TABLE "ClusterCandidate" DROP COLUMN "articleId",
DROP COLUMN "clusterId",
DROP COLUMN "score",
ADD COLUMN     "algorithm" TEXT NOT NULL,
ADD COLUMN     "articlesCount" INTEGER NOT NULL,
ADD COLUMN     "averageSimilarity" DOUBLE PRECISION,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "maxClusterSize" INTEGER,
ADD COLUMN     "minClusterSize" INTEGER NOT NULL,
ADD COLUMN     "similarityThreshold" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "timeWindowDays" INTEGER NOT NULL,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "ArticleClusterCandidate" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ArticleClusterCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterCandidateArticle" (
    "candidateId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ClusterCandidateArticle_pkey" PRIMARY KEY ("candidateId","articleId")
);

-- CreateIndex
CREATE INDEX "ArticleClusterCandidate_articleId_idx" ON "ArticleClusterCandidate"("articleId");

-- CreateIndex
CREATE INDEX "ArticleClusterCandidate_clusterId_idx" ON "ArticleClusterCandidate"("clusterId");

-- CreateIndex
CREATE INDEX "ArticleClusterCandidate_status_idx" ON "ArticleClusterCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleClusterCandidate_articleId_clusterId_key" ON "ArticleClusterCandidate"("articleId", "clusterId");

-- CreateIndex
CREATE INDEX "ClusterCandidateArticle_articleId_idx" ON "ClusterCandidateArticle"("articleId");

-- CreateIndex
CREATE INDEX "ClusterCandidateArticle_candidateId_idx" ON "ClusterCandidateArticle"("candidateId");

-- CreateIndex
CREATE INDEX "ClusterCandidate_createdAt_idx" ON "ClusterCandidate"("createdAt");

-- CreateIndex
CREATE INDEX "ClusterCandidate_averageSimilarity_idx" ON "ClusterCandidate"("averageSimilarity");

-- CreateIndex
CREATE INDEX "ClusterCandidate_startDate_idx" ON "ClusterCandidate"("startDate");

-- CreateIndex
CREATE INDEX "ClusterCandidate_endDate_idx" ON "ClusterCandidate"("endDate");

-- AddForeignKey
ALTER TABLE "ArticleClusterCandidate" ADD CONSTRAINT "ArticleClusterCandidate_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleClusterCandidate" ADD CONSTRAINT "ArticleClusterCandidate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleClusterCandidate" ADD CONSTRAINT "ArticleClusterCandidate_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterCandidateArticle" ADD CONSTRAINT "ClusterCandidateArticle_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ClusterCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterCandidateArticle" ADD CONSTRAINT "ClusterCandidateArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
