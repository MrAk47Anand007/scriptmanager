-- CreateTable
CREATE TABLE "scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'python',
    "interpreter" TEXT,
    "webhook_token" TEXT,
    "schedule_cron" TEXT,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT false,
    "gist_id" TEXT,
    "gist_url" TEXT,
    "sync_to_gist" BOOLEAN NOT NULL DEFAULT false,
    "gist_filename" TEXT,
    "collection_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "last_run" DATETIME,
    CONSTRAINT "scripts_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "builds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "script_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggered_by" TEXT NOT NULL DEFAULT 'manual',
    "log_file" TEXT,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "exit_code" INTEGER,
    "webhook_payload" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "builds_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "scripts_name_key" ON "scripts"("name");

-- CreateIndex
CREATE UNIQUE INDEX "scripts_webhook_token_key" ON "scripts"("webhook_token");
