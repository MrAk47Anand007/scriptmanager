use tauri::State;
use sqlx::SqlitePool;
use uuid::Uuid;
use crate::models::Script;

#[tauri::command]
pub async fn get_scripts(pool: State<'_, SqlitePool>) -> Result<Vec<Script>, String> {
    sqlx::query_as::<_, Script>("SELECT * FROM scripts")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_script(
    pool: State<'_, SqlitePool>,
    name: String,
    filename: String,
    language: String,
) -> Result<Script, String> {
    let id = Uuid::new_v4().to_string();
    
    sqlx::query(
        "INSERT INTO scripts (id, workspace_id, name, filename, language) VALUES (?, 'default', ?, ?, ?)"
    )
    .bind(&id)
    .bind(&name)
    .bind(&filename)
    .bind(&language)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let script = sqlx::query_as::<_, Script>("SELECT * FROM scripts WHERE id = ?")
        .bind(&id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(script)
}

#[tauri::command]
pub async fn get_collections() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn get_settings() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "theme": "dark",
        "notifications": true
    }))
}

