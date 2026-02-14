-- CreateTable
CREATE TABLE "script_env_vars" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "script_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "script_env_vars_script_id_fkey" FOREIGN KEY ("script_id") REFERENCES "scripts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "script_env_vars_script_id_key_key" ON "script_env_vars"("script_id", "key");
