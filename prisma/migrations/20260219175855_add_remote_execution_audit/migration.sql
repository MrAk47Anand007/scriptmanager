-- CreateTable
CREATE TABLE "remote_executions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "script_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "script_name" TEXT NOT NULL,
    "profile_name" TEXT NOT NULL,
    "server_host" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "triggered_by" TEXT NOT NULL DEFAULT 'manual',
    "approved_by" TEXT,
    "remote_path" TEXT,
    "exit_code" INTEGER,
    "log_output" TEXT,
    "param_values" TEXT NOT NULL DEFAULT '{}',
    "requested_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" DATETIME,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    CONSTRAINT "remote_executions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "server_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
