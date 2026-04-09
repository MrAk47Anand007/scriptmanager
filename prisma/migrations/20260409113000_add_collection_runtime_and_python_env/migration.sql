ALTER TABLE "collections" ADD COLUMN "runtime_preset" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "collections" ADD COLUMN "python_toolchain_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "collections" ADD COLUMN "python_venv_path" TEXT;
ALTER TABLE "collections" ADD COLUMN "python_interpreter_path" TEXT;
