-- AlterTable
ALTER TABLE "scripts" ADD COLUMN "remote_etag" TEXT;
ALTER TABLE "scripts" ADD COLUMN "remote_synced_at" DATETIME;

-- CreateTable
CREATE TABLE "storage_providers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "folder_path" TEXT,
    "is_temporary" BOOLEAN NOT NULL DEFAULT false,
    "runtime_preset" TEXT NOT NULL DEFAULT 'general',
    "python_toolchain_enabled" BOOLEAN NOT NULL DEFAULT false,
    "python_venv_path" TEXT,
    "python_interpreter_path" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "parent_id" TEXT,
    "storage_provider_id" TEXT,
    "remote_prefix" TEXT,
    CONSTRAINT "collections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "collections" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "collections_storage_provider_id_fkey" FOREIGN KEY ("storage_provider_id") REFERENCES "storage_providers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_collections" ("created_at", "description", "folder_path", "id", "is_temporary", "name", "project_id", "python_interpreter_path", "python_toolchain_enabled", "python_venv_path", "runtime_preset") SELECT "created_at", "description", "folder_path", "id", "is_temporary", "name", "project_id", "python_interpreter_path", "python_toolchain_enabled", "python_venv_path", "runtime_preset" FROM "collections";
DROP TABLE "collections";
ALTER TABLE "new_collections" RENAME TO "collections";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

