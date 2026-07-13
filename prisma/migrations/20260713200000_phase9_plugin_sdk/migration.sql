CREATE TABLE "plugin_packages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "plugin_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "manifest_json" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_hash" TEXT NOT NULL,
  "signature" TEXT,
  "public_key" TEXT,
  "signature_valid" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "plugin_packages_plugin_id_version_source_hash_key" ON "plugin_packages"("plugin_id", "version", "source_hash");
CREATE INDEX "plugin_packages_plugin_id_version_idx" ON "plugin_packages"("plugin_id", "version");

CREATE TABLE "plugin_installations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "package_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "trusted" BOOLEAN NOT NULL DEFAULT false,
  "allow_unsigned" BOOLEAN NOT NULL DEFAULT false,
  "settings_json" TEXT NOT NULL DEFAULT '{}',
  "health_status" TEXT NOT NULL DEFAULT 'unknown',
  "health_message" TEXT,
  "last_checked_at" DATETIME,
  "installed_by" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "plugin_installations_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "plugin_packages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "plugin_installations_workspace_id_package_id_key" ON "plugin_installations"("workspace_id", "package_id");
CREATE INDEX "plugin_installations_workspace_id_enabled_idx" ON "plugin_installations"("workspace_id", "enabled");
