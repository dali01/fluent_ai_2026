-- CreateEnum
CREATE TYPE "ProspectSource" AS ENUM ('PLACES', 'PERMIT', 'FDA', 'MANUAL');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ENRICHED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SourceRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStage" ADD VALUE 'PROSPECT';
ALTER TYPE "LeadStage" ADD VALUE 'DISQUALIFIED';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactTitle" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "discoveredAt" TIMESTAMP(3),
ADD COLUMN     "enrichedAt" TIMESTAMP(3),
ADD COLUMN     "enrichmentProvider" TEXT,
ADD COLUMN     "enrichmentStatus" "EnrichmentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "locationKey" TEXT,
ADD COLUMN     "normalizedName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "prospectSource" "ProspectSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoreBreakdown" JSONB,
ADD COLUMN     "signal" JSONB,
ADD COLUMN     "triggerReason" TEXT,
ADD COLUMN     "triggeredAt" TIMESTAMP(3),
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "SourceRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "ProspectSource" NOT NULL,
    "status" "SourceRunStatus" NOT NULL DEFAULT 'RUNNING',
    "cursor" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "screenedOut" INTEGER NOT NULL DEFAULT 0,
    "enriched" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "warnings" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceRun_organizationId_source_startedAt_idx" ON "SourceRun"("organizationId", "source", "startedAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_normalizedName_idx" ON "Lead"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "Lead_organizationId_locationKey_idx" ON "Lead"("organizationId", "locationKey");

-- CreateIndex
CREATE INDEX "Lead_organizationId_stage_score_idx" ON "Lead"("organizationId", "stage", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_prospectSource_externalId_key" ON "Lead"("organizationId", "prospectSource", "externalId");

-- AddForeignKey
ALTER TABLE "SourceRun" ADD CONSTRAINT "SourceRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
