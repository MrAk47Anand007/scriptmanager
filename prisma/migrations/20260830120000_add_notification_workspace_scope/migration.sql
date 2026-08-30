ALTER TABLE "notification_channels" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "notification_rules" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "notification_deliveries" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "notification_channels_workspace_id_name_idx" ON "notification_channels"("workspace_id", "name");
CREATE INDEX "notification_rules_workspace_id_enabled_channel_id_idx" ON "notification_rules"("workspace_id", "enabled", "channel_id");
CREATE INDEX "notification_deliveries_workspace_id_status_next_attempt_at_idx" ON "notification_deliveries"("workspace_id", "status", "next_attempt_at");
