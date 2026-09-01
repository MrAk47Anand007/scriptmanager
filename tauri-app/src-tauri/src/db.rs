use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub async fn init_db(app_handle: &AppHandle) -> Result<SqlitePool, sqlx::Error> {
    // In production, use the app's local data directory
    // For now, we'll use a local db file in the workspace
    let db_path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("scriptmanager_tauri.db");

    // Ensure directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    // Create scripts table if not exists (Simplified for phase 2 initial test)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS scripts (
            id TEXT PRIMARY KEY,
            workspace_id TEXT DEFAULT 'default',
            name TEXT NOT NULL,
            filename TEXT NOT NULL,
            description TEXT DEFAULT '',
            language TEXT DEFAULT 'python',
            source_path TEXT
        );"
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}
