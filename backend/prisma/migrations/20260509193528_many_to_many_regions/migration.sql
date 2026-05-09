/*
  Warnings:

  - You are about to drop the column `regionId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_regionId_fkey";

-- DropIndex
DROP INDEX "User_role_regionId_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "regionId";

-- CreateTable
CREATE TABLE "_RegionToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RegionToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RegionToUser_B_index" ON "_RegionToUser"("B");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- AddForeignKey
ALTER TABLE "_RegionToUser" ADD CONSTRAINT "_RegionToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RegionToUser" ADD CONSTRAINT "_RegionToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
