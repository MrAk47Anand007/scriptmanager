PRAGMA foreign_keys=OFF;

CREATE TABLE "new_tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_tags" ("id", "workspace_id", "name", "color", "created_at")
SELECT "id", 'default', "name", "color", "created_at" FROM "tags";

DROP TABLE "tags";
ALTER TABLE "new_tags" RENAME TO "tags";
CREATE UNIQUE INDEX "tags_workspace_id_name_key" ON "tags"("workspace_id", "name");
CREATE INDEX "tags_workspace_id_name_idx" ON "tags"("workspace_id", "name");

CREATE TABLE "new_script_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "language" TEXT NOT NULL DEFAULT 'python',
    "interpreter" TEXT,
    "content" TEXT NOT NULL,
    "parameters" TEXT NOT NULL DEFAULT '[]',
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_script_templates" ("id", "workspace_id", "name", "description", "category", "language", "interpreter", "content", "parameters", "is_built_in", "created_at")
SELECT "id", 'default', "name", "description", "category", "language", "interpreter", "content", "parameters", "is_built_in", "created_at" FROM "script_templates";

DROP TABLE "script_templates";
ALTER TABLE "new_script_templates" RENAME TO "script_templates";
CREATE UNIQUE INDEX "script_templates_workspace_id_name_key" ON "script_templates"("workspace_id", "name");
CREATE INDEX "script_templates_workspace_id_is_built_in_name_idx" ON "script_templates"("workspace_id", "is_built_in", "name");

PRAGMA foreign_keys=ON;
