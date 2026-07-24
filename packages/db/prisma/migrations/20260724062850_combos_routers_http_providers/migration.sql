-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('cli', 'http');

-- CreateEnum
CREATE TYPE "HttpProvider" AS ENUM ('anthropic', 'openai', 'gemini');

-- CreateTable
CREATE TABLE "HttpProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "HttpProvider" NOT NULL,
    "apiKeyCipher" TEXT NOT NULL,
    "baseUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HttpProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Combo" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'priority',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboItem" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "source" "SourceKind" NOT NULL DEFAULT 'cli',
    "cliKind" "CliKind",
    "provider" "HttpProvider",
    "model" TEXT,

    CONSTRAINT "ComboItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Router" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Router_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouterRule" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "source" "SourceKind" DEFAULT 'cli',
    "cliKind" "CliKind",
    "provider" "HttpProvider",
    "model" TEXT,
    "comboId" TEXT,

    CONSTRAINT "RouterRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HttpProviderConfig_provider_key" ON "HttpProviderConfig"("provider");

-- CreateIndex
CREATE INDEX "Combo_ownerId_idx" ON "Combo"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Combo_ownerId_slug_key" ON "Combo"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ComboItem_comboId_order_idx" ON "ComboItem"("comboId", "order");

-- CreateIndex
CREATE INDEX "Router_ownerId_idx" ON "Router"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Router_ownerId_slug_key" ON "Router"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "RouterRule_routerId_idx" ON "RouterRule"("routerId");

-- CreateIndex
CREATE UNIQUE INDEX "RouterRule_routerId_capability_key" ON "RouterRule"("routerId", "capability");

-- AddForeignKey
ALTER TABLE "ComboItem" ADD CONSTRAINT "ComboItem_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "Combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouterRule" ADD CONSTRAINT "RouterRule_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE CASCADE ON UPDATE CASCADE;
