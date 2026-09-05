use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Deserialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::state::AppPaths;

/// Decision recorded in the migration completion plan (S3.1): the vault is
/// encrypted at rest with an AES-256-GCM master key generated on first use
/// and stored as a file in the Tauri app data directory. Plaintext leaves
/// Rust only through `reveal_secret`.
const KEY_FILE_NAME: &str = "secrets_master.key";

pub fn load_or_create_master_key(app_handle: &AppHandle) -> Result<Vec<u8>, String> {
    let paths = AppPaths::resolve(app_handle).map_err(|e| e.to_string())?;
    let key_path: PathBuf = paths.data_dir.join(KEY_FILE_NAME);
    if key_path.exists() {
        let encoded = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
        let key = BASE64
            .decode(encoded.trim())
            .map_err(|e| format!("Invalid master key file: {e}"))?;
        if key.len() != 32 {
            return Err("Master key file has an invalid length".to_string());
        }
        return Ok(key);
    }

    let mut key = vec![0u8; 32];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut key);
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&key_path, BASE64.encode(&key)).map_err(|e| e.to_string())?;
    Ok(key)
}

pub fn encrypt_value(key: &[u8], plaintext: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; 12];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_bytes())
        .map_err(|e| format!("Failed to encrypt secret: {e}"))?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(BASE64.encode(combined))
}

pub fn decrypt_value(key: &[u8], stored: &str) -> Result<String, String> {
    let combined = BASE64
        .decode(stored)
        .map_err(|e| format!("Invalid stored secret: {e}"))?;
    if combined.len() < 13 {
        return Err("Invalid stored secret payload".to_string());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|e| format!("Failed to decrypt secret: {e}"))?;
    String::from_utf8(plaintext).map_err(|e| format!("Decrypted secret is not UTF-8: {e}"))
}

async fn record_access(
    pool: &SqlitePool,
    secret_id: &str,
    action: &str,
    detail: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO secret_access_events (id, secret_id, action, detail) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(secret_id)
        .bind(action)
        .bind(detail)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct SecretView {
    pub id: String,
    pub name: String,
    pub description: String,
    pub scope: String,
    pub status: String,
    #[serde(rename = "currentVersion")]
    pub current_version: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    #[serde(rename = "_count")]
    pub counts: SecretCounts,
}

#[derive(Debug, serde::Serialize)]
pub struct SecretCounts {
    pub bindings: i64,
    #[serde(rename = "accessEvents")]
    pub access_events: i64,
}

pub async fn list_secret_views(pool: &SqlitePool) -> Result<Vec<SecretView>, String> {
    let rows = sqlx::query(
        "SELECT s.id, s.name, s.description, s.scope, s.status, s.current_version, s.updated_at,
                (SELECT COUNT(*) FROM secret_bindings b WHERE b.secret_id = s.id) AS bindings,
                (SELECT COUNT(*) FROM secret_access_events e WHERE e.secret_id = s.id) AS access_events
         FROM secrets s ORDER BY s.name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(SecretView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                description: row.try_get(2).map_err(|e| e.to_string())?,
                scope: row.try_get(3).map_err(|e| e.to_string())?,
                status: row.try_get(4).map_err(|e| e.to_string())?,
                current_version: row.try_get(5).map_err(|e| e.to_string())?,
                updated_at: row.try_get(6).map_err(|e| e.to_string())?,
                counts: SecretCounts {
                    bindings: row.try_get(7).map_err(|e| e.to_string())?,
                    access_events: row.try_get(8).map_err(|e| e.to_string())?,
                },
            })
        })
        .collect()
}

