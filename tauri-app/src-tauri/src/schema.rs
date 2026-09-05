use crate::error::AppResult;
use sqlx::SqlitePool;

pub async fn ensure_schema(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            folder_path TEXT,
            folder_available INTEGER NOT NULL DEFAULT 1,
            folder_last_scanned_at TEXT,
            is_temporary INTEGER NOT NULL DEFAULT 0,
            runtime_preset TEXT NOT NULL DEFAULT 'general',
            python_toolchain_enabled INTEGER NOT NULL DEFAULT 0,
            python_venv_path TEXT,
            python_interpreter_path TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            project_id TEXT,
            parent_id TEXT,
            storage_provider_id TEXT,
            remote_prefix TEXT
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS scripts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            source_path TEXT,
            source_available INTEGER NOT NULL DEFAULT 1,
            source_fingerprint TEXT,
            description TEXT NOT NULL DEFAULT '',
            language TEXT NOT NULL DEFAULT 'python',
            interpreter TEXT,
            webhook_token TEXT UNIQUE,
            webhook_secret TEXT,
            require_webhook_signature INTEGER NOT NULL DEFAULT 0,
            schedule_cron TEXT,
            schedule_enabled INTEGER NOT NULL DEFAULT 0,
            parameters TEXT NOT NULL DEFAULT '[]',
            gist_id TEXT,
            gist_url TEXT,
            sync_to_gist INTEGER NOT NULL DEFAULT 0,
            gist_filename TEXT,
            collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
            timeout_ms INTEGER,
            remote_etag TEXT,
            remote_synced_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_run TEXT
        )",
    )
    .execute(pool)
    .await?;

    ensure_column(pool, "scripts", "content", "TEXT NOT NULL DEFAULT ''").await?;
    ensure_column(pool, "scripts", "schedule_next_run_at", "TEXT").await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6366f1',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(workspace_id, name)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS script_tags (
            script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (script_id, tag_id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS script_env_vars (
            id TEXT PRIMARY KEY,
            script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
            key TEXT NOT NULL,
            value TEXT NOT NULL DEFAULT '',
            is_secret INTEGER NOT NULL DEFAULT 0,
            UNIQUE(script_id, key)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS script_versions (
            id TEXT PRIMARY KEY,
            script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            snapshot_number INTEGER NOT NULL,
            saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS builds (
            id TEXT PRIMARY KEY,
            script_id TEXT NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            triggered_by TEXT NOT NULL DEFAULT 'manual',
            log_file TEXT,
            started_at TEXT,
            finished_at TEXT,
            exit_code INTEGER,
            webhook_payload TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS script_templates (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'general',
            language TEXT NOT NULL DEFAULT 'python',
            interpreter TEXT,
            content TEXT NOT NULL,
            parameters TEXT NOT NULL DEFAULT '[]',
            is_built_in INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(workspace_id, name)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS secrets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            scope TEXT NOT NULL DEFAULT 'global',
            status TEXT NOT NULL DEFAULT 'active',
            current_version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS secret_versions (
            id TEXT PRIMARY KEY,
            secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
            version_number INTEGER NOT NULL,
            ciphertext TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS secret_bindings (
            id TEXT PRIMARY KEY,
            secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
            resource TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS secret_access_events (
            id TEXT PRIMARY KEY,
            secret_id TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS api_collections (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            variables TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS api_requests (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'GET',
            url TEXT NOT NULL DEFAULT '',
            headers TEXT NOT NULL DEFAULT '[]',
            query_params TEXT NOT NULL DEFAULT '[]',
            variables TEXT NOT NULL DEFAULT '[]',
            request_options TEXT NOT NULL DEFAULT '{}',
            pre_request_script TEXT NOT NULL DEFAULT '',
            test_script TEXT NOT NULL DEFAULT '',
            response_mappings TEXT NOT NULL DEFAULT '[]',
            body_type TEXT NOT NULL DEFAULT 'none',
            body TEXT NOT NULL DEFAULT '',
            auth_type TEXT NOT NULL DEFAULT 'none',
            auth_config TEXT NOT NULL DEFAULT '{}',
            collection_id TEXT REFERENCES api_collections(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS api_environments (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            variables TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS api_history (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            request_id TEXT,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            request_headers TEXT NOT NULL DEFAULT '{}',
            request_body TEXT NOT NULL DEFAULT '',
            status INTEGER NOT NULL,
            status_text TEXT NOT NULL DEFAULT '',
            duration INTEGER NOT NULL DEFAULT 0,
            size INTEGER NOT NULL DEFAULT 0,
            response_headers TEXT NOT NULL DEFAULT '{}',
            response_body TEXT NOT NULL DEFAULT '',
            console_logs TEXT NOT NULL DEFAULT '[]',
            test_results TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            environment TEXT NOT NULL DEFAULT 'development',
            color TEXT NOT NULL DEFAULT '#6366f1',
            repository_root TEXT,
            default_branch TEXT NOT NULL DEFAULT 'main',
            remote_url TEXT,
            workspace_policy TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL DEFAULT 'default',
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            draft_definition TEXT NOT NULL,
            published_version INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            project_id TEXT
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_versions (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            definition_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(workflow_id, version)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            version_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            trigger_type TEXT NOT NULL DEFAULT 'manual',
            actor_id TEXT NOT NULL DEFAULT 'local-admin',
            correlation_id TEXT NOT NULL UNIQUE,
            idempotency_key TEXT UNIQUE,
            input_json TEXT NOT NULL DEFAULT '{}',
            output_json TEXT,
            error_json TEXT,
            cancel_requested_at TEXT,
            started_at TEXT,
            finished_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS workflow_node_runs (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
            node_id TEXT NOT NULL,
            node_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempt INTEGER NOT NULL DEFAULT 0,
            input_json TEXT,
            output_json TEXT,
            error_json TEXT,
            selected_port TEXT,
            started_at TEXT,
            finished_at TEXT,
            UNIQUE(run_id, node_id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS api_collection_runs (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL REFERENCES api_collections(id) ON DELETE CASCADE,
            collection_name TEXT NOT NULL,
            environment_id TEXT,
            environment_name TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            total_requests INTEGER NOT NULL DEFAULT 0,
            passed_requests INTEGER NOT NULL DEFAULT 0,
            failed_requests INTEGER NOT NULL DEFAULT 0,
            results TEXT NOT NULL DEFAULT '[]',
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at TEXT,
            duration_ms INTEGER
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tags_workspace_name ON tags(workspace_id, name)")
        .execute(pool)
        .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_collections_workspace_name ON collections(workspace_id, name)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_script_templates_workspace_builtin_name ON script_templates(workspace_id, is_built_in, name)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_api_collections_workspace_name ON api_collections(workspace_id, name)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_api_requests_workspace_updated ON api_requests(workspace_id, updated_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_api_environments_workspace_name ON api_environments(workspace_id, name)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_api_history_workspace_created ON api_history(workspace_id, created_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_projects_workspace_name ON projects(workspace_id, name)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_workflows_workspace_updated ON workflows(workspace_id, updated_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_created ON workflow_runs(status, created_at)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_created ON workflow_runs(workflow_id, created_at)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_column(
    pool: &SqlitePool,
    table: &str,
    column: &str,
    declaration: &str,
) -> AppResult<()> {
    let existing: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await?;

    if existing == 0 {
        let statement = format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}");
        sqlx::query(&statement).execute(pool).await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn ensure_schema_creates_startup_tables() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        ensure_schema(&pool).await.unwrap();

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('scripts', 'collections', 'tags', 'script_templates')",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 4);
    }
}
