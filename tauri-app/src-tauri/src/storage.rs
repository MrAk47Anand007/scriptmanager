use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

/// Storage provider support matrix (recorded in the migration completion
/// plan, S8.2): the local filesystem provider is fully migrated (test +
/// collection push-sync). S3/GCS/WebDAV keep working config storage but
/// return a typed pending error for test/sync; GDrive/OneDrive OAuth stays
/// explicitly migration-pending.

const CREDENTIAL_KEYS: [&str; 12] = [
    "access_key",
    "secret_key",
    "password",
    "token",
    "refresh_token",
    "client_secret",
    "api_key",
    "secret",
    "private_key",
    "passphrase",
    "session_token",
    "credentials",
];

fn mask_config(config: &Value) -> Value {
    match config {
        Value::Object(map) => {
            let mut masked = serde_json::Map::new();
            for (key, value) in map {
                if CREDENTIAL_KEYS.contains(&key.as_str()) && !value.is_null() {
                    masked.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    masked.insert(key.clone(), value.clone());
                }
            }
            Value::Object(masked)
        }
        other => other.clone(),
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct StorageProviderView {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub config: Value,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_providers_core(pool: &SqlitePool) -> Result<Vec<StorageProviderView>, String> {
    let rows = sqlx::query("SELECT id, name, kind, config, created_at, updated_at FROM storage_providers ORDER BY created_at")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let raw: String = row.try_get(3).map_err(|e| e.to_string())?;
            Ok(StorageProviderView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                kind: row.try_get(2).map_err(|e| e.to_string())?,
                config: mask_config(&serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null)),
                created_at: row.try_get(4).map_err(|e| e.to_string())?,
                updated_at: row.try_get(5).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_storage_providers(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<StorageProviderView>, String> {
    list_providers_core(&pool).await
}

#[derive(Debug, Deserialize)]
pub struct SaveStorageProviderPayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub config: Value,
}

const PROVIDER_KINDS: [&str; 6] = ["local", "s3", "gcs", "webdav", "gdrive", "onedrive"];

pub async fn save_provider_core(
    pool: &SqlitePool,
    payload: SaveStorageProviderPayload,
) -> Result<StorageProviderView, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Provider name is required".to_string());
    }
    if !PROVIDER_KINDS.contains(&payload.kind.as_str()) {
        return Err(format!("Unknown provider type: {}", payload.kind));
    }
    if payload.kind == "gdrive" || payload.kind == "onedrive" {
        return Err(format!(
            "{} storage is migration-pending in the Tauri desktop app (OAuth flows not migrated)",
            payload.kind
        ));
    }

    match payload.id.clone() {
        Some(id) => {
            sqlx::query(
                "UPDATE storage_providers SET name = ?, kind = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name)
            .bind(&payload.kind)
            .bind(payload.config.to_string())
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        None => {
            let id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO storage_providers (id, name, kind, config) VALUES (?, ?, ?, ?)")
                .bind(&id)
                .bind(name)
                .bind(&payload.kind)
                .bind(payload.config.to_string())
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    let had_id = payload.id.is_some();
    let target_id = payload.id.unwrap_or_default();

    list_providers_core(pool)
        .await?
        .into_iter()
        .find(|p| if had_id { p.id == target_id } else { p.name == name && p.kind == payload.kind })
        .ok_or_else(|| "Provider save failed".to_string())
}

#[tauri::command]
pub async fn save_storage_provider(
    pool: State<'_, SqlitePool>,
    payload: SaveStorageProviderPayload,
) -> Result<StorageProviderView, String> {
    save_provider_core(&pool, payload).await
}

pub async fn delete_provider_core(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM storage_providers WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_storage_provider(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<Value, String> {
    delete_provider_core(&pool, &id).await?;
    Ok(serde_json::json!({ "id": id }))
}

pub async fn test_provider_core(pool: &SqlitePool, id: &str) -> Result<Value, String> {
    let row = sqlx::query("SELECT kind, config FROM storage_providers WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Storage provider not found".to_string())?;
    let kind: String = row.try_get(0).map_err(|e| e.to_string())?;
    let config_raw: String = row.try_get(1).map_err(|e| e.to_string())?;
    let config = serde_json::from_str::<Value>(&config_raw).unwrap_or(Value::Null);

    match kind.as_str() {
        "local" => {
            let root = config
                .get("root")
                .or_else(|| config.get("rootPath"))
                .and_then(Value::as_str)
                .ok_or_else(|| "Local provider requires a 'root' path in its config".to_string())?;
            let root_path = std::path::Path::new(root);
            if !root_path.is_dir() {
                return Ok(serde_json::json!({
                    "ok": false,
                    "error": format!("Root path does not exist or is not a directory: {root}"),
                }));
            }
            // Writability probe via a temp file
            let probe = root_path.join(format!(".scriptmanager-test-{}", uuid::Uuid::new_v4()));
            match std::fs::write(&probe, b"probe") {
                Ok(()) => {
                    let _ = std::fs::remove_file(&probe);
                    Ok(serde_json::json!({ "ok": true }))
                }
                Err(e) => Ok(serde_json::json!({
                    "ok": false,
                    "error": format!("Root path is not writable: {e}"),
                })),
            }
        }
        "gdrive" | "onedrive" => Ok(serde_json::json!({
            "ok": false,
            "error": format!("{kind} storage is migration-pending (OAuth flows not migrated)"),
        })),
        other => Ok(serde_json::json!({
            "ok": false,
            "error": format!("{other} sync transport is migration-pending in the Tauri desktop app"),
        })),
    }
}

#[tauri::command]
pub async fn test_storage_provider(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<Value, String> {
    test_provider_core(&pool, &id).await
}

#[derive(Debug, Serialize)]
pub struct CollectionSyncReport {
    pub ok: bool,
    pub pulled: i64,
    pub pushed: i64,
    pub conflicts: i64,
    pub skipped: Vec<String>,
    pub error: Option<String>,
}

pub async fn sync_collection_core(pool: &SqlitePool, collection_id: &str) -> Result<CollectionSyncReport, String> {
    let collection = sqlx::query("SELECT id, name FROM collections WHERE id = ?")
        .bind(collection_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Collection not found".to_string())?;
    let _collection_id: String = collection.try_get(0).map_err(|e| e.to_string())?;
    let collection_name: String = collection.try_get(1).map_err(|e| e.to_string())?;

    // Push-sync every script in the collection to the provider target.
    let scripts = sqlx::query("SELECT filename, content FROM scripts WHERE collection_id = ? ORDER BY name")
        .bind(collection_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    if scripts.is_empty() {
        return Ok(CollectionSyncReport {
            ok: true,
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            skipped: vec![],
            error: None,
        });
    }
    let first = scripts.first().unwrap();
    let _: Option<String> = first.try_get(1).map_err(|e| e.to_string()).ok().flatten();

    // Provider target: default local provider root.
    let provider = sqlx::query("SELECT id, kind, config FROM storage_providers ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No storage provider configured".to_string())?;
    let kind: String = provider.try_get(1).map_err(|e| e.to_string())?;
    let config_raw: String = provider.try_get(2).map_err(|e| e.to_string())?;
    if kind != "local" {
        return Ok(CollectionSyncReport {
            ok: false,
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            skipped: vec![],
            error: Some(format!("{kind} sync transport is migration-pending in the Tauri desktop app")),
        });
    }
    let config = serde_json::from_str::<Value>(&config_raw).unwrap_or(Value::Null);
    let root = config
        .get("root")
        .or_else(|| config.get("rootPath"))
        .and_then(Value::as_str)
        .ok_or_else(|| "Local provider requires a 'root' path in its config".to_string())?;

    let target_dir = std::path::Path::new(root).join(&collection_name);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let mut pushed = 0i64;
    let mut skipped: Vec<String> = Vec::new();
    for row in &scripts {
        let filename: String = row.try_get(0).map_err(|e| e.to_string())?;
        let content: Option<String> = row.try_get(1).map_err(|e| e.to_string())?;
        match content {
            Some(content) if !filename.is_empty() => {
                let target = target_dir.join(&filename);
                match std::fs::write(&target, content) {
                    Ok(()) => pushed += 1,
                    Err(_) => skipped.push(filename),
                }
            }
            _ => skipped.push(filename),
        }
    }

    Ok(CollectionSyncReport {
        ok: true,
        pulled: 0,
        pushed,
        conflicts: 0,
        skipped,
        error: None,
    })
}

#[tauri::command]
pub async fn sync_collection(
    pool: State<'_, SqlitePool>,
    collection_id: String,
) -> Result<CollectionSyncReport, String> {
    sync_collection_core(&pool, &collection_id).await
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
    async fn list_output_masks_credential_fields() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO storage_providers (id, name, kind, config) VALUES ('p-1', 'NAS', 'local', ?)")
            .bind(serde_json::json!({"root": "/tmp/x", "password": "super-hidden"}).to_string())
            .execute(&pool)
            .await
            .unwrap();

        let providers = list_providers_core(&pool).await.unwrap();
        assert_eq!(providers.len(), 1);
        let json = serde_json::to_string(&providers).unwrap();
        assert!(!json.contains("super-hidden"));
        assert!(json.contains("[REDACTED]"));
        assert!(json.contains("/tmp/x"));
    }

    #[tokio::test]
    async fn save_rejects_unknown_and_pending_kinds() {
        let pool = test_pool().await;
        assert!(save_provider_core(&pool, SaveStorageProviderPayload {
            id: None, name: "X".into(), kind: "floppy".into(), config: serde_json::json!({})
        }).await.is_err());
        assert!(save_provider_core(&pool, SaveStorageProviderPayload {
            id: None, name: "G".into(), kind: "gdrive".into(), config: serde_json::json!({})
        }).await.is_err());
    }

    #[tokio::test]
    async fn local_provider_test_and_push_sync() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-storage-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();

        sqlx::query("INSERT INTO collections (id, name) VALUES ('c-1', 'Ops')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO scripts (id, name, filename, content, collection_id) VALUES ('s-1', 'Backup', 'backup.py', 'print(1)', 'c-1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO storage_providers (id, name, kind, config) VALUES ('p-1', 'NAS', 'local', ?)")
            .bind(serde_json::json!({"root": root.to_string_lossy()}).to_string())
            .execute(&pool)
            .await
            .unwrap();

        let test = test_provider_core(&pool, "p-1").await.unwrap();
        assert_eq!(test["ok"], true);

        let report = sync_collection_core(&pool, "c-1").await.unwrap();
        assert!(report.ok);
        assert_eq!(report.pushed, 1);
        assert!(root.join("Ops/backup.py").exists());

        let _ = std::fs::remove_dir_all(&root);
    }
}
