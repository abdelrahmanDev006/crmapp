-- DropIndex
DROP INDEX "Client_isDeleted_idx";

-- DropIndex
DROP INDEX "Client_isDeleted_status_idx";

-- DropIndex
DROP INDEX "Client_name_idx";

-- DropIndex
DROP INDEX "Client_regionId_visitType_status_nextVisitDate_idx";

-- DropIndex
DROP INDEX "Client_status_nextVisitDate_idx";

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "priceValue" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Client_isDeleted_regionId_status_nextVisitDate_idx" ON "Client"("isDeleted", "regionId", "status", "nextVisitDate");

-- CreateIndex
CREATE INDEX "Client_isDeleted_regionId_nextVisitDate_idx" ON "Client"("isDeleted", "regionId", "nextVisitDate");

-- CreateIndex
CREATE INDEX "Client_isDeleted_status_nextVisitDate_idx" ON "Client"("isDeleted", "status", "nextVisitDate");

-- CreateIndex
CREATE INDEX "Client_phoneNormalized_idx" ON "Client"("phoneNormalized");
