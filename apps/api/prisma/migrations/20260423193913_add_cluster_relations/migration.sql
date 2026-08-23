-- CreateEnum
CREATE TYPE "ClusterRelationType" AS ENUM ('CONTINUES', 'FOLLOW_UP', 'SPLIT_FROM');

-- CreateTable
CREATE TABLE "ClusterRelation" (
    "id" TEXT NOT NULL,
    "fromClusterId" TEXT NOT NULL,
    "toClusterId" TEXT NOT NULL,
    "type" "ClusterRelationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClusterRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClusterRelation_fromClusterId_idx" ON "ClusterRelation"("fromClusterId");

-- CreateIndex
CREATE INDEX "ClusterRelation_toClusterId_idx" ON "ClusterRelation"("toClusterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterRelation_fromClusterId_toClusterId_type_key" ON "ClusterRelation"("fromClusterId", "toClusterId", "type");

-- AddForeignKey
ALTER TABLE "ClusterRelation" ADD CONSTRAINT "ClusterRelation_fromClusterId_fkey" FOREIGN KEY ("fromClusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterRelation" ADD CONSTRAINT "ClusterRelation_toClusterId_fkey" FOREIGN KEY ("toClusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
