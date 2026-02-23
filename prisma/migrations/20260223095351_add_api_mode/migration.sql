-- CreateTable
CREATE TABLE "api_collections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "api_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "url" TEXT NOT NULL DEFAULT '',
    "headers" TEXT NOT NULL DEFAULT '[]',
    "query_params" TEXT NOT NULL DEFAULT '[]',
    "body_type" TEXT NOT NULL DEFAULT 'none',
    "body" TEXT NOT NULL DEFAULT '',
    "auth_type" TEXT NOT NULL DEFAULT 'none',
    "auth_config" TEXT NOT NULL DEFAULT '{}',
    "collection_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "api_requests_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "api_collections" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "api_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "request_headers" TEXT NOT NULL DEFAULT '{}',
    "request_body" TEXT NOT NULL DEFAULT '',
    "status" INTEGER NOT NULL,
    "status_text" TEXT NOT NULL DEFAULT '',
    "duration" INTEGER NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "response_headers" TEXT NOT NULL DEFAULT '{}',
    "response_body" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