pub async fn create_secret_with_key(
    pool: &SqlitePool,
    key: &[u8],
    name: &str,
    plaintext: &str,
    description: Option<&str>,
    scope: Option<&str>,
) -> Result<SecretView, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Secret name is required".to_string());
    }
    if plaintext.is_empty() {
        return Err("Secret value is required".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let ciphertext = encrypt_value(key, plaintext)?;
    sqlx::query(
        "INSERT INTO secrets (id, name, description, scope) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(description.unwrap_or(""))
    .bind(scope.unwrap_or("global"))
    .execute(pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            "A secret with this name already exists".to_string()
        } else {
            e.to_string()
        }
    })?;
    sqlx::query("INSERT INTO secret_versions (id, secret_id, version_number, ciphertext) VALUES (?, ?, 1, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&id)
        .bind(ciphertext)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    record_access(pool, &id, "create", "secret created").await?;

    secret_view_by_id(pool, &id).await
}

pub async fn rotate_secret_with_key(
    pool: &SqlitePool,
    key: &[u8],
    secret_id: &str,
    plaintext: Option<&str>,
    reason: Option<&str>,
) -> Result<SecretView, String> {
    let plaintext = plaintext.ok_or_else(|| "New secret value is required to rotate".to_string())?;
    if plaintext.is_empty() {
        return Err("New secret value cannot be empty".to_string());
    }
    let row = sqlx::query("SELECT status, current_version FROM secrets WHERE id = ?")
        .bind(secret_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Secret not found".to_string())?;
    let status: String = row.try_get(0).map_err(|e| e.to_string())?;
    if status != "active" {
        return Err("Only active secrets can be rotated".to_string());
    }
    let next_version: i64 = row.try_get::<i64, _>(1).map_err(|e| e.to_string())? + 1;

    let ciphertext = encrypt_value(key, plaintext)?;
    sqlx::query(
        "INSERT INTO secret_versions (id, secret_id, version_number, ciphertext) VALUES (?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(secret_id)
    .bind(next_version)
    .bind(ciphertext)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE secrets SET current_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(next_version)
    .bind(secret_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    record_access(pool, secret_id, "rotate", reason.unwrap_or("value rotated")).await?;

    secret_view_by_id(pool, secret_id).await
}

pub async fn disable_secret_by_id(
    pool: &SqlitePool,
    secret_id: &str,
    reason: Option<&str>,
) -> Result<SecretView, String> {
    let result = sqlx::query("UPDATE secrets SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'")
        .bind(secret_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Secret not found or already disabled".to_string());
    }
    record_access(pool, secret_id, "disable", reason.unwrap_or("secret disabled")).await?;
    secret_view_by_id(pool, secret_id).await
}

pub async fn reveal_secret_with_key(
    pool: &SqlitePool,
    key: &[u8],
    secret_id: &str,
) -> Result<String, String> {
    let row = sqlx::query(
        "SELECT v.ciphertext FROM secrets s
         INNER JOIN secret_versions v ON v.secret_id = s.id AND v.version_number = s.current_version
         WHERE s.id = ? AND s.status = 'active'",
    )
    .bind(secret_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Secret not found or disabled".to_string())?;
    let stored: String = row.try_get(0).map_err(|e| e.to_string())?;
    let plaintext = decrypt_value(key, &stored)?;
    record_access(pool, secret_id, "reveal", "plaintext revealed once").await?;
    Ok(plaintext)
}

/// Rust-side resolution used by execution paths (scripts, API env, etc.).
/// Plaintext never crosses the IPC boundary through this function.
pub async fn resolve_secret_by_name(
    pool: &SqlitePool,
    key: &[u8],
    name: &str,
) -> Result<Option<String>, String> {
    let row = sqlx::query(
        "SELECT v.ciphertext FROM secrets s
         INNER JOIN secret_versions v ON v.secret_id = s.id AND v.version_number = s.current_version
         WHERE s.name = ? AND s.status = 'active'",
    )
    .bind(name)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    match row {
        Some(row) => {
            let stored: String = row.try_get(0).map_err(|e| e.to_string())?;
            Ok(Some(decrypt_value(key, &stored)?))
        }
        None => Ok(None),
    }
}

async fn secret_view_by_id(pool: &SqlitePool, secret_id: &str) -> Result<SecretView, String> {
    list_secret_views(pool)
        .await?
        .into_iter()
        .find(|view| view.id == secret_id)
        .ok_or_else(|| "Secret not found".to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateSecretPayload {
    pub name: String,
    pub plaintext: String,
    pub description: Option<String>,
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SecretActionPayload {
    pub id: String,
    pub plaintext: Option<String>,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn list_secrets(pool: State<'_, SqlitePool>) -> Result<Vec<SecretView>, String> {
    list_secret_views(&pool).await
}

#[tauri::command]
pub async fn create_secret(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: CreateSecretPayload,
) -> Result<SecretView, String> {
    let key = load_or_create_master_key(&app_handle)?;
    create_secret_with_key(
        &pool,
        &key,
        &payload.name,
        &payload.plaintext,
        payload.description.as_deref(),
        payload.scope.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn rotate_secret(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: SecretActionPayload,
) -> Result<SecretView, String> {
    let key = load_or_create_master_key(&app_handle)?;
    rotate_secret_with_key(&pool, &key, &payload.id, payload.plaintext.as_deref(), payload.reason.as_deref()).await
}

#[tauri::command]
pub async fn disable_secret(
    pool: State<'_, SqlitePool>,
    payload: SecretActionPayload,
) -> Result<SecretView, String> {
    disable_secret_by_id(&pool, &payload.id, payload.reason.as_deref()).await
}

#[tauri::command]
pub async fn reveal_secret(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: SecretActionPayload,
) -> Result<Value, String> {
    let key = load_or_create_master_key(&app_handle)?;
    let plaintext = reveal_secret_with_key(&pool, &key, &payload.id).await?;
    Ok(serde_json::json!({ "plaintext": plaintext }))
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

    fn test_key() -> Vec<u8> {
        vec![7u8; 32]
    }

    #[test]
    fn encrypt_decrypt_round_trip() {
        let key = test_key();
        let stored = encrypt_value(&key, "hunter-two").unwrap();
        assert!(!stored.contains("hunter-two"));
        assert_eq!(decrypt_value(&key, &stored).unwrap(), "hunter-two");
    }

    #[tokio::test]
    async fn secret_lifecycle_create_rotate_disable() {
        let pool = test_pool().await;
        let key = test_key();

        let view = create_secret_with_key(&pool, &key, "api-token", "first-value", Some("desc"), None)
            .await
            .unwrap();
        assert_eq!(view.name, "api-token");
        assert_eq!(view.current_version, 1);
        assert_eq!(view.status, "active");
        assert_eq!(view.counts.access_events, 1);

        let view = rotate_secret_with_key(&pool, &key, &view.id, Some("second-value"), None)
            .await
            .unwrap();
        assert_eq!(view.current_version, 2);
        assert_eq!(view.counts.access_events, 2);

        assert_eq!(
            resolve_secret_by_name(&pool, &key, "api-token").await.unwrap(),
            Some("second-value".to_string())
        );

        let view = disable_secret_by_id(&pool, &view.id, Some("cleanup")).await.unwrap();
        assert_eq!(view.status, "disabled");
        assert!(resolve_secret_by_name(&pool, &key, "api-token").await.unwrap().is_none());
        assert!(rotate_secret_with_key(&pool, &key, &view.id, Some("x"), None).await.is_err());
    }

    #[tokio::test]
    async fn list_output_never_contains_plaintext() {
        let pool = test_pool().await;
        let key = test_key();
        create_secret_with_key(&pool, &key, "db-password", "super-hidden-value", None, None)
            .await
            .unwrap();

        let views = serde_json::to_string(&list_secret_views(&pool).await.unwrap()).unwrap();
        assert!(!views.contains("super-hidden-value"));
    }

    #[tokio::test]
    async fn duplicate_secret_name_is_rejected() {
        let pool = test_pool().await;
        let key = test_key();
        create_secret_with_key(&pool, &key, "dup", "a", None, None).await.unwrap();
        assert!(create_secret_with_key(&pool, &key, "dup", "b", None, None).await.is_err());
    }

    #[tokio::test]
    async fn reveal_records_access_event() {
        let pool = test_pool().await;
        let key = test_key();
        let view = create_secret_with_key(&pool, &key, "reveal-me", "plain", None, None).await.unwrap();
        assert_eq!(reveal_secret_with_key(&pool, &key, &view.id).await.unwrap(), "plain");
        let after = list_secret_views(&pool).await.unwrap().remove(0);
        assert_eq!(after.counts.access_events, 2);
    }
}
