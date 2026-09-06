use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, State};
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
        "SELECT id, name, host, port, username, auth_method, has_secret, key_path, project_id, notes, created_at, updated_at
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

    match payload.id.clone() {
        Some(id) => {
            sqlx::query(
                "UPDATE server_profiles SET name = ?, host = ?, port = ?, username = ?, auth_method = ?, has_secret = ?, key_path = ?, project_id = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(name)
            .bind(payload.host.trim())
            .bind(payload.port.unwrap_or(22))
            .bind(payload.username.trim())
            .bind(&payload.auth_method)
            .bind(payload.has_secret.unwrap_or(false))
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
                "INSERT INTO server_profiles (id, name, host, port, username, auth_method, has_secret, key_path, project_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(name)
            .bind(payload.host.trim())
            .bind(payload.port.unwrap_or(22))
            .bind(payload.username.trim())
            .bind(&payload.auth_method)
            .bind(payload.has_secret.unwrap_or(false))
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

async fn record_audit(
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

pub async fn test_connection_core(pool: &SqlitePool, profile_id: &str) -> Result<Value, String> {
    let row = sqlx::query("SELECT host, port FROM server_profiles WHERE id = ?")
        .bind(profile_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server profile not found".to_string())?;
    let host: String = row.try_get(0).map_err(|e| e.to_string())?;
    let port: i64 = row.try_get(1).map_err(|e| e.to_string())?;

    let started = std::time::Instant::now();
    let result = std::net::TcpStream::connect((host.as_str(), port as u16));
    let latency = started.elapsed().as_millis() as i64;
    record_audit(pool, "server_profile.test_connection", "local-admin", profile_id, &format!("{host}:{port}")).await?;

    match result {
        Ok(_) => Ok(serde_json::json!({
            "ok": true,
            "latencyMs": latency,
            "message": format!("TCP connection to {host}:{port} succeeded in {latency}ms"),
        })),
        Err(e) => Ok(serde_json::json!({
            "ok": false,
            "latencyMs": latency,
            "message": format!("TCP connection to {host}:{port} failed: {e}"),
        })),
    }
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
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM server_profiles WHERE id = ?")
        .bind(&payload.profile_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Server profile not found".to_string());
    }

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

    Ok(serde_json::json!({ "remote_exec_id": id, "status": "pending" }))
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
        "UPDATE remote_executions SET status = ?, approved_by = ?, note = ?, finished_at = ? WHERE id = ?",
    )
    .bind(new_status)
    .bind("local-admin")
    .bind(note.unwrap_or(""))
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

#[tauri::command]
pub async fn approve_remote_execution(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: DecideRemoteExecPayload,
) -> Result<Value, String> {
    let result = decide_remote_exec_core(&pool, &payload.id, true, payload.note.as_deref()).await?;
    emit_decided(&app_handle, &payload.id);
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
    emit_decided(&app_handle, &payload.id);
    Ok(result)
}

fn emit_decided(app_handle: &AppHandle, id: &str) {
    app_handle
        .emit(
            "remote-exec-event",
            serde_json::json!({ "type": "done", "remoteExecId": id, "exitCode": 0 }),
        )
        .ok();
}

#[tauri::command]
pub async fn transfer_remote_script(
    _pool: State<'_, SqlitePool>,
    _payload: Value,
) -> Result<Value, String> {
    Err("SSH file transfer is migration-pending in the Tauri desktop app".to_string())
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
            key_path: None,
            project_id: None,
            notes: Some("test".to_string()),
        }
    }

    #[tokio::test]
    async fn profile_crud_round_trip() {
        let pool = test_pool().await;
        let saved = save_profile_core(&pool, payload("web-1")).await.unwrap();
        assert!(saved.key_path.is_none());
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
                has_secret: Some(true),
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

        delete_profile_core(&pool, &saved.id).await.unwrap();
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
