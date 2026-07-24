-- AlterTable
ALTER TABLE "ProxyKey" ADD COLUMN     "terseness" TEXT NOT NULL DEFAULT 'off',
ADD COLUMN     "tokenSaver" BOOLEAN NOT NULL DEFAULT true;
