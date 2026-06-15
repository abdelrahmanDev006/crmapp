-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VISA');

-- AlterTable
ALTER TABLE "VisitHistory" ADD COLUMN     "paymentMethod" "PaymentMethod";
