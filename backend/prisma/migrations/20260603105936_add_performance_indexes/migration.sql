-- CreateIndex
CREATE INDEX "Client_isDeleted_status_idx" ON "Client"("isDeleted", "status");

-- CreateIndex
CREATE INDEX "Client_isDeleted_nextVisitDate_idx" ON "Client"("isDeleted", "nextVisitDate");

-- CreateIndex
CREATE INDEX "Client_isDeleted_regionId_status_idx" ON "Client"("isDeleted", "regionId", "status");
