use crate::{error::AppResult, schema::ensure_schema, state::AppPaths};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tauri::AppHandle;

pub async fn init_db(app_handle: &AppHandle) -> AppResult<SqlitePool> {
    let paths = AppPaths::resolve(app_handle)?;

    let database_url = format!("sqlite:{}?mode=rwc", paths.db_path.to_string_lossy());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    ensure_schema(&pool).await?;

    Ok(pool)
}
