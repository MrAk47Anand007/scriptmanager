ALTER TABLE "api_collections" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "api_requests" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "api_environments" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "api_history" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "api_collections_workspace_id_name_idx" ON "api_collections"("workspace_id", "name");
CREATE INDEX "api_requests_workspace_id_updated_at_idx" ON "api_requests"("workspace_id", "updated_at");
CREATE INDEX "api_environments_workspace_id_name_idx" ON "api_environments"("workspace_id", "name");
CREATE INDEX "api_history_workspace_id_created_at_idx" ON "api_history"("workspace_id", "created_at");
