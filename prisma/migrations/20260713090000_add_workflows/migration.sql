CREATE TABLE "workflows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "draft_definition" TEXT NOT NULL,
  "published_version" INTEGER,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);
CREATE TABLE "workflow_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition_json" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "workflow_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "trigger_type" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "input_json" TEXT NOT NULL DEFAULT '{}',
  "output_json" TEXT,
  "error_json" TEXT,
  "worker_id" TEXT,
  "claimed_at" DATETIME,
  "cancel_requested_at" DATETIME,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workflow_runs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "workflow_node_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "node_id" TEXT NOT NULL,
  "node_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "input_json" TEXT,
  "output_json" TEXT,
  "error_json" TEXT,
  "started_at" DATETIME,
  "finished_at" DATETIME,
  CONSTRAINT "workflow_node_runs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "workflow_triggers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflow_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config_json" TEXT NOT NULL DEFAULT '{}',
  "webhook_token" TEXT,
  "webhook_secret_encrypted" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "workflow_triggers_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_key" ON "workflow_versions"("workflow_id", "version");
CREATE UNIQUE INDEX "workflow_runs_correlation_id_key" ON "workflow_runs"("correlation_id");
CREATE UNIQUE INDEX "workflow_runs_idempotency_key_key" ON "workflow_runs"("idempotency_key");
CREATE INDEX "workflow_runs_status_created_at_idx" ON "workflow_runs"("status", "created_at");
CREATE INDEX "workflow_runs_workflow_id_created_at_idx" ON "workflow_runs"("workflow_id", "created_at");
CREATE UNIQUE INDEX "workflow_node_runs_run_id_node_id_key" ON "workflow_node_runs"("run_id", "node_id");
CREATE INDEX "workflow_node_runs_run_id_status_idx" ON "workflow_node_runs"("run_id", "status");
CREATE UNIQUE INDEX "workflow_triggers_webhook_token_key" ON "workflow_triggers"("webhook_token");
CREATE INDEX "workflow_triggers_workflow_id_enabled_idx" ON "workflow_triggers"("workflow_id", "enabled");
