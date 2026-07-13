CREATE TABLE "secrets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT 'workspace',
  "workspace_id" TEXT NOT NULL DEFAULT 'default',
  "status" TEXT NOT NULL DEFAULT 'active',
  "current_version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "disabled_at" DATETIME
);
CREATE UNIQUE INDEX "secrets_workspace_id_name_key" ON "secrets"("workspace_id", "name");
CREATE INDEX "secrets_workspace_id_status_idx" ON "secrets"("workspace_id", "status");

CREATE TABLE "secret_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "secret_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "ciphertext" TEXT NOT NULL,
  "store_kind" TEXT NOT NULL DEFAULT 'server',
  "created_by" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_versions_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "secret_versions_secret_id_version_key" ON "secret_versions"("secret_id", "version");

CREATE TABLE "secret_bindings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "secret_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL DEFAULT 'default',
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_bindings_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "secret_bindings_resource_type_resource_id_field_key" ON "secret_bindings"("resource_type", "resource_id", "field");
CREATE INDEX "secret_bindings_secret_id_idx" ON "secret_bindings"("secret_id");

CREATE TABLE "secret_access_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "secret_id" TEXT NOT NULL,
  "version" INTEGER,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "outcome" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "secret_access_events_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "secret_access_events_secret_id_created_at_idx" ON "secret_access_events"("secret_id", "created_at");
CREATE INDEX "secret_access_events_actor_id_created_at_idx" ON "secret_access_events"("actor_id", "created_at");
