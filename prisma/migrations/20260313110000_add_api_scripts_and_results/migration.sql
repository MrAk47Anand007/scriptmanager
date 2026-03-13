ALTER TABLE "api_requests" ADD COLUMN "pre_request_script" TEXT NOT NULL DEFAULT '';
ALTER TABLE "api_requests" ADD COLUMN "test_script" TEXT NOT NULL DEFAULT '';

ALTER TABLE "api_history" ADD COLUMN "console_logs" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "api_history" ADD COLUMN "test_results" TEXT NOT NULL DEFAULT '[]';
