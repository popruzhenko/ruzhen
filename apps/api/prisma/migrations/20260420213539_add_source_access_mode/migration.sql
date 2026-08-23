-- CreateEnum
CREATE TYPE "SourceAccessMode" AS ENUM ('FULL_OPEN', 'METADATA_ONLY');

-- CreateEnum
CREATE TYPE "ContentAvailability" AS ENUM ('FULL_TEXT', 'PARTIAL_TEXT', 'SUMMARY_ONLY', 'TITLE_ONLY', 'PREVIEW_ONLY');

-- CreateEnum
CREATE TYPE "EmbeddingBasis" AS ENUM ('FULL_TEXT', 'PARTIAL_TEXT', 'SUMMARY_ONLY', 'TITLE_ONLY', 'CLEANED_ACCESSIBLE_TEXT');

-- CreateEnum
CREATE TYPE "CleaningMethod" AS ENUM ('RULE_BASED', 'LLM_ASSISTED');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "cleanedAccessibleText" TEXT,
ADD COLUMN     "cleaningMethod" "CleaningMethod",
ADD COLUMN     "contentAvailability" "ContentAvailability",
ADD COLUMN     "embeddingBasis" "EmbeddingBasis",
ADD COLUMN     "embeddingModel" TEXT;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "accessMode" "SourceAccessMode" NOT NULL DEFAULT 'FULL_OPEN';

-- CreateIndex
CREATE INDEX "Article_contentAvailability_idx" ON "Article"("contentAvailability");
