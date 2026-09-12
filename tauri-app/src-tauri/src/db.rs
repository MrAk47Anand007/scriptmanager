use crate::{error::AppResult, schema::ensure_schema, state::AppPaths};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::Path;
use tauri::AppHandle;

pub async fn init_db(app_handle: &AppHandle) -> AppResult<SqlitePool> {
    let paths = AppPaths::resolve(app_handle)?;
    init_db_at_path(&paths.db_path).await
}

/// Open (creating if needed) the app database at an explicit path. The MCP
/// stdio server uses this because it runs before any Tauri AppHandle exists.
pub async fn init_db_at_path(db_path: &Path) -> AppResult<SqlitePool> {
    let database_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    ensure_schema(&pool).await?;

    Ok(pool)
}
