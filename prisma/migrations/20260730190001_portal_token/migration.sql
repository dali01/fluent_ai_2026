-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "portalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_portalToken_key" ON "Contact"("portalToken");
