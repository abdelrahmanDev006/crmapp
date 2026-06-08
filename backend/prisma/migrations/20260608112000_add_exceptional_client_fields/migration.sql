-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "exceptionalNextVisitDate" TIMESTAMP(3),
ADD COLUMN     "exceptionalReason" TEXT,
ADD COLUMN     "isExceptional" BOOLEAN NOT NULL DEFAULT false;
