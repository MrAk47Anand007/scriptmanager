CREATE TABLE "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "password_hash" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "workspaces" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "policy_json" TEXT NOT NULL DEFAULT '{}',
  "created_by" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "preset" BOOLEAN NOT NULL DEFAULT false,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "roles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "roles_workspace_id_key_key" UNIQUE ("workspace_id", "key")
);

CREATE TABLE "role_permissions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "role_id" TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_permissions_role_id_permission_key" UNIQUE ("role_id", "permission")
);

CREATE TABLE "memberships" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "joined_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "memberships_user_id_workspace_id_key" UNIQUE ("user_id", "workspace_id")
);
CREATE INDEX "memberships_workspace_id_status_idx" ON "memberships"("workspace_id", "status");

CREATE TABLE "workspace_invitations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspace_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "invited_by_id" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "workspace_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "workspace_invitations_workspace_id_status_idx" ON "workspace_invitations"("workspace_id", "status");

CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "user_agent" TEXT,
  "ip_address" TEXT,
  "expires_at" DATETIME NOT NULL,
  "revoked_at" DATETIME,
  "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "user_sessions_user_id_workspace_id_revoked_at_idx" ON "user_sessions"("user_id", "workspace_id", "revoked_at");

ALTER TABLE "agent_permission_grants" ADD COLUMN "revoked_at" DATETIME;
ALTER TABLE "agent_runs" ADD COLUMN "initiated_by" TEXT NOT NULL DEFAULT 'local-admin';
ALTER TABLE "scripts" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "projects" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "server_profiles" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "workflows" ADD COLUMN "workspace_id" TEXT NOT NULL DEFAULT 'default';

INSERT INTO "users" ("id", "email", "name") VALUES ('local-admin', 'admin@scriptmanager.local', 'Local Administrator');
INSERT INTO "workspaces" ("id", "name", "slug", "created_by") VALUES ('default', 'Default Workspace', 'default', 'local-admin');
INSERT INTO "roles" ("id", "workspace_id", "key", "name", "description", "preset") VALUES
  ('default-owner', 'default', 'owner', 'Owner', 'Full workspace authority and ownership controls.', true),
  ('default-admin', 'default', 'admin', 'Admin', 'Workspace administration except ownership transfer.', true),
  ('default-developer', 'default', 'developer', 'Developer', 'Build and run scripts, workflows, agents, and Git changes.', true),
  ('default-operator', 'default', 'operator', 'Operator', 'Run and monitor automations and operational tasks.', true),
  ('default-approver', 'default', 'approver', 'Approver', 'Review protected actions and inspect supporting context.', true),
  ('default-viewer', 'default', 'viewer', 'Viewer', 'Read-only access to non-secret workspace information.', true);
INSERT INTO "role_permissions" ("id", "role_id", "permission") VALUES ('default-owner-all', 'default-owner', '*:*');
INSERT INTO "memberships" ("id", "user_id", "workspace_id", "role_id") VALUES ('default-owner-membership', 'local-admin', 'default', 'default-owner');
