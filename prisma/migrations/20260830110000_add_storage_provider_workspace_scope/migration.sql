ALTER TABLE "storage_providers" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "storage_providers_workspace_id_name_idx" ON "storage_providers"("workspace_id", "name");
