ALTER TABLE "api_collections" ADD COLUMN "variables" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "api_requests" ADD COLUMN "variables" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "api_environments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "variables" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
