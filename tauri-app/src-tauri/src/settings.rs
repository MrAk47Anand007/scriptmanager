use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

pub const GIST_TOKEN_KEY: &str = "github_gist_token";
pub const GIST_SYNC_ENABLED_KEY: &str = "github_gist_sync_enabled";

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.and_then(|row| row.try_get::<Option<String>, _>(0).ok().flatten()))
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn delete_setting(pool: &SqlitePool, key: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM settings WHERE key = ?")
        .bind(key)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn load_settings_map(pool: &SqlitePool) -> Result<HashMap<String, String>, String> {
    let rows = sqlx::query("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let key: String = row.try_get(0).map_err(|e| e.to_string())?;
        let value: Option<String> = row.try_get(1).map_err(|e| e.to_string())?;
        map.insert(key, value.unwrap_or_default());
    }
    Ok(map)
}

pub async fn save_settings_map(
    pool: &SqlitePool,
    payload: HashMap<String, String>,
) -> Result<HashMap<String, String>, String> {
    for (key, value) in &payload {
        set_setting(pool, key, value).await?;
    }
    load_settings_map(pool).await
}

#[tauri::command]
pub async fn read_settings(
    pool: State<'_, SqlitePool>,
) -> Result<HashMap<String, String>, String> {
    load_settings_map(&pool).await
}

#[tauri::command]
pub async fn save_settings(
    pool: State<'_, SqlitePool>,
    payload: HashMap<String, String>,
) -> Result<HashMap<String, String>, String> {
    save_settings_map(&pool, payload).await
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GistSettingsView {
    pub configured: bool,
    #[serde(rename = "syncEnabled")]
    pub sync_enabled: bool,
}

pub async fn gist_settings_view(pool: &SqlitePool) -> Result<GistSettingsView, String> {
    let token = get_setting(pool, GIST_TOKEN_KEY).await?;
    let sync_enabled = get_setting(pool, GIST_SYNC_ENABLED_KEY)
        .await?
        .map(|value| value == "true")
        .unwrap_or(false);
    Ok(GistSettingsView {
        configured: token.map(|t| !t.is_empty()).unwrap_or(false),
        sync_enabled,
    })
}

#[derive(Debug, Deserialize)]
pub struct SaveGistSettingsPayload {
    pub token: Option<String>,
    #[serde(rename = "syncEnabled", alias = "sync_enabled")]
    pub sync_enabled: bool,
}

pub async fn save_gist_settings(
    pool: &SqlitePool,
    payload: SaveGistSettingsPayload,
) -> Result<GistSettingsView, String> {
    if let Some(token) = payload.token.as_deref() {
        let token = token.trim();
        if !token.is_empty() {
            set_setting(pool, GIST_TOKEN_KEY, token).await?;
        }
    }
    set_setting(
        pool,
        GIST_SYNC_ENABLED_KEY,
        if payload.sync_enabled { "true" } else { "false" },
    )
    .await?;
    gist_settings_view(pool).await
}

pub async fn clear_gist_settings(pool: &SqlitePool) -> Result<GistSettingsView, String> {
    delete_setting(pool, GIST_TOKEN_KEY).await?;
    delete_setting(pool, GIST_SYNC_ENABLED_KEY).await?;
    gist_settings_view(pool).await
}

#[tauri::command]
pub async fn read_github_gist_settings(
    pool: State<'_, SqlitePool>,
) -> Result<GistSettingsView, String> {
    gist_settings_view(&pool).await
}

#[tauri::command]
pub async fn save_github_gist_settings(
    pool: State<'_, SqlitePool>,
    payload: SaveGistSettingsPayload,
) -> Result<GistSettingsView, String> {
    save_gist_settings(&pool, payload).await
}

#[tauri::command]
pub async fn clear_github_gist_settings(
    pool: State<'_, SqlitePool>,
) -> Result<GistSettingsView, String> {
    clear_gist_settings(&pool).await
}

// ---------------------------------------------------------------------------
// Script export / import
// ---------------------------------------------------------------------------

const SCRIPT_EXPORT_COLUMNS: &str =
    "id, name, filename, description, language, interpreter, content, parameters, timeout_ms, collection_id, sync_to_gist";

pub async fn export_all_scripts(pool: &SqlitePool) -> Result<Value, String> {
    let scripts = sqlx::query(&format!(
        "SELECT {SCRIPT_EXPORT_COLUMNS} FROM scripts ORDER BY name"
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let collections = sqlx::query("SELECT id, name, description FROM collections ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let scripts_json: Vec<Value> = scripts
        .iter()
        .map(script_row_to_value)
        .collect::<Result<_, _>>()?;
    let collections_json: Vec<Value> = collections
        .iter()
        .map(collection_row_to_value)
        .collect::<Result<_, _>>()?;

    Ok(serde_json::json!({
        "version": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "scripts": scripts_json,
        "collections": collections_json,
    }))
}

pub async fn export_single_script(pool: &SqlitePool, script_id: &str) -> Result<Value, String> {
    let row = sqlx::query(&format!(
        "SELECT {SCRIPT_EXPORT_COLUMNS} FROM scripts WHERE id = ?"
    ))
    .bind(script_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Script not found".to_string())?;

    let mut script = script_row_to_value(&row)?;
    if let Some(obj) = script.as_object_mut() {
        obj.insert("kind".to_string(), Value::String("script".to_string()));
    }
    Ok(script)
}

#[derive(Debug, Deserialize)]
pub struct ImportScriptsPayload {
    #[serde(default)]
    pub scripts: Vec<Value>,
}

#[derive(Debug, serde::Serialize)]
pub struct ImportScriptsResult {
    pub message: String,
    #[serde(rename = "imported")]
    pub results: usize,
}

pub async fn import_scripts_from_payload(
    pool: &SqlitePool,
    payload: ImportScriptsPayload,
) -> Result<ImportScriptsResult, String> {
    let mut imported = 0usize;
    for script in &payload.scripts {
        let name = script
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "Each imported script requires a name".to_string())?;
        let language = script
            .get("language")
            .and_then(Value::as_str)
            .unwrap_or("python")
            .to_string();
        let content = script
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let description = script
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let filename = script
            .get("filename")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("imported-{}.py", Uuid::new_v4()));
        let parameters = script
            .get("parameters")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([]))
            .to_string();
        let timeout_ms = script.get("timeoutMs").and_then(Value::as_i64);

        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO scripts (id, name, filename, description, language, content, parameters, timeout_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(name)
        .bind(&filename)
        .bind(&description)
        .bind(&language)
        .bind(&content)
        .bind(&parameters)
        .bind(timeout_ms)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        imported += 1;
    }

    Ok(ImportScriptsResult {
        message: format!("Imported {} script(s)", imported),
        results: imported,
    })
}

#[tauri::command]
pub async fn export_scripts(pool: State<'_, SqlitePool>) -> Result<Value, String> {
    export_all_scripts(&pool).await
}

#[tauri::command]
pub async fn export_script(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Value, String> {
    export_single_script(&pool, &script_id).await
}

#[tauri::command]
pub async fn import_scripts(
    pool: State<'_, SqlitePool>,
    payload: ImportScriptsPayload,
) -> Result<ImportScriptsResult, String> {
    import_scripts_from_payload(&pool, payload).await
}

fn script_row_to_value(row: &sqlx::sqlite::SqliteRow) -> Result<Value, String> {
    Ok(serde_json::json!({
        "id": row.try_get::<String, _>("id").map_err(|e| e.to_string())?,
        "name": row.try_get::<String, _>("name").map_err(|e| e.to_string())?,
        "filename": row.try_get::<String, _>("filename").map_err(|e| e.to_string())?,
        "description": row.try_get::<String, _>("description").map_err(|e| e.to_string())?,
        "language": row.try_get::<String, _>("language").map_err(|e| e.to_string())?,
        "interpreter": row.try_get::<Option<String>, _>("interpreter").map_err(|e| e.to_string())?,
        "content": row.try_get::<Option<String>, _>("content").map_err(|e| e.to_string())?,
        "parameters": row
            .try_get::<String, _>("parameters")
            .map_err(|e| e.to_string())
            .ok()
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or_else(|| serde_json::json!([])),
        "timeoutMs": row.try_get::<Option<i64>, _>("timeout_ms").map_err(|e| e.to_string())?,
        "collectionId": row.try_get::<Option<String>, _>("collection_id").map_err(|e| e.to_string())?,
        "syncToGist": row.try_get::<bool, _>("sync_to_gist").map_err(|e| e.to_string())?,
    }))
}

fn collection_row_to_value(row: &sqlx::sqlite::SqliteRow) -> Result<Value, String> {
    Ok(serde_json::json!({
        "id": row.try_get::<String, _>("id").map_err(|e| e.to_string())?,
        "name": row.try_get::<String, _>("name").map_err(|e| e.to_string())?,
        "description": row.try_get::<String, _>("description").map_err(|e| e.to_string())?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::ensure_schema;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create in-memory sqlite pool");
        ensure_schema(&pool).await.expect("ensure schema");
        pool
    }

    #[tokio::test]
    async fn settings_round_trip_save_then_read() {
        let pool = test_pool().await;
        assert!(load_settings_map(&pool).await.unwrap().is_empty());

        let mut payload = HashMap::new();
        payload.insert("script_storage_path".to_string(), "D:/scripts".to_string());
        payload.insert("execution_timeout_ms".to_string(), "30000".to_string());

        let saved = save_settings_map(&pool, payload).await.unwrap();
        assert_eq!(saved.get("script_storage_path").unwrap(), "D:/scripts");
        assert_eq!(saved.get("execution_timeout_ms").unwrap(), "30000");

        let mut update = HashMap::new();
        update.insert("execution_timeout_ms".to_string(), "45000".to_string());
        let saved = save_settings_map(&pool, update).await.unwrap();
        assert_eq!(saved.get("execution_timeout_ms").unwrap(), "45000");
    }

    #[tokio::test]
    async fn gist_settings_hide_token_and_round_trip() {
        let pool = test_pool().await;

        let view = gist_settings_view(&pool).await.unwrap();
        assert!(!view.configured);
        assert!(!view.sync_enabled);

        save_gist_settings(
            &pool,
            SaveGistSettingsPayload {
                token: Some("gist-fixture-cred".to_string()),
                sync_enabled: true,
            },
        )
        .await
        .unwrap();

        let view = gist_settings_view(&pool).await.unwrap();
        assert!(view.configured);
        assert!(view.sync_enabled);

        // Token is stored but never present in the serialized view
        let view_json = serde_json::to_string(&gist_settings_view(&pool).await.unwrap()).unwrap();
        assert!(!view_json.contains("gist-fixture-cred"));
        let map = load_settings_map(&pool).await.unwrap();
        assert_eq!(map.get(GIST_TOKEN_KEY).unwrap(), "gist-fixture-cred");

        clear_gist_settings(&pool).await.unwrap();
        let view = gist_settings_view(&pool).await.unwrap();
        assert!(!view.configured);
        assert!(!view.sync_enabled);
        assert!(load_settings_map(&pool)
            .await
            .unwrap()
            .get(GIST_TOKEN_KEY)
            .is_none());
    }

    #[tokio::test]
    async fn export_import_round_trip_scripts() {
        let pool = test_pool().await;
        sqlx::query(
            "INSERT INTO scripts (id, name, filename, description, language, content, parameters) VALUES (?, ?, ?, ?, ?, ?, '[]')",
        )
        .bind("s-1")
        .bind("Backup")
        .bind("backup.py")
        .bind("desc")
        .bind("python")
        .bind("print('hi')")
        .execute(&pool)
        .await
        .unwrap();

        let exported = export_all_scripts(&pool).await.unwrap();
        assert_eq!(exported["scripts"].as_array().unwrap().len(), 1);
        assert_eq!(exported["scripts"][0]["name"], "Backup");

        let single = export_single_script(&pool, "s-1").await.unwrap();
        assert_eq!(single["kind"], "script");
        assert!(export_single_script(&pool, "missing").await.is_err());

        let result = import_scripts_from_payload(
            &pool,
            ImportScriptsPayload {
                scripts: vec![serde_json::json!({
                    "name": "Imported Script",
                    "language": "python",
                    "content": "print('imported')",
                })],
            },
        )
        .await
        .unwrap();
        assert_eq!(result.results, 1);

        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM scripts WHERE name = 'Imported Script'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn import_rejects_script_without_name() {
        let pool = test_pool().await;
        let payload = ImportScriptsPayload {
            scripts: vec![serde_json::json!({"content": "print(1)"})],
        };
        assert!(import_scripts_from_payload(&pool, payload).await.is_err());
    }
}
