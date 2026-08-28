ALTER TABLE "collections" ADD COLUMN "folder_available" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "collections" ADD COLUMN "folder_last_scanned_at" DATETIME;
