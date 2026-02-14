-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'python',
    "interpreter" TEXT,
    "webhook_token" TEXT,
    "webhook_secret" TEXT,
    "require_webhook_signature" BOOLEAN NOT NULL DEFAULT false,
    "schedule_cron" TEXT,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "parameters" TEXT NOT NULL DEFAULT '[]',
    "gist_id" TEXT,
    "gist_url" TEXT,
    "sync_to_gist" BOOLEAN NOT NULL DEFAULT false,
    "gist_filename" TEXT,
    "collection_id" TEXT,
    "timeout_ms" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_run" DATETIME,
    CONSTRAINT "scripts_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_scripts" ("collection_id", "created_at", "description", "filename", "gist_filename", "gist_id", "gist_url", "id", "interpreter", "language", "last_run", "name", "parameters", "schedule_cron", "schedule_enabled", "sync_to_gist", "timeout_ms", "updated_at", "webhook_token") SELECT "collection_id", "created_at", "description", "filename", "gist_filename", "gist_id", "gist_url", "id", "interpreter", "language", "last_run", "name", "parameters", "schedule_cron", "schedule_enabled", "sync_to_gist", "timeout_ms", "updated_at", "webhook_token" FROM "scripts";
DROP TABLE "scripts";
ALTER TABLE "new_scripts" RENAME TO "scripts";
CREATE UNIQUE INDEX "scripts_name_key" ON "scripts"("name");
CREATE UNIQUE INDEX "scripts_webhook_token_key" ON "scripts"("webhook_token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
