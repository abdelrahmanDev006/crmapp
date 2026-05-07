-- AlterEnum
ALTER TYPE "ClientStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "pendingCustomVisitIntervalDays" INTEGER,
ADD COLUMN     "pendingNote" TEXT,
ADD COLUMN     "pendingOutcome" "ClientStatus",
ADD COLUMN     "pendingVisitType" "VisitType";
