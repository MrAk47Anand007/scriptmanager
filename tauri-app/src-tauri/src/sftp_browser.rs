//! SFTP browser: list directories, read/write text files, and delete entries
//! on a server profile over the existing SSH transport.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tauri::State;

use crate::ssh_transport::{validate_remote_path, SshSession};

#[derive(Debug, Deserialize)]
pub struct SftpPathPayload {
    #[serde(rename = "profileId")]
    pub profile_id: String,
    pub path: String,
}

fn normalize_dir(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "~" {
        return "~".to_string();
    }
    let trimmed = trimmed.trim_end_matches('/');
    if trimmed.is_empty() {
        return "/".to_string();
    }
    trimmed.to_string()
}

fn join_dir(dir: &str, name: &str) -> String {
    if dir == "~" {
        format!("~/{name}")
    } else if dir == "/" {
        format!("/{name}")
    } else {
        format!("{dir}/{name}")
    }
}

#[tauri::command]
pub async fn sftp_list_dir(
    pool: State<'_, SqlitePool>,
    payload: SftpPathPayload,
) -> Result<Value, String> {
    let dir = normalize_dir(&payload.path);
    validate_remote_path(&dir)?;
    let connection = crate::ssh_transport::load_profile_connection(&pool, &payload.profile_id).await?;
    let mut session = SshSession::connect(&connection).await?;
    let result = async {
        let sftp = session.open_sftp().await?;
        let entries = sftp
            .read_dir(&dir)
            .await
            .map_err(|error| format!("Failed to list {dir}: {error}"))?;
        let mut items: Vec<Value> = entries
            .into_iter()
            .filter(|entry| entry.file_name() != "." && entry.file_name() != "..")
            .map(|entry| {
                let metadata = entry.metadata();
                json!({
                    "name": entry.file_name(),
                    "isDir": metadata.is_dir(),
                    "size": metadata.size,
                })
            })
            .collect();
        items.sort_by(|a, b| {
            let dir_order = b["isDir"].as_bool().cmp(&a["isDir"].as_bool());
            dir_order.then_with(|| {
                a["name"].as_str().unwrap_or("").to_lowercase().cmp(&b["name"].as_str().unwrap_or("").to_lowercase())
            })
        });
        Ok::<Value, String>(json!({ "path": dir, "entries": items }))
    }
    .await;
    session.disconnect().await;
    result
}

#[tauri::command]
pub async fn sftp_read_text_file(
    pool: State<'_, SqlitePool>,
    payload: SftpPathPayload,
) -> Result<Value, String> {
    validate_remote_path(&payload.path)?;
    let connection = crate::ssh_transport::load_profile_connection(&pool, &payload.profile_id).await?;
    let mut session = SshSession::connect(&connection).await?;
    let result = async {
        let bytes = crate::ssh_transport::sftp_download(&mut session, &payload.path).await?;
        if bytes.len() > 512 * 1024 {
            return Ok(json!({
                "path": payload.path,
                "truncated": true,
                "content": String::from_utf8_lossy(&bytes[..512 * 1024]),
                "size": bytes.len(),
            }));
        }
        match String::from_utf8(bytes.clone()) {
            Ok(text) => Ok(json!({ "path": payload.path, "content": text, "size": bytes.len() })),
            Err(_) => Ok(json!({
                "path": payload.path,
                "binary": true,
                "content": "",
                "size": bytes.len(),
            })),
        }
    }
    .await;
    session.disconnect().await;
    result
}

#[derive(Debug, Deserialize)]
pub struct SftpWritePayload {
    #[serde(rename = "profileId")]
    pub profile_id: String,
    pub path: String,
    pub content: String,
}

#[tauri::command]
pub async fn sftp_write_text_file(
    pool: State<'_, SqlitePool>,
    payload: SftpWritePayload,
) -> Result<Value, String> {
    validate_remote_path(&payload.path)?;
    let connection = crate::ssh_transport::load_profile_connection(&pool, &payload.profile_id).await?;
    let mut session = SshSession::connect(&connection).await?;
    let result = async {
        crate::ssh_transport::sftp_upload(&mut session, &payload.path, payload.content.as_bytes(), None).await?;
        Ok(json!({ "saved": true, "path": payload.path }))
    }
    .await;
    session.disconnect().await;
    result
}

#[tauri::command]
pub async fn sftp_delete_entry(
    pool: State<'_, SqlitePool>,
    payload: SftpPathPayload,
    is_dir: bool,
) -> Result<Value, String> {
    validate_remote_path(&payload.path)?;
    if payload.path == "/" || payload.path == "~" {
        return Err("Refusing to delete the root directory".to_string());
    }
    let connection = crate::ssh_transport::load_profile_connection(&pool, &payload.profile_id).await?;
    let mut session = SshSession::connect(&connection).await?;
    let result = async {
        let sftp = session.open_sftp().await?;
        if is_dir {
            sftp.remove_dir(&payload.path)
                .await
                .map_err(|error| format!("Failed to delete directory: {error}"))?;
        } else {
            sftp.remove_file(&payload.path)
                .await
                .map_err(|error| format!("Failed to delete file: {error}"))?;
        }
        Ok::<Value, String>(json!({ "deleted": true, "path": payload.path }))
    }
    .await;
    session.disconnect().await;
    result
}
