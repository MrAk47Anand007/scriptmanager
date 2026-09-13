//! Fleet execution: fan one shell command out to many SSH server profiles
//! concurrently (bounded), with per-target status/output and a single human
//! approval covering the batch.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use std::sync::Arc;
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
pub struct StartFleetRunPayload {
    #[serde(rename = "profileIds")]
    pub profile_ids: Vec<String>,
    pub command: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FleetTargetView {
    pub id: String,
    pub profile_id: String,
    pub profile_name: String,
    pub status: String,
    pub exit_code: Option<i64>,
    pub output: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FleetRunView {
    pub id: String,
    pub command: String,
    pub note: Option<String>,
    pub status: String,
    pub total_targets: i64,
    pub succeeded_targets: i64,
    pub failed_targets: i64,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub targets: Vec<FleetTargetView>,
}

async fn load_fleet_run(pool: &SqlitePool, id: &str) -> Result<FleetRunView, String> {
    let run = sqlx::query(
        "SELECT id, command, note, status, total_targets, succeeded_targets, failed_targets,
            created_at, started_at, finished_at FROM fleet_runs WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Fleet run not found".to_string())?;
    let targets = sqlx::query(
        "SELECT id, profile_id, profile_name, status, exit_code, output, started_at, finished_at
         FROM fleet_targets WHERE fleet_run_id = ? ORDER BY profile_name",
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(FleetRunView {
        id: run.try_get(0).map_err(|e| e.to_string())?,
        command: run.try_get(1).map_err(|e| e.to_string())?,
        note: run.try_get(2).map_err(|e| e.to_string())?,
        status: run.try_get(3).map_err(|e| e.to_string())?,
        total_targets: run.try_get(4).map_err(|e| e.to_string())?,
        succeeded_targets: run.try_get(5).map_err(|e| e.to_string())?,
        failed_targets: run.try_get(6).map_err(|e| e.to_string())?,
        created_at: run.try_get(7).map_err(|e| e.to_string())?,
        started_at: run.try_get(8).map_err(|e| e.to_string())?,
        finished_at: run.try_get(9).map_err(|e| e.to_string())?,
        targets: targets
            .iter()
            .map(|target| {
                Ok(FleetTargetView {
                    id: target.try_get(0).map_err(|e| e.to_string())?,
                    profile_id: target.try_get(1).map_err(|e| e.to_string())?,
                    profile_name: target.try_get(2).map_err(|e| e.to_string())?,
                    status: target.try_get(3).map_err(|e| e.to_string())?,
                    exit_code: target.try_get(4).map_err(|e| e.to_string())?,
                    output: target.try_get(5).map_err(|e| e.to_string())?,
                    started_at: target.try_get(6).map_err(|e| e.to_string())?,
                    finished_at: target.try_get(7).map_err(|e| e.to_string())?,
                })
            })
            .collect::<Result<Vec<_>, String>>()?,
    })
}

/// Create a fleet run in the approval gate. One human approval covers the
/// whole batch (same command, same risk).
#[tauri::command]
pub async fn start_fleet_run(
    pool: tauri::State<'_, SqlitePool>,
    payload: StartFleetRunPayload,
) -> Result<FleetRunView, String> {
    start_fleet_run_core(&pool, payload).await
}

pub(crate) async fn start_fleet_run_core(
    pool: &SqlitePool,
    payload: StartFleetRunPayload,
) -> Result<FleetRunView, String> {
    if payload.command.trim().is_empty() {
        return Err("Command is required".to_string());
    }
    let mut profile_ids: Vec<String> = Vec::new();
    for id in &payload.profile_ids {
        let id = id.trim();
        if id.is_empty() || profile_ids.contains(&id.to_string()) {
            continue;
        }
        let exists: Option<String> = sqlx::query_scalar("SELECT id FROM server_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
        if exists.is_none() {
            return Err(format!("Server profile not found: {id}"));
        }
        profile_ids.push(id.to_string());
    }
    if profile_ids.is_empty() {
        return Err("Select at least one server profile".to_string());
    }
    if profile_ids.len() > 50 {
        return Err("Fleet runs are capped at 50 targets".to_string());
    }

    let fleet_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO fleet_runs (id, command, note, status, total_targets) VALUES (?, ?, ?, 'pending_approval', ?)",
    )
    .bind(&fleet_id)
    .bind(payload.command.trim())
    .bind(payload.note.as_deref())
    .bind(profile_ids.len() as i64)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    for profile_id in &profile_ids {
        let name: Option<String> = sqlx::query_scalar("SELECT name FROM server_profiles WHERE id = ?")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
        sqlx::query(
            "INSERT INTO fleet_targets (id, fleet_run_id, profile_id, profile_name) VALUES (?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&fleet_id)
        .bind(profile_id)
        .bind(name.unwrap_or_else(|| profile_id.clone()))
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    crate::remote_exec::record_audit(
        pool,
        "fleet.start",
        "local-admin",
        &fleet_id,
        &format!("{} targets", profile_ids.len()),
    )
    .await?;
    load_fleet_run(pool, &fleet_id).await
}

/// Approve and immediately fan the command out to every target with bounded
/// concurrency. Streams per-target output via remote-exec-event with
/// fleetRunId/targetId fields.
#[tauri::command]
pub async fn approve_fleet_run(
    app_handle: AppHandle,
    pool: tauri::State<'_, SqlitePool>,
    fleet_run_id: String,
) -> Result<FleetRunView, String> {
    approve_fleet_run_core(Some(&app_handle), &pool, &fleet_run_id).await
}

pub(crate) async fn approve_fleet_run_core(
    app_handle: Option<&AppHandle>,
    pool: &SqlitePool,
    fleet_run_id: &str,
) -> Result<FleetRunView, String> {
    let status: String = sqlx::query_scalar("SELECT status FROM fleet_runs WHERE id = ?")
        .bind(fleet_run_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Fleet run not found".to_string())?;
    if status != "pending_approval" {
        return Err("Fleet run has already been dispatched".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE fleet_runs SET status = 'running', started_at = ? WHERE id = ?")
        .bind(&now)
        .bind(fleet_run_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    crate::remote_exec::record_audit(pool, "fleet.approve", "local-admin", fleet_run_id, "fan-out").await?;

    let targets: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, profile_id, profile_name FROM fleet_targets WHERE fleet_run_id = ? ORDER BY profile_name",
    )
    .bind(fleet_run_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let semaphore = Arc::new(tokio::sync::Semaphore::new(4));
    let mut joins = Vec::with_capacity(targets.len());
    for (target_id, profile_id, profile_name) in targets {
        let pool = pool.clone();
        let handle = app_handle.map(|h| h.clone());
        let fleet_id = fleet_run_id.to_string();
        let permit = Arc::clone(&semaphore);
        joins.push(tauri::async_runtime::spawn(async move {
            let _permit = permit.acquire().await;
            run_fleet_target(&pool, handle.as_ref(), &fleet_id, &target_id, &profile_id, &profile_name).await;
        }));
    }
    for join in joins {
        let _ = join.await;
    }

    let (succeeded, failed): (i64, i64) = sqlx::query_as(
        "SELECT
            COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
         FROM fleet_targets WHERE fleet_run_id = ?",
    )
    .bind(fleet_run_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let final_status = if failed == 0 {
        "done"
    } else if succeeded == 0 {
        "failed"
    } else {
        "partial"
    };
    sqlx::query(
        "UPDATE fleet_runs SET status = ?, succeeded_targets = ?, failed_targets = ?, finished_at = ? WHERE id = ?",
    )
    .bind(final_status)
    .bind(succeeded)
    .bind(failed)
    .bind(chrono::Utc::now().to_rfc3339())
    .bind(fleet_run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    crate::remote_exec::record_audit(
        pool,
        "fleet.execute",
        "local-admin",
        fleet_run_id,
        &format!("{succeeded} ok, {failed} failed"),
    )
    .await?;
    load_fleet_run(pool, fleet_run_id).await
}

async fn run_fleet_target(
    pool: &SqlitePool,
    app_handle: Option<&AppHandle>,
    fleet_run_id: &str,
    target_id: &str,
    profile_id: &str,
    profile_name: &str,
) {
    let command: String = sqlx::query_scalar("SELECT command FROM fleet_runs WHERE id = ?")
        .bind(fleet_run_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    let started = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE fleet_targets SET status = 'running', started_at = ? WHERE id = ?")
        .bind(&started)
        .bind(target_id)
        .execute(pool)
        .await
        .ok();

    let emit = |event: Value| {
        let mut event = event;
        if let Some(object) = event.as_object_mut() {
            object.insert("fleetRunId".to_string(), json!(fleet_run_id));
            object.insert("targetId".to_string(), json!(target_id));
            object.insert("targetName".to_string(), json!(profile_name));
        }
        crate::remote_exec::emit_remote_exec_event(app_handle, event);
    };

    let run = async {
        let connection = crate::ssh_transport::load_profile_connection(pool, profile_id).await?;
        let mut session = crate::ssh_transport::SshSession::connect(&connection).await?;
        if let Some(fingerprint) = &session.host_key_fingerprint {
            let _ = sqlx::query("UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?")
                .bind(fingerprint)
                .bind(profile_id)
                .execute(pool)
                .await;
        }
        let mut collected: Vec<String> = Vec::new();
        let stream_handle = app_handle.map(|h| h.clone());
        let fleet = fleet_run_id.to_string();
        let target = target_id.to_string();
        let result = session
            .run_command(
                &command,
                crate::ssh_transport::SSH_COMMAND_TIMEOUT_SECS,
                |line, is_stderr| {
                    let text = if is_stderr {
                        format!("[stderr] {line}")
                    } else {
                        line.to_string()
                    };
                    collected.push(text.clone());
                    crate::remote_exec::emit_remote_exec_event(
                        stream_handle.as_ref(),
                        json!({ "type": "line", "remoteExecId": target, "line": text, "fleetRunId": fleet, "targetId": target }),
                    );
                },
            )
            .await;
        session.disconnect().await;
        result.map(|exit_code| (exit_code, collected.join("\n")))
    };

    match run.await {
        Ok((exit_code, output)) => {
            let final_status = if exit_code == 0 { "succeeded" } else { "failed" };
            sqlx::query(
                "UPDATE fleet_targets SET status = ?, exit_code = ?, output = ?, finished_at = ? WHERE id = ?",
            )
            .bind(final_status)
            .bind(exit_code)
            .bind(&output)
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(target_id)
            .execute(pool)
            .await
            .ok();
            emit(json!({
                "type": if exit_code == 0 { "done" } else { "error" },
                "remoteExecId": target_id,
                "exitCode": exit_code,
            }));
        }
        Err(error) => {
            sqlx::query(
                "UPDATE fleet_targets SET status = 'failed', exit_code = ?, output = ?, finished_at = ? WHERE id = ?",
            )
            .bind(crate::ssh_transport::SSH_TRANSPORT_EXIT_CODE)
            .bind(&error)
            .bind(chrono::Utc::now().to_rfc3339())
            .bind(target_id)
            .execute(pool)
            .await
            .ok();
            emit(json!({ "type": "error", "remoteExecId": target_id, "message": error }));
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ListFleetRunsPayload {
    #[serde(default = "default_fleet_limit")]
    pub limit: i64,
}

fn default_fleet_limit() -> i64 {
    20
}

#[tauri::command]
pub async fn list_fleet_runs(
    pool: tauri::State<'_, SqlitePool>,
    payload: ListFleetRunsPayload,
) -> Result<Vec<FleetRunView>, String> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM fleet_runs ORDER BY created_at DESC LIMIT ?")
        .bind(payload.limit.clamp(1, 100))
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut runs = Vec::with_capacity(ids.len());
    for id in ids {
        runs.push(load_fleet_run(&pool, &id).await?);
    }
    Ok(runs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::test_pool;

    #[tokio::test]
    async fn fleet_start_validates_command_and_profiles() {
        let pool = test_pool().await;

        let no_command = start_fleet_run_core(
            &pool,
            StartFleetRunPayload { profile_ids: vec!["p1".to_string()], command: "   ".to_string(), note: None },
        )
        .await;
        assert!(no_command.is_err());

        let missing = start_fleet_run_core(
            &pool,
            StartFleetRunPayload {
                profile_ids: vec!["ghost".to_string()],
                command: "uptime".to_string(),
                note: None,
            },
        )
        .await;
        assert!(missing.is_err());
        assert!(missing.unwrap_err().contains("not found"));

        let no_profiles = start_fleet_run_core(
            &pool,
            StartFleetRunPayload { profile_ids: Vec::new(), command: "uptime".to_string(), note: None },
        )
        .await;
        assert!(no_profiles.is_err());

        // A valid gate creates pending rows for both targets.
        sqlx::query(
            "INSERT INTO server_profiles (id, name, host, username, auth_method) VALUES ('p1', 'one', 'h', 'u', 'password'), ('p2', 'two', 'h', 'u', 'password')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let run = start_fleet_run_core(
            &pool,
            StartFleetRunPayload {
                profile_ids: vec!["p1".to_string(), "p2".to_string()],
                command: "uptime".to_string(),
                note: Some("nightly".to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(run.status, "pending_approval");
        assert_eq!(run.total_targets, 2);
        assert_eq!(run.targets.len(), 2);
        assert!(run.targets.iter().all(|target| target.status == "pending"));

        // Duplicate / blank ids collapse: same two targets again.
        let run2 = start_fleet_run_core(
            &pool,
            StartFleetRunPayload {
                profile_ids: vec!["p1".to_string(), " p1 ".to_string(), "p2".to_string()],
                command: "uptime".to_string(),
                note: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(run2.total_targets, 2);
    }

    #[tokio::test]
    async fn fleet_approve_is_single_dispatch() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO server_profiles (id, name, host, username, auth_method) VALUES ('p1', 'one', 'h', 'u', 'password')")
            .execute(&pool)
            .await
            .unwrap();
        let run = start_fleet_run_core(
            &pool,
            StartFleetRunPayload { profile_ids: vec!["p1".to_string()], command: "uptime".to_string(), note: None },
        )
        .await
        .unwrap();

        // Approving without any reachable SSH host fails the target but the
        // run completes its aggregation.
        let result = approve_fleet_run_core(None, &pool, &run.id).await.unwrap();
        assert_eq!(result.status, "failed");
        assert_eq!(result.failed_targets, 1);

        // A second approve is rejected (single dispatch).
        let again = approve_fleet_run_core(None, &pool, &run.id).await;
        assert!(again.is_err());
        assert!(again.unwrap_err().contains("already"));
    }
}
