ALTER TABLE "collections" ADD COLUMN "folder_path" TEXT;
ALTER TABLE "collections" ADD COLUMN "is_temporary" BOOLEAN NOT NULL DEFAULT 0;

ALTER TABLE "scripts" ADD COLUMN "source_path" TEXT;
