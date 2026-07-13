ALTER TABLE "projects" ADD COLUMN "repository_root" TEXT;
ALTER TABLE "projects" ADD COLUMN "default_branch" TEXT NOT NULL DEFAULT 'main';
ALTER TABLE "projects" ADD COLUMN "remote_url" TEXT;
ALTER TABLE "projects" ADD COLUMN "workspace_policy" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "workflows" ADD COLUMN "project_id" TEXT REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "agent_profiles" ADD COLUMN "project_id" TEXT REFERENCES "projects"("id") ON DELETE SET NULL;
CREATE INDEX "workflows_project_id_idx" ON "workflows"("project_id");
CREATE INDEX "agent_profiles_project_id_idx" ON "agent_profiles"("project_id");
