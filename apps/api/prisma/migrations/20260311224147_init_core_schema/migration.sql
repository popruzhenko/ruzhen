-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'API', 'SCRAPE');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('NEW', 'EMBEDDED', 'CLUSTERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClusterArticleMethod" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('FACT', 'CONTEXT', 'OPINION');

-- CreateEnum
CREATE TYPE "OpinionStance" AS ENUM ('PRO', 'CONTRA', 'NEUTRAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "language" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "publishedAt" TIMESTAMP(3),
    "language" TEXT,
    "country" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'NEW',
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleRaw" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parserVersion" TEXT,

    CONSTRAINT "ArticleRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "mainCountry" TEXT,
    "startDate" TIMESTAMP(3),
    "status" "ClusterStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "embedding" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterArticle" (
    "clusterId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "method" "ClusterArticleMethod" NOT NULL,

    CONSTRAINT "ClusterArticle_pkey" PRIMARY KEY ("clusterId","articleId")
);

-- CreateTable
CREATE TABLE "ClusterCandidate" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ClusterCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterBlock" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sourceName" TEXT,
    "authorName" TEXT,
    "stance" "OpinionStance",
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClusterBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "userId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("userId","clusterId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterTag" (
    "clusterId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ClusterTag_pkey" PRIMARY KEY ("clusterId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_baseUrl_key" ON "Source"("name", "baseUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Article_url_key" ON "Article"("url");

-- CreateIndex
CREATE INDEX "Article_sourceId_idx" ON "Article"("sourceId");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "Article"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleRaw_articleId_key" ON "ArticleRaw"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_humanId_key" ON "Cluster"("humanId");

-- CreateIndex
CREATE INDEX "Cluster_status_idx" ON "Cluster"("status");

-- CreateIndex
CREATE INDEX "Cluster_createdByUserId_idx" ON "Cluster"("createdByUserId");

-- CreateIndex
CREATE INDEX "Cluster_publishedAt_idx" ON "Cluster"("publishedAt");

-- CreateIndex
CREATE INDEX "ClusterArticle_articleId_idx" ON "ClusterArticle"("articleId");

-- CreateIndex
CREATE INDEX "ClusterArticle_addedByUserId_idx" ON "ClusterArticle"("addedByUserId");

-- CreateIndex
CREATE INDEX "ClusterCandidate_articleId_idx" ON "ClusterCandidate"("articleId");

-- CreateIndex
CREATE INDEX "ClusterCandidate_clusterId_idx" ON "ClusterCandidate"("clusterId");

-- CreateIndex
CREATE INDEX "ClusterCandidate_status_idx" ON "ClusterCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterCandidate_articleId_clusterId_key" ON "ClusterCandidate"("articleId", "clusterId");

-- CreateIndex
CREATE INDEX "ClusterBlock_clusterId_idx" ON "ClusterBlock"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterBlock_clusterId_position_key" ON "ClusterBlock"("clusterId", "position");

-- CreateIndex
CREATE INDEX "Bookmark_clusterId_idx" ON "Bookmark"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ClusterTag_tagId_idx" ON "ClusterTag"("tagId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleRaw" ADD CONSTRAINT "ArticleRaw_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterArticle" ADD CONSTRAINT "ClusterArticle_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterArticle" ADD CONSTRAINT "ClusterArticle_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterArticle" ADD CONSTRAINT "ClusterArticle_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterCandidate" ADD CONSTRAINT "ClusterCandidate_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterCandidate" ADD CONSTRAINT "ClusterCandidate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterCandidate" ADD CONSTRAINT "ClusterCandidate_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterBlock" ADD CONSTRAINT "ClusterBlock_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterBlock" ADD CONSTRAINT "ClusterBlock_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterTag" ADD CONSTRAINT "ClusterTag_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterTag" ADD CONSTRAINT "ClusterTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
