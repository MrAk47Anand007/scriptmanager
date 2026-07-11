CREATE TABLE "execution_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "type" TEXT NOT NULL,
    "execution_kind" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "occurred_at" DATETIME NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_name" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "target_name" TEXT,
    "data_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "execution_events_correlation_id_occurred_at_idx" ON "execution_events"("correlation_id", "occurred_at");
CREATE INDEX "execution_events_execution_kind_occurred_at_idx" ON "execution_events"("execution_kind", "occurred_at");
CREATE INDEX "execution_events_target_type_target_id_occurred_at_idx" ON "execution_events"("target_type", "target_id", "occurred_at");
