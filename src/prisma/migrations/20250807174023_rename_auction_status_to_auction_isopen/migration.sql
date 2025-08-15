/*
  Warnings:

  - You are about to drop the column `status` on the `Auction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Auction" DROP COLUMN "status",
ADD COLUMN     "isOpen" BOOLEAN NOT NULL DEFAULT true;
