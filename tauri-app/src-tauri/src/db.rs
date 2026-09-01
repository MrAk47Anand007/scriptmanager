use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub async fn init_db(_app_handle: &AppHandle) -> Result<SqlitePool, sqlx::Error> {
    // In dev mode, use the parent folder's data/scriptmanager.db
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let db_path = std::path::PathBuf::from(manifest_dir)
        .join("../../data/scriptmanager.db");

    let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    Ok(pool)
}
