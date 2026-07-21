-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CliKind" ADD VALUE 'copilot';
ALTER TYPE "CliKind" ADD VALUE 'aider';
ALTER TYPE "CliKind" ADD VALUE 'qwen';
ALTER TYPE "CliKind" ADD VALUE 'amp';
ALTER TYPE "CliKind" ADD VALUE 'goose';
ALTER TYPE "CliKind" ADD VALUE 'grok';
ALTER TYPE "CliKind" ADD VALUE 'continue';
