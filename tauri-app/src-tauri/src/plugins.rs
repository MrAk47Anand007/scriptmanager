use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

/// Plugin support decision (recorded in the migration completion plan,
/// S9.2): manifest metadata management is migrated; the plugin **execution
/// host** stays disabled until capability/RBAC/secret boundaries are ported.

#[derive(Debug, Serialize)]
pub struct PluginView {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub manifest: Value,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_plugins_core(pool: &SqlitePool) -> Result<Vec<PluginView>, String> {
    let rows = sqlx::query(
        "SELECT id, name, version, enabled, manifest_json, created_at, updated_at FROM plugin_installations ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let manifest_raw: String = row.try_get(4).map_err(|e| e.to_string())?;
            Ok(PluginView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                version: row.try_get(2).map_err(|e| e.to_string())?,
                enabled: row.try_get::<i64, _>(3).map_err(|e| e.to_string())? != 0,
                manifest: serde_json::from_str::<Value>(&manifest_raw).unwrap_or(Value::Null),
                created_at: row.try_get(5).map_err(|e| e.to_string())?,
                updated_at: row.try_get(6).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_plugins(pool: State<'_, SqlitePool>) -> Result<Vec<PluginView>, String> {
    list_plugins_core(&pool).await
}

/// Validates a plugin manifest: requires name (string), version (string),
/// and an optional permissions array. Invalid manifests are rejected.
pub fn parse_plugin_manifest(raw: &str) -> Result<(String, String, Value), String> {
    let manifest = serde_json::from_str::<Value>(raw)
        .map_err(|e| format!("Invalid plugin manifest JSON: {e}"))?;
    let name = manifest
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .ok_or_else(|| "Plugin manifest requires a non-empty 'name'".to_string())?
        .to_string();
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "Plugin manifest requires a 'version'".to_string())?
        .to_string();
    if let Some(Value::Array(perms)) = manifest.get("permissions") {
        for perm in perms {
            if perm.as_str().is_none() {
                return Err("Plugin manifest permissions must be strings".to_string());
            }
        }
    }
    Ok((name, version, manifest))
}

pub async fn save_plugin_core(
    pool: &SqlitePool,
    manifest_raw: &str,
) -> Result<PluginView, String> {
    let (name, version, manifest) = parse_plugin_manifest(manifest_raw)?;

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO plugin_installations (id, name, version, manifest_json) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&version)
        .bind(manifest.to_string())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    list_plugins_core(pool)
        .await?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Plugin installation failed".to_string())
}

#[derive(Debug, Deserialize)]
pub struct SavePluginPayload {
    pub manifest: String,
}

#[tauri::command]
pub async fn save_plugin(
    pool: State<'_, SqlitePool>,
    payload: SavePluginPayload,
) -> Result<PluginView, String> {
    save_plugin_core(&pool, &payload.manifest).await
}

#[derive(Debug, Deserialize)]
pub struct UpdatePluginPayload {
    pub id: String,
    pub action: String,
    #[serde(default)]
    pub settings: Option<Value>,
}

const PLUGIN_ACTIONS: [&str; 2] = ["enable", "disable"];

pub async fn update_plugin_core(
    pool: &SqlitePool,
    payload: UpdatePluginPayload,
) -> Result<PluginView, String> {
    if !PLUGIN_ACTIONS.contains(&payload.action.as_str()) {
        return Err(format!("Unknown plugin action: {}", payload.action));
    }
    let enabled = payload.action == "enable";
    let result = sqlx::query(
        "UPDATE plugin_installations SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(enabled)
    .bind(&payload.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Plugin not found".to_string());
    }

    list_plugins_core(pool)
        .await?
        .into_iter()
        .find(|p| p.id == payload.id)
        .ok_or_else(|| "Plugin not found".to_string())
}

#[tauri::command]
pub async fn update_plugin(
    pool: State<'_, SqlitePool>,
    payload: UpdatePluginPayload,
) -> Result<PluginView, String> {
    update_plugin_core(&pool, payload).await
}

pub async fn remove_plugin_core(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM plugin_installations WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_plugin(pool: State<'_, SqlitePool>, id: String) -> Result<Value, String> {
    remove_plugin_core(&pool, &id).await?;
    Ok(serde_json::json!({ "ok": true, "id": id }))
}

#[tauri::command]
pub async fn run_plugin() -> Result<Value, String> {
    Err("Plugin execution host is disabled in the Tauri desktop app (capability boundaries not ported)".to_string())
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

    #[test]
    fn manifest_parsing_rejects_invalid() {
        assert!(parse_plugin_manifest("not json").is_err());
        assert!(parse_plugin_manifest("{}").is_err());
        assert!(parse_plugin_manifest(r#"{"name": "p", "version": "1.0", "permissions": [1]}"#).is_err());
        let (name, version, _) = parse_plugin_manifest(r#"{"name": "p", "version": "1.0", "permissions": ["fs.read"]}"#).unwrap();
        assert_eq!(name, "p");
        assert_eq!(version, "1.0");
    }

    #[tokio::test]
    async fn plugin_lifecycle_enable_disable_remove() {
        let pool = test_pool().await;
        let installed = save_plugin_core(&pool, r#"{"name": "lint", "version": "2.1"}"#)
            .await
            .unwrap();
        assert_eq!(installed.enabled, true);
        assert_eq!(installed.version, "2.1");

        let disabled = update_plugin_core(
            &pool,
            UpdatePluginPayload { id: installed.id.clone(), action: "disable".into(), settings: None },
        )
        .await
        .unwrap();
        assert!(!disabled.enabled);

        assert!(update_plugin_core(
            &pool,
            UpdatePluginPayload { id: "missing".into(), action: "enable".into(), settings: None },
        )
        .await
        .is_err());

        remove_plugin_core(&pool, &installed.id).await.unwrap();
        assert!(list_plugins_core(&pool).await.unwrap().is_empty());
    }
}
