CREATE TABLE "api_collection_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collection_id" TEXT NOT NULL,
    "collection_name" TEXT NOT NULL,
    "environment_id" TEXT,
    "environment_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "total_requests" INTEGER NOT NULL DEFAULT 0,
    "passed_requests" INTEGER NOT NULL DEFAULT 0,
    "failed_requests" INTEGER NOT NULL DEFAULT 0,
    "results" TEXT NOT NULL DEFAULT '[]',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME,
    "duration_ms" INTEGER,
    CONSTRAINT "api_collection_runs_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "api_collections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
