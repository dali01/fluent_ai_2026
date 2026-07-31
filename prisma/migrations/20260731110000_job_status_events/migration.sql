-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "deliveredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Press" ADD COLUMN     "hourlyRateCents" INTEGER,
ADD COLUMN     "makereadyMinutes" INTEGER,
ADD COLUMN     "makereadySheets" INTEGER,
ADD COLUMN     "sheetHeightMm" DECIMAL(8,2),
ADD COLUMN     "sheetWidthMm" DECIMAL(8,2),
ADD COLUMN     "sheetsPerHour" INTEGER;

-- CreateTable
CREATE TABLE "JobStatusEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "JobStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobStatusEvent_organizationId_idx" ON "JobStatusEvent"("organizationId");

-- CreateIndex
CREATE INDEX "JobStatusEvent_jobId_at_idx" ON "JobStatusEvent"("jobId", "at");

-- CreateIndex
CREATE INDEX "JobStatusEvent_organizationId_toStatus_at_idx" ON "JobStatusEvent"("organizationId", "toStatus", "at");

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStatusEvent" ADD CONSTRAINT "JobStatusEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
