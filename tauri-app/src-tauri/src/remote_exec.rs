use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

/// SSH transport decision (recorded in the migration completion plan, S7.2):
/// profile CRUD, TCP connection tests, and the approval/audit workflow are
/// migrated now. Actual SSH command execution stays behind a typed
/// pending error until an SSH crate (russh) is wired in a dedicated slice —
/// never a silent failure, and never shell string interpolation of user input.

#[derive(Debug, Serialize, Clone)]
pub struct ServerProfileView {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub has_secret: bool,
    pub key_path: Option<String>,
    pub project_id: Option<String>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

async fn load_profiles(pool: &SqlitePool) -> Result<Vec<ServerProfileView>, String> {
    let rows = sqlx::query(
        "SELECT id, name, host, port, username, auth_method,
                CASE WHEN encrypted_secret IS NOT NULL AND encrypted_secret != '' THEN 1 ELSE 0 END,
                key_path, project_id, notes, created_at, updated_at
         FROM server_profiles ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(ServerProfileView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                host: row.try_get(2).map_err(|e| e.to_string())?,
                port: row.try_get(3).map_err(|e| e.to_string())?,
                username: row.try_get(4).map_err(|e| e.to_string())?,
                auth_method: row.try_get(5).map_err(|e| e.to_string())?,
                has_secret: row.try_get::<i64, _>(6).map_err(|e| e.to_string())? != 0,
                key_path: row.try_get(7).map_err(|e| e.to_string())?,
                project_id: row.try_get(8).map_err(|e| e.to_string())?,
                notes: row.try_get(9).map_err(|e| e.to_string())?,
                created_at: row.try_get(10).map_err(|e| e.to_string())?,
                updated_at: row.try_get(11).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_server_profiles(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ServerProfileView>, String> {
    load_profiles(&pool).await
}

#[derive(Debug, Deserialize)]
pub struct SaveServerProfilePayload {
    pub id: Option<String>,
    pub name: String,
    pub host: String,
    pub port: Option<i64>,
    pub username: String,
    #[serde(default = "default_auth_method")]
    pub auth_method: String,
    pub has_secret: Option<bool>,
    /// Plaintext password or key passphrase. Encrypted at rest immediately;
    /// never persisted or logged as plaintext.
    #[serde(default)]
    pub secret: Option<String>,
    pub key_path: Option<String>,
    pub project_id: Option<String>,
    pub notes: Option<String>,
}

fn default_auth_method() -> String {
    "password".to_string()
}

pub async fn save_profile_core(
    pool: &SqlitePool,
    payload: SaveServerProfilePayload,
) -> Result<ServerProfileView, String> {
    let name = payload.name.trim();
    if name.is_empty() || payload.host.trim().is_empty() || payload.username.trim().is_empty() {
        return Err("Profile name, host and username are required".to_string());
    }
    if payload.auth_method != "password" && payload.auth_method != "key" {
        return Err(format!("Unknown auth method: {}", payload.auth_method));
    }
    let secret_ciphertext: Option<String> = match payload.secret.as_deref() {
        Some(secret) if !secret.trim().is_empty() => {
            Some(crate::ssh_transport::encrypt_profile_secret(secret)?)
        }
        _ => None,
    };

    match payload.id.clone() {
        Some(id) => {
            sqlx::query(
                "UPDATE server_profiles SET name = ?, host = ?, port = ?, username = ?, auth_method = ?,
                    encrypted_secret = COALESCE(? , encrypted_secret),
                    has_secret = CASE WHEN COALESCE(?, encrypted_secret) IS NOT NULL THEN 1 ELSE 0 END,
                    key_path = ?, project_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name)
            .bind(payload.host.trim())
            .bind(payload.port.unwrap_or(22))
            .bind(payload.username.trim())
            .bind(&payload.auth_method)
            .bind(&secret_ciphertext)
            .bind(&secret_ciphertext)
            .bind(payload.key_path.as_deref().filter(|p| !p.is_empty()))
            .bind(payload.project_id.as_deref().filter(|p| !p.is_empty()))
            .bind(payload.notes.as_deref().unwrap_or(""))
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        None => {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO server_profiles (id, name, host, port, username, auth_method, has_secret, encrypted_secret, key_path, project_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(name)
            .bind(payload.host.trim())
            .bind(payload.port.unwrap_or(22))
            .bind(payload.username.trim())
            .bind(&payload.auth_method)
            .bind(secret_ciphertext.is_some())
            .bind(&secret_ciphertext)
            .bind(payload.key_path.as_deref().filter(|p| !p.is_empty()))
            .bind(payload.project_id.as_deref().filter(|p| !p.is_empty()))
            .bind(payload.notes.as_deref().unwrap_or(""))
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    load_profiles(pool)
        .await?
        .into_iter()
        .find(|p| Some(p.id.clone()) == payload.id || p.name == name && payload.id.is_none())
        .ok_or_else(|| "Profile save failed".to_string())
}

#[tauri::command]
pub async fn save_server_profile(
    pool: State<'_, SqlitePool>,
    payload: SaveServerProfilePayload,
) -> Result<ServerProfileView, String> {
    save_profile_core(&pool, payload).await
}

pub async fn delete_profile_core(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM server_profiles WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    record_audit(pool, "server_profile.delete", "local-admin", id, "profile removed").await
}

#[tauri::command]
pub async fn delete_server_profile(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    delete_profile_core(&pool, &id).await
}

pub(crate) async fn record_audit(
    pool: &SqlitePool,
    action: &str,
    actor: &str,
    resource: &str,
    detail: &str,
) -> Result<(), String> {
    sqlx::query("INSERT INTO audit_log (id, action, actor, resource, detail) VALUES (?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(action)
        .bind(actor)
        .bind(resource)
        .bind(detail)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn probe_ssh_identification(host: &str, port: i64) -> (bool, i64, Option<String>, String) {
    let started = std::time::Instant::now();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        async {
            let mut stream = tokio::net::TcpStream::connect((host, port as u16)).await?;
            let mut banner = Vec::new();
            let mut byte = [0u8; 1];
            while banner.len() < 255 {
                let read = stream.read(&mut byte).await?;
                if read == 0 {
                    break;
                }
                banner.push(byte[0]);
                if byte[0] == b'\n' {
                    break;
                }
            }
            let banner_text = String::from_utf8_lossy(&banner).trim().to_string();
            if banner_text.starts_with("SSH-") {
                let _ = stream.write_all(b"SSH-2.0-ScriptManager_Tauri\r\n").await;
                Ok::<_, std::io::Error>((true, Some(banner_text), "SSH identification succeeded".to_string()))
            } else if banner_text.is_empty() {
                Ok((false, None, "Connection opened but no SSH identification banner was received".to_string()))
            } else {
                Ok((false, Some(banner_text.clone()), format!("Remote service is not SSH: {banner_text}")))
            }
        },
    )
    .await;
    let latency = started.elapsed().as_millis() as i64;
    match result {
        Ok(Ok((ok, banner, message))) => (ok, latency, banner, message),
        Ok(Err(error)) => (false, latency, None, format!("SSH connection failed: {error}")),
        Err(_) => (false, latency, None, "SSH connection timed out".to_string()),
    }
}

pub async fn test_connection_core(pool: &SqlitePool, profile_id: &str) -> Result<Value, String> {
    let row = sqlx::query(
        "SELECT host, port, encrypted_secret, key_path FROM server_profiles WHERE id = ?",
    )
    .bind(profile_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Server profile not found".to_string())?;
    let host: String = row.try_get(0).map_err(|e| e.to_string())?;
    let port: i64 = row.try_get(1).map_err(|e| e.to_string())?;
    let encrypted_secret: Option<String> = row.try_get(2).map_err(|e| e.to_string())?;
    let key_path: Option<String> = row.try_get(3).map_err(|e| e.to_string())?;
    let has_credentials = encrypted_secret
        .as_deref()
        .map(|s| !s.is_empty())
        .unwrap_or(false)
        || key_path.as_deref().map(|p| !p.trim().is_empty()).unwrap_or(false);

    // Banner probe: cheap reachability + protocol identity check.
    let (ok, latency, banner, message) = probe_ssh_identification(&host, port).await;

    // When credentials are stored, upgrade to a full authenticated SSH
    // handshake. This also pins the host key fingerprint (trust on first use).
    let mut authenticated = false;
    let mut learned_fingerprint: Option<String> = None;
    let mut full_message = message;
    if ok && has_credentials {
        match crate::ssh_transport::load_profile_connection(pool, profile_id).await {
            Ok(connection) => match crate::ssh_transport::SshSession::connect(&connection).await {
                Ok(session) => {
                    authenticated = true;
                    learned_fingerprint = session.host_key_fingerprint.clone();
                    full_message = "SSH authentication succeeded".to_string();
                    session.disconnect().await;
                }
                Err(auth_error) => {
                    record_audit(
                        pool,
                        "server_profile.test_connection_failed",
                        "local-admin",
                        profile_id,
                        &auth_error,
                    )
                    .await?;
                    return Ok(serde_json::json!({
                        "ok": false,
                        "success": false,
                        "latencyMs": latency,
                        "latency_ms": latency,
                        "transport": "ssh",
                        "banner": banner,
                        "authenticated": false,
                        "error": auth_error.clone(),
                        "message": format!("{auth_error} for {host}:{port} in {latency}ms"),
                    }));
                }
            },
            Err(load_error) => {
                return Ok(serde_json::json!({
                    "ok": false,
                    "success": false,
                    "latencyMs": latency,
                    "latency_ms": latency,
                    "transport": "ssh",
                    "banner": banner,
                    "authenticated": false,
                    "error": load_error.clone(),
                    "message": format!("{load_error} for {host}:{port} in {latency}ms"),
                }));
            }
        }
    }

    if let Some(fingerprint) = &learned_fingerprint {
        let _ = sqlx::query(
            "UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?",
        )
        .bind(fingerprint)
        .bind(profile_id)
        .execute(pool)
        .await;
    }

    record_audit(pool, "server_profile.test_connection", "local-admin", profile_id, &format!("{host}:{port}")).await?;

    Ok(serde_json::json!({
        "ok": ok && (authenticated || !has_credentials),
        "success": ok && (authenticated || !has_credentials),
        "latencyMs": latency,
        "latency_ms": latency,
        "transport": "ssh",
        "banner": banner,
        "authenticated": authenticated,
        "hostKeyFingerprint": learned_fingerprint,
        "error": if ok && (authenticated || !has_credentials) { Value::Null } else { Value::String(full_message.clone()) },
        "message": format!("{full_message} for {host}:{port} in {latency}ms"),
    }))
}

#[tauri::command]
pub async fn test_server_profile_connection(
    pool: State<'_, SqlitePool>,
    profile_id: String,
) -> Result<Value, String> {
    test_connection_core(&pool, &profile_id).await
}

#[derive(Debug, Deserialize)]
pub struct StartRemoteExecPayload {
    #[serde(rename = "profileId", alias = "profile_id")]
    pub profile_id: String,
    #[serde(rename = "scriptId", alias = "script_id")]
    pub script_id: Option<String>,
    pub command: String,
    pub note: Option<String>,
}

pub async fn start_remote_exec_core(
    pool: &SqlitePool,
    payload: StartRemoteExecPayload,
) -> Result<Value, String> {
    if payload.command.trim().is_empty() {
        return Err("Remote command is required".to_string());
    }
    let profile_row = sqlx::query(
        "SELECT p.id, COALESCE(pr.environment, 'production') FROM server_profiles p
         LEFT JOIN projects pr ON pr.id = p.project_id
         WHERE p.id = ?",
    )
        .bind(&payload.profile_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    let profile_row = profile_row.ok_or_else(|| "Server profile not found".to_string())?;
    let environment: String = profile_row.try_get(1).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO remote_executions (id, profile_id, script_id, command, note) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.profile_id)
    .bind(payload.script_id.as_deref().filter(|s| !s.is_empty()))
    .bind(payload.command.trim())
    .bind(payload.note.as_deref().unwrap_or(""))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    record_audit(pool, "remote_exec.start", "local-admin", &id, payload.command.trim()).await?;

    Ok(serde_json::json!({
        "remote_exec_id": id,
        "status": "pending",
        "requires_approval": true,
        "environment": environment,
    }))
}

#[tauri::command]
pub async fn start_remote_execution(
    pool: State<'_, SqlitePool>,
    payload: StartRemoteExecPayload,
) -> Result<Value, String> {
    start_remote_exec_core(&pool, payload).await
}

pub async fn decide_remote_exec_core(
    pool: &SqlitePool,
    id: &str,
    approve: bool,
    note: Option<&str>,
) -> Result<Value, String> {
    let row = sqlx::query("SELECT status FROM remote_executions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Remote execution not found".to_string())?;
    let status: String = row.try_get(0).map_err(|e| e.to_string())?;
    if status != "pending" {
        return Err("Remote execution has already been decided".to_string());
    }

    let new_status = if approve { "approved" } else { "rejected" };
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE remote_executions SET status = ?, approved_by = ?, note = ?, approved_at = ?,
            finished_at = CASE WHEN ? = 'rejected' THEN ? ELSE NULL END WHERE id = ?",
    )
    .bind(new_status)
    .bind("local-admin")
    .bind(note.unwrap_or(""))
    .bind(if approve { Some(now.as_str()) } else { None })
    .bind(new_status)
    .bind(&now)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    record_audit(
        pool,
        if approve { "remote_exec.approve" } else { "remote_exec.reject" },
        "local-admin",
        id,
        note.unwrap_or(""),
    )
    .await?;

    Ok(serde_json::json!({ "ok": true, "remote_exec_id": id, "status": new_status }))
}

fn remote_exec_transport_failure(output: &str) -> String {
    format!("Remote SSH execution failed: {output}")
}

async fn persist_remote_exec_failure(
    pool: &SqlitePool,
    id: &str,
    message: &str,
) -> Result<(), String> {
    let output = format!("{message}\n");
    let finished = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "UPDATE remote_executions SET status = 'failed', output = ?, log_output = ?,
            exit_code = ?, finished_at = ? WHERE id = ?",
    )
    .bind(&output)
    .bind(&output)
    .bind(crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE)
    .bind(&finished)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    record_audit(pool, "remote_exec.execute_failed", "local-admin", id, message).await
}

pub async fn finalize_approved_remote_exec_core(
    app_handle: Option<&AppHandle>,
    pool: &SqlitePool,
    id: &str,
) -> Result<Value, String> {
    let row = sqlx::query("SELECT status, command, profile_id FROM remote_executions WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Remote execution not found".to_string())?;
    let status: String = row.try_get(0).map_err(|e| e.to_string())?;
    let command: String = row.try_get(1).map_err(|e| e.to_string())?;
    let profile_id: String = row.try_get(2).map_err(|e| e.to_string())?;
    if status != "approved" {
        return Err("Remote execution must be approved before it can run".to_string());
    }

    let started = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE remote_executions SET status = 'running', started_at = ? WHERE id = ?")
        .bind(&started)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    emit_remote_exec_event(
        app_handle,
        serde_json::json!({ "type": "line", "remoteExecId": id, "line": format!("Connecting over SSH to run: {}", command.trim()) }),
    );

    let connection = match crate::ssh_transport::load_profile_connection(pool, &profile_id).await {
        Ok(connection) => connection,
        Err(error) => {
            persist_remote_exec_failure(pool, id, &error).await?;
            emit_remote_exec_event(
                app_handle,
                serde_json::json!({ "type": "error", "remoteExecId": id, "message": error }),
            );
            return Ok(serde_json::json!({
                "ok": false,
                "remote_exec_id": id,
                "status": "failed",
                "exitCode": crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE,
                "message": error,
            }));
        }
    };

    let mut session = match crate::ssh_transport::SshSession::connect(&connection).await {
        Ok(session) => session,
        Err(error) => {
            persist_remote_exec_failure(pool, id, &error).await?;
            emit_remote_exec_event(
                app_handle,
                serde_json::json!({ "type": "error", "remoteExecId": id, "message": error }),
            );
            return Ok(serde_json::json!({
                "ok": false,
                "remote_exec_id": id,
                "status": "failed",
                "exitCode": crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE,
                "message": error,
            }));
        }
    };

    // Pin the host key fingerprint on first contact so later mismatches fail.
    if let Some(fingerprint) = &session.host_key_fingerprint {
        let _ = sqlx::query(
            "UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?",
        )
        .bind(fingerprint)
        .bind(&profile_id)
        .execute(pool)
        .await;
        record_audit(
            pool,
            "remote_exec.host_key_recorded",
            "local-admin",
            &profile_id,
            fingerprint,
        )
        .await?;
    }

    let mut collected: Vec<String> = Vec::new();
    let app_for_stream = app_handle.cloned();
    let run_result = session
        .run_command(
            &command,
            crate::ssh_transport::SSH_COMMAND_TIMEOUT_SECS,
            |line, is_stderr| {
                if is_stderr {
                    collected.push(format!("[stderr] {line}"));
                } else {
                    collected.push(line.to_string());
                }
                emit_remote_exec_event(
                    app_for_stream.as_ref(),
                    serde_json::json!({ "type": "line", "remoteExecId": id, "line": line }),
                );
            },
        )
        .await;

    session.disconnect().await;

    match run_result {
        Ok(exit_code) => {
            let output = if collected.is_empty() {
                String::new()
            } else {
                format!("{}\n", collected.join("\n"))
            };
            let finished = chrono::Utc::now().to_rfc3339();
            let final_status = if exit_code == 0 { "done" } else { "failed" };
            sqlx::query(
                "UPDATE remote_executions SET status = ?, output = ?, log_output = ?,
                    exit_code = ?, finished_at = ? WHERE id = ?",
            )
            .bind(final_status)
            .bind(&output)
            .bind(&output)
            .bind(exit_code)
            .bind(&finished)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            record_audit(
                pool,
                "remote_exec.execute",
                "local-admin",
                id,
                &format!("exit {exit_code}"),
            )
            .await?;
            if exit_code == 0 {
                emit_remote_exec_event(
                    app_handle,
                    serde_json::json!({ "type": "done", "remoteExecId": id, "exitCode": exit_code }),
                );
            } else {
                emit_remote_exec_event(
                    app_handle,
                    serde_json::json!({
                        "type": "error",
                        "remoteExecId": id,
                        "message": format!("Remote command exited with code {exit_code}"),
                        "exitCode": exit_code,
                    }),
                );
            }
            Ok(serde_json::json!({
                "ok": exit_code == 0,
                "remote_exec_id": id,
                "status": final_status,
                "exitCode": exit_code,
                "output": output,
            }))
        }
        Err(error) => {
            let message = remote_exec_transport_failure(&error);
            persist_remote_exec_failure(pool, id, &message).await?;
            emit_remote_exec_event(
                app_handle,
                serde_json::json!({ "type": "error", "remoteExecId": id, "message": message.clone() }),
            );
            Ok(serde_json::json!({
                "ok": false,
                "remote_exec_id": id,
                "status": "failed",
                "exitCode": crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE,
                "message": message,
            }))
        }
    }
}

#[tauri::command]
pub async fn approve_remote_execution(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: DecideRemoteExecPayload,
) -> Result<Value, String> {
    let result = decide_remote_exec_core(&pool, &payload.id, true, payload.note.as_deref()).await?;
    finalize_approved_remote_exec_core(Some(&app_handle), &pool, &payload.id).await?;
    Ok(result)
}

#[derive(Debug, Deserialize)]
pub struct DecideRemoteExecPayload {
    pub id: String,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn reject_remote_execution(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: DecideRemoteExecPayload,
) -> Result<Value, String> {
    let result = decide_remote_exec_core(&pool, &payload.id, false, payload.note.as_deref()).await?;
    emit_remote_exec_event(
        Some(&app_handle),
        serde_json::json!({ "type": "done", "remoteExecId": payload.id, "exitCode": 0 }),
    );
    Ok(result)
}

pub(crate) fn emit_remote_exec_event(app_handle: Option<&AppHandle>, payload: Value) {
    if let Some(handle) = app_handle {
        handle.emit("remote-exec-event", payload).ok();
    }
}

#[derive(Debug, Deserialize)]
pub struct TransferRemoteScriptPayload {
    #[serde(rename = "profileId", alias = "profile_id")]
    pub profile_id: String,
    #[serde(rename = "scriptId", alias = "script_id")]
    pub script_id: Option<String>,
    #[serde(rename = "remotePath", alias = "remote_path")]
    pub remote_path: String,
    #[serde(default)]
    pub permissions: Option<String>,
}

#[tauri::command]
pub async fn transfer_remote_script(
    pool: State<'_, SqlitePool>,
    payload: TransferRemoteScriptPayload,
) -> Result<Value, String> {
    transfer_remote_script_core(&pool, payload).await
}

pub async fn transfer_remote_script_core(
    pool: &SqlitePool,
    payload: TransferRemoteScriptPayload,
) -> Result<Value, String> {
    crate::ssh_transport::validate_remote_path(&payload.remote_path)?;

    // Read the script content from SQLite; the transfer never shells out.
    let content: String = match payload.script_id.as_deref().filter(|s| !s.is_empty()) {
        Some(script_id) => {
            let row = sqlx::query("SELECT COALESCE(content, '') FROM scripts WHERE id = ?")
                .bind(script_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| format!("Script not found: {script_id}"))?;
            let content: String = row.try_get(0).map_err(|e| e.to_string())?;
            if content.trim().is_empty() {
                return Err(format!("Script {script_id} has no content to transfer"));
            }
            content
        }
        None => return Err("scriptId is required for remote transfer".to_string()),
    };

    let connection =
        crate::ssh_transport::load_profile_connection(pool, &payload.profile_id).await?;
    let mut session = crate::ssh_transport::SshSession::connect(&connection).await?;
    if let Some(fingerprint) = &session.host_key_fingerprint {
        let _ = sqlx::query(
            "UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?",
        )
        .bind(fingerprint)
        .bind(&payload.profile_id)
        .execute(pool)
        .await;
    }
    let upload = crate::ssh_transport::sftp_upload(
        &mut session,
        payload.remote_path.trim(),
        content.as_bytes(),
        payload.permissions.as_deref(),
    )
    .await;
    session.disconnect().await;
    upload.map_err(|e| e.to_string())?;

    record_audit(
        pool,
        "remote_exec.transfer",
        "local-admin",
        &payload.profile_id,
        &format!("{} -> {}", payload.script_id.as_deref().unwrap_or(""), payload.remote_path.trim()),
    )
    .await?;

    Ok(serde_json::json!({
        "success": true,
        "remote_path": payload.remote_path.trim(),
        "bytes": content.len(),
    }))
}

#[derive(Debug, Deserialize, Default)]
pub struct AuditLogParams {
    #[serde(rename = "profileId", alias = "profile_id")]
    pub profile_id: Option<String>,
    #[serde(rename = "scriptId", alias = "script_id")]
    pub script_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[tauri::command]
pub async fn list_audit_log(
    pool: State<'_, SqlitePool>,
    params: Option<AuditLogParams>,
) -> Result<Value, String> {
    let (limit, offset) = match &params {
        Some(p) => (p.limit.unwrap_or(100), p.offset.unwrap_or(0)),
        None => (100, 0),
    };
    // Renderer audit trail consumes remote-execution records
    // ({ total, executions: [...] } with 'pending_approval' status naming).
    let rows = sqlx::query(
        "SELECT r.id, COALESCE(r.script_id, ''), r.profile_id, COALESCE(s.name, ''), COALESCE(p.name, ''),
                COALESCE(p.host, ''), r.status, 'manual', r.approved_by, NULL, r.exit_code, r.output,
                '{}', r.created_at, r.finished_at
         FROM remote_executions r
         LEFT JOIN server_profiles p ON p.id = r.profile_id
         LEFT JOIN scripts s ON s.id = r.script_id
         ORDER BY r.created_at DESC LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM remote_executions")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let executions: Vec<Value> = rows
        .iter()
        .map(|row| {
            let status: String = row.try_get::<String, _>(6).map_err(|e| e.to_string())?;
            let status = match status.as_str() {
                "pending" => "pending_approval",
                "done" => "success",
                other => other,
            };
            Ok::<Value, String>(serde_json::json!({
                "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
                "script_id": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
                "profile_id": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
                "script_name": row.try_get::<String, _>(3).map_err(|e| e.to_string())?,
                "profile_name": row.try_get::<String, _>(4).map_err(|e| e.to_string())?,
                "server_host": row.try_get::<String, _>(5).map_err(|e| e.to_string())?,
                "status": status,
                "triggered_by": row.try_get::<String, _>(7).map_err(|e| e.to_string())?,
                "approved_by": row.try_get::<Option<String>, _>(8).map_err(|e| e.to_string())?,
                "remote_path": row.try_get::<Option<String>, _>(9).map_err(|e| e.to_string())?,
                "exit_code": row.try_get::<Option<i64>, _>(10).map_err(|e| e.to_string())?,
                "log_output": row.try_get::<Option<String>, _>(11).map_err(|e| e.to_string())?,
                "param_values": row.try_get::<String, _>(12).map_err(|e| e.to_string())?,
                "requested_at": row.try_get::<String, _>(13).map_err(|e| e.to_string())?,
                "approved_at": row.try_get::<Option<String>, _>(14).map_err(|e| e.to_string())?,
            }))
        })
        .collect::<Result<_, _>>()?;

    Ok(serde_json::json!({ "total": total, "executions": executions }))
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

    fn payload(name: &str) -> SaveServerProfilePayload {
        SaveServerProfilePayload {
            id: None,
            name: name.to_string(),
            host: "127.0.0.1".to_string(),
            port: Some(22),
            username: "deployer".to_string(),
            auth_method: "key".to_string(),
            has_secret: Some(false),
            secret: None,
            key_path: None,
            project_id: None,
            notes: Some("test".to_string()),
        }
    }

    async fn spawn_banner_server(banner: &'static str) -> u16 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let _ = socket.write_all(banner.as_bytes()).await;
                let mut client_identification = [0u8; 128];
                let _ = socket.read(&mut client_identification).await;
            }
        });
        port
    }

    async fn spawn_ssh_identification_server() -> (u16, tokio::sync::oneshot::Receiver<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind test listener");
        let port = listener.local_addr().unwrap().port();
        let (sender, receiver) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let _ = socket.write_all(b"SSH-2.0-scriptmanager-test\r\n").await;
                let mut client_identification = Vec::new();
                let mut byte = [0u8; 1];
                while client_identification.len() < 255 {
                    match socket.read(&mut byte).await {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {
                            client_identification.push(byte[0]);
                            if byte[0] == b'\n' {
                                break;
                            }
                        }
                    }
                }
                let _ = sender.send(String::from_utf8_lossy(&client_identification).trim().to_string());
            }
        });
        (port, receiver)
    }

    #[tokio::test]
    async fn profile_crud_round_trip() {
        crate::ssh_test_server::init_master_key();
        let pool = test_pool().await;
        let saved = save_profile_core(&pool, payload("web-1")).await.unwrap();
        assert!(!saved.has_secret);
        assert_eq!(saved.auth_method, "key");

        let updated = save_profile_core(
            &pool,
            SaveServerProfilePayload {
                id: Some(saved.id.clone()),
                name: "web-1-renamed".to_string(),
                host: "127.0.0.1".to_string(),
                port: Some(2222),
                username: "deployer".to_string(),
                auth_method: "password".to_string(),
                has_secret: None,
                secret: Some("s3cret-value".to_string()),
                key_path: None,
                project_id: None,
                notes: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.name, "web-1-renamed");
        assert_eq!(updated.port, 2222);
        assert!(updated.has_secret);
        assert_eq!(updated.auth_method, "password");

        // The plaintext secret must never be visible in profile listings.
        let stored = sqlx::query("SELECT encrypted_secret FROM server_profiles WHERE id = ?")
            .bind(&updated.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        let encrypted: String = stored.try_get(0).unwrap();
        assert!(!encrypted.contains("s3cret-value"));
        assert_ne!(encrypted, "s3cret-value");

        delete_profile_core(&pool, &updated.id).await.unwrap();
        assert!(load_profiles(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn profile_validation_rejects_incomplete_input() {
        let pool = test_pool().await;
        let mut bad = payload("bad");
        bad.username = "  ".to_string();
        assert!(save_profile_core(&pool, bad).await.is_err());
        let mut bad_auth = payload("badauth");
        bad_auth.auth_method = "magic".to_string();
        assert!(save_profile_core(&pool, bad_auth).await.is_err());
    }

    #[tokio::test]
    async fn remote_exec_approval_state_machine_and_audit() {
        let pool = test_pool().await;
        let profile = save_profile_core(&pool, payload("web-1")).await.unwrap();

        let started = start_remote_exec_core(
            &pool,
            StartRemoteExecPayload {
                profile_id: profile.id.clone(),
                script_id: None,
                command: "systemctl status app".to_string(),
                note: Some("check service".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(started["status"], "pending");

        let exec_id = started["remote_exec_id"].as_str().unwrap().to_string();
        let rejected = decide_remote_exec_core(&pool, &exec_id, false, Some("wrong window"))
            .await
            .unwrap();
        assert_eq!(rejected["status"], "rejected");

        // Decided executions are immutable.
        assert!(decide_remote_exec_core(&pool, &exec_id, true, None).await.is_err());

        let audit = audit_entries(&pool).await.unwrap();
        assert!(audit.iter().any(|e| e["action"] == "remote_exec.reject"));
    }

    #[tokio::test]
    async fn remote_exec_start_returns_renderer_approval_contract() {
        let pool = test_pool().await;
        let profile = save_profile_core(&pool, payload("web-approval")).await.unwrap();

        let started = start_remote_exec_core(
            &pool,
            StartRemoteExecPayload {
                profile_id: profile.id,
                script_id: None,
                command: "deploy".to_string(),
                note: None,
            },
        )
        .await
        .unwrap();

        assert_eq!(started["status"], "pending");
        assert_eq!(started["requires_approval"], true);
        assert!(started["remote_exec_id"].as_str().unwrap().len() > 8);
        assert_eq!(started["environment"], "production");
    }

    #[tokio::test]
    async fn approved_remote_exec_fails_when_host_is_unreachable() {
        crate::ssh_test_server::init_master_key();
        let pool = test_pool().await;
        let profile = save_profile_core(&pool, payload("web-finalize")).await.unwrap();
        let started = start_remote_exec_core(
            &pool,
            StartRemoteExecPayload {
                profile_id: profile.id,
                script_id: None,
                command: "uptime".to_string(),
                note: None,
            },
        )
        .await
        .unwrap();
        let exec_id = started["remote_exec_id"].as_str().unwrap().to_string();

        let approved = decide_remote_exec_core(&pool, &exec_id, true, Some("approved for smoke"))
            .await
            .unwrap();
        assert_eq!(approved["status"], "approved");
        // Port 22 has no test SSH server listening: transport must fail loudly.
        let finalized = finalize_approved_remote_exec_core(None, &pool, &exec_id)
            .await
            .unwrap();
        assert_eq!(finalized["status"], "failed");
        assert_eq!(
            finalized["exitCode"],
            crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE
        );

        let row = sqlx::query(
            "SELECT status, output, log_output, exit_code, approved_at, started_at, finished_at
             FROM remote_executions WHERE id = ?",
        )
        .bind(&exec_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.try_get::<String, _>(0).unwrap(), "failed");
        assert!(row.try_get::<String, _>(1).unwrap().contains("failed"));
        assert!(row.try_get::<Option<String>, _>(2).unwrap().is_some());
        assert_eq!(
            row.try_get::<Option<i64>, _>(3).unwrap(),
            Some(crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE)
        );
        assert!(row.try_get::<Option<String>, _>(4).unwrap().is_some());
        assert!(row.try_get::<Option<String>, _>(5).unwrap().is_some());
        assert!(row.try_get::<Option<String>, _>(6).unwrap().is_some());

        let audit = audit_entries(&pool).await.unwrap();
        assert!(audit.iter().any(|e| e["action"] == "remote_exec.execute_failed"));
    }

    #[tokio::test]
    async fn approved_remote_exec_runs_over_ssh_and_streams_output() {
        crate::ssh_test_server::init_master_key();
        let (port, _files, behavior) = crate::ssh_test_server::spawn().await;
        {
            let mut guard = behavior.lock().await;
            guard.exec_stdout = "remote-ok from ssh exec\n".to_string();
            guard.exec_exit_code = 0;
        }

        let pool = test_pool().await;
        let mut profile_payload = payload("web-ssh-exec");
        profile_payload.auth_method = "password".to_string();
        profile_payload.secret = Some(crate::ssh_test_server::TEST_PASSWORD.to_string());
        profile_payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, profile_payload).await.unwrap();

        let started = start_remote_exec_core(
            &pool,
            StartRemoteExecPayload {
                profile_id: profile.id.clone(),
                script_id: None,
                command: "echo remote-ok".to_string(),
                note: None,
            },
        )
        .await
        .unwrap();
        let exec_id = started["remote_exec_id"].as_str().unwrap().to_string();
        decide_remote_exec_core(&pool, &exec_id, true, None)
            .await
            .unwrap();
        let finalized = finalize_approved_remote_exec_core(None, &pool, &exec_id)
            .await
            .unwrap();

        assert_eq!(finalized["status"], "done");
        assert_eq!(finalized["exitCode"], 0);
        assert!(finalized["output"].as_str().unwrap().contains("remote-ok from ssh exec"));

        let row = sqlx::query(
            "SELECT status, output, exit_code FROM remote_executions WHERE id = ?",
        )
        .bind(&exec_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.try_get::<String, _>(0).unwrap(), "done");
        assert!(row.try_get::<String, _>(1).unwrap().contains("remote-ok"));
        assert_eq!(row.try_get::<Option<i64>, _>(2).unwrap(), Some(0));

        // The host key fingerprint is pinned after the first connection.
        let pinned: Option<String> =
            sqlx::query_scalar("SELECT host_key_fingerprint FROM server_profiles WHERE id = ?")
                .bind(&profile.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(pinned.is_some());
        assert!(pinned.as_deref().unwrap_or_default().starts_with("SHA256:"));
    }

    #[tokio::test]
    async fn remote_exec_rejects_changed_host_key() {
        crate::ssh_test_server::init_master_key();
        let (port, _files, _behavior) = crate::ssh_test_server::spawn().await;
        let pool = test_pool().await;
        let mut profile_payload = payload("web-hostkey");
        profile_payload.auth_method = "password".to_string();
        profile_payload.secret = Some(crate::ssh_test_server::TEST_PASSWORD.to_string());
        profile_payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, profile_payload).await.unwrap();

        // A pinned fingerprint that never matches the test server key.
        sqlx::query("UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?")
            .bind("SHA256:not-the-real-host-key")
            .bind(&profile.id)
            .execute(&pool)
            .await
            .unwrap();

        let started = start_remote_exec_core(
            &pool,
            StartRemoteExecPayload {
                profile_id: profile.id,
                script_id: None,
                command: "echo hi".to_string(),
                note: None,
            },
        )
        .await
        .unwrap();
        let exec_id = started["remote_exec_id"].as_str().unwrap().to_string();
        decide_remote_exec_core(&pool, &exec_id, true, None)
            .await
            .unwrap();
        let finalized = finalize_approved_remote_exec_core(None, &pool, &exec_id)
            .await
            .unwrap();
        assert_eq!(finalized["status"], "failed");

        let row = sqlx::query("SELECT status, exit_code FROM remote_executions WHERE id = ?")
            .bind(&exec_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(row.try_get::<String, _>(0).unwrap(), "failed");
        assert_eq!(
            row.try_get::<Option<i64>, _>(1).unwrap(),
            Some(crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE)
        );
    }

    #[tokio::test]
    async fn connection_test_authenticates_with_stored_secret() {
        crate::ssh_test_server::init_master_key();
        let (port, _files, _behavior) = crate::ssh_test_server::spawn().await;
        let pool = test_pool().await;
        let mut profile_payload = payload("web-connection-auth");
        profile_payload.auth_method = "password".to_string();
        profile_payload.secret = Some(crate::ssh_test_server::TEST_PASSWORD.to_string());
        profile_payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, profile_payload).await.unwrap();

        let result = test_connection_core(&pool, &profile.id).await.unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["authenticated"], true);
        assert!(result["hostKeyFingerprint"].is_string());

        // Wrong password must fail the authenticated probe, not fake success.
        let mut bad_payload = payload("web-connection-bad");
        bad_payload.auth_method = "password".to_string();
        bad_payload.secret = Some("wrong-password".to_string());
        bad_payload.port = Some(port as i64);
        let bad_profile = save_profile_core(&pool, bad_payload).await.unwrap();
        let bad = test_connection_core(&pool, &bad_profile.id).await.unwrap();
        assert_eq!(bad["ok"], false);
        assert_eq!(bad["authenticated"], false);
        assert!(bad["error"].as_str().unwrap().contains("authentication"));
    }

    #[tokio::test]
    async fn transfer_script_uploads_content_over_sftp() {
        crate::ssh_test_server::init_master_key();
        let (port, files, _behavior) = crate::ssh_test_server::spawn().await;
        let pool = test_pool().await;
        let mut profile_payload = payload("web-sftp");
        profile_payload.auth_method = "password".to_string();
        profile_payload.secret = Some(crate::ssh_test_server::TEST_PASSWORD.to_string());
        profile_payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, profile_payload).await.unwrap();

        sqlx::query(
            "INSERT INTO scripts (id, name, filename, content) VALUES (?, ?, ?, ?)",
        )
        .bind("script-sftp-1")
        .bind("deploy.py")
        .bind("deploy.py")
        .bind("print('deployed')")
        .execute(&pool)
        .await
        .unwrap();

        let result = transfer_remote_script_core(
            &pool,
            TransferRemoteScriptPayload {
                profile_id: profile.id.clone(),
                script_id: Some("script-sftp-1".to_string()),
                remote_path: "/tmp/deploy.py".to_string(),
                permissions: Some("755".to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["remote_path"], "/tmp/deploy.py");

        let files = files.lock().await;
        let uploaded = files.get("/tmp/deploy.py").expect("file stored on server");
        assert_eq!(uploaded, b"print('deployed')");
    }

    #[tokio::test]
    async fn transfer_script_rejects_relative_remote_paths() {
        crate::ssh_test_server::init_master_key();
        let pool = test_pool().await;
        let profile = save_profile_core(&pool, payload("web-sftp-bad")).await.unwrap();
        let result = transfer_remote_script_core(
            &pool,
            TransferRemoteScriptPayload {
                profile_id: profile.id,
                script_id: Some("script-1".to_string()),
                remote_path: "relative/path.py".to_string(),
                permissions: None,
            },
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn connection_test_returns_legacy_and_renderer_keys() {
        let pool = test_pool().await;
        let port = spawn_banner_server("SSH-2.0-scriptmanager-test\r\n").await;
        let mut payload = payload("web-connection");
        payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, payload).await.unwrap();
        let result = test_connection_core(&pool, &profile.id).await.unwrap();

        assert_eq!(result["ok"], true);
        assert_eq!(result["success"], true);
        assert!(result.get("latencyMs").is_some());
        assert!(result.get("latency_ms").is_some());
        assert_eq!(result["transport"], "ssh");
        assert!(result["banner"].as_str().unwrap().starts_with("SSH-"));
        assert!(result["message"].as_str().unwrap().contains("127.0.0.1"));
    }

    #[tokio::test]
    async fn connection_test_exchanges_ssh_identification_with_disposable_server() {
        let pool = test_pool().await;
        let (port, client_identification) = spawn_ssh_identification_server().await;
        let mut payload = payload("web-identification");
        payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, payload).await.unwrap();

        let result = test_connection_core(&pool, &profile.id).await.unwrap();
        let client_identification = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            client_identification,
        )
        .await
        .expect("server receives client identification")
        .expect("client identification sent");

        assert_eq!(result["ok"], true);
        assert_eq!(result["banner"], "SSH-2.0-scriptmanager-test");
        assert_eq!(client_identification, "SSH-2.0-ScriptManager_Tauri");
    }

    #[tokio::test]
    async fn connection_test_rejects_non_ssh_services() {
        let pool = test_pool().await;
        let port = spawn_banner_server("HTTP/1.1 200 OK\r\n").await;
        let mut payload = payload("web-non-ssh");
        payload.port = Some(port as i64);
        let profile = save_profile_core(&pool, payload).await.unwrap();

        let result = test_connection_core(&pool, &profile.id).await.unwrap();

        assert_eq!(result["ok"], false);
        assert_eq!(result["success"], false);
        assert_eq!(result["transport"], "ssh");
        assert!(result["error"].as_str().unwrap().contains("not SSH"));
    }

    #[tokio::test]
    async fn audit_records_profile_deletion() {
        let pool = test_pool().await;
        let profile = save_profile_core(&pool, payload("web-2")).await.unwrap();
        delete_profile_core(&pool, &profile.id).await.unwrap();
        let audit = audit_entries(&pool).await.unwrap();
        assert!(audit.iter().any(|e| e["action"] == "server_profile.delete"));
    }

    async fn audit_entries(pool: &SqlitePool) -> Result<Vec<Value>, String> {        let rows = sqlx::query("SELECT id, action, actor, resource, detail, created_at FROM audit_log ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
        rows.into_iter()
            .map(|row| {
                Ok(serde_json::json!({
                    "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
                    "action": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
                    "actor": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
                    "resource": row.try_get::<String, _>(3).map_err(|e| e.to_string())?,
                    "detail": row.try_get::<String, _>(4).map_err(|e| e.to_string())?,
                    "createdAt": row.try_get::<String, _>(5).map_err(|e| e.to_string())?,
                }))
            })
            .collect()
    }
}
