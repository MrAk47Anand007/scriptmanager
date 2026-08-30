ALTER TABLE "collections" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "collections_workspace_id_name_idx" ON "collections"("workspace_id", "name");
