-- AlterTable
ALTER TABLE "JobMaterial" ADD COLUMN     "quantityActual" DECIMAL(12,3),
ADD COLUMN     "quantitySpoiled" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "Press" ADD COLUMN     "spoilagePercent" DECIMAL(5,2);
