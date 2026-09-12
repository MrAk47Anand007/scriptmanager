use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, LazyLock, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;

/// Agent support decision (recorded in the migration completion plan, S9.1):
/// profiles and run history are fully persisted. Codex and Claude launch use
/// fixed, allowlisted non-interactive CLI shapes executed with argument
/// arrays. Runs execute in background tasks tracked by a live session
/// registry so interrupt/terminate can target the running provider process.
/// Discovery only ever checks a fixed allowlist of executable names, never
/// renderer-supplied commands.

const ALLOWED_PROVIDERS: [&str; 2] = ["codex", "claude"];

/// Long stdout/stderr chunks are stored truncated so a chatty provider
/// session cannot flood the SQLite row or the renderer.
const MAX_MESSAGE_CHARS: usize = 8000;

#[derive(Debug, Clone)]
struct ProviderProcessResult {
    stdout: Vec<String>,
    stderr: Vec<String>,
    exit_code: Option<i32>,
    killed_status: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentProfileView {
    pub id: String,
    pub name: String,
    pub provider: String,
    #[serde(rename = "accessLevel")]
    pub access_level: String,
    #[serde(rename = "projectId")]
    pub project_id: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AgentRunView {
    pub id: String,
    #[serde(rename = "profileId")]
    pub profile_id: String,
    pub status: String,
    pub provider: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct AgentRunDetailView {
    #[serde(flatten)]
    pub run: AgentRunView,
    pub messages: Vec<Value>,
    pub artifacts: Vec<Value>,
    #[serde(rename = "usageJson")]
    pub usage_json: Option<String>,
}

pub async fn list_profiles_core(pool: &SqlitePool) -> Result<Vec<AgentProfileView>, String> {
    let rows = sqlx::query(
        "SELECT id, name, provider, access_level, project_id, model FROM agent_profiles ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(AgentProfileView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                provider: row.try_get(2).map_err(|e| e.to_string())?,
                access_level: row.try_get(3).map_err(|e| e.to_string())?,
                project_id: row.try_get(4).map_err(|e| e.to_string())?,
                model: row.try_get(5).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_agent_profiles(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AgentProfileView>, String> {
    list_profiles_core(&pool).await
}

#[derive(Debug, Deserialize)]
pub struct CreateAgentProfilePayload {
    pub name: String,
    pub provider: String,
    #[serde(rename = "accessLevel", alias = "access_level")]
    pub access_level: String,
    #[serde(rename = "projectId", alias = "project_id")]
    pub project_id: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RunAgentPayload {
    #[serde(rename = "profileId", alias = "profile_id")]
    pub profile_id: String,
    pub prompt: String,
    pub cwd: String,
}

#[derive(Debug, Deserialize)]
pub struct ResumeAgentPayload {
    #[serde(rename = "runId", alias = "run_id")]
    pub run_id: String,
    pub prompt: Option<String>,
}

const ACCESS_LEVELS: [&str; 3] = ["observe", "develop", "full"];

pub async fn create_profile_core(
    pool: &SqlitePool,
    payload: CreateAgentProfilePayload,
) -> Result<AgentProfileView, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Profile name is required".to_string());
    }
    if !ALLOWED_PROVIDERS.contains(&payload.provider.as_str()) {
        return Err(format!("Unsupported agent provider: {}", payload.provider));
    }
    if !ACCESS_LEVELS.contains(&payload.access_level.as_str()) {
        return Err(format!("Unknown access level: {}", payload.access_level));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO agent_profiles (id, name, provider, access_level, project_id, model) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(name)
    .bind(&payload.provider)
    .bind(&payload.access_level)
    .bind(payload.project_id.as_deref().filter(|p| !p.is_empty()))
    .bind(payload.model.as_deref().filter(|m| !m.is_empty()))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    list_profiles_core(pool)
        .await?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Profile creation failed".to_string())
}

#[tauri::command]
pub async fn create_agent_profile(
    pool: State<'_, SqlitePool>,
    payload: CreateAgentProfilePayload,
) -> Result<AgentProfileView, String> {
    create_profile_core(&pool, payload).await
}

pub async fn list_runs_core(pool: &SqlitePool) -> Result<Vec<AgentRunView>, String> {
    let rows = sqlx::query(
        "SELECT r.id, r.profile_id, r.status, r.provider, r.created_at FROM agent_runs r ORDER BY r.created_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(AgentRunView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                profile_id: row.try_get(1).map_err(|e| e.to_string())?,
                status: row.try_get(2).map_err(|e| e.to_string())?,
                provider: row.try_get(3).map_err(|e| e.to_string())?,
                created_at: row.try_get(4).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_agent_runs(pool: State<'_, SqlitePool>) -> Result<Vec<AgentRunView>, String> {
    list_runs_core(&pool).await
}

pub async fn read_run_core(pool: &SqlitePool, id: &str) -> Result<Option<AgentRunDetailView>, String> {
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM agent_runs WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Ok(None);
    }

    let run_row = sqlx::query("SELECT profile_id, status, provider, created_at FROM agent_runs WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let run = AgentRunView {
        id: id.to_string(),
        profile_id: run_row.try_get(0).map_err(|e| e.to_string())?,
        status: run_row.try_get(1).map_err(|e| e.to_string())?,
        provider: run_row.try_get(2).map_err(|e| e.to_string())?,
        created_at: run_row.try_get(3).map_err(|e| e.to_string())?,
    };

    let messages = sqlx::query("SELECT COALESCE(payload_json, '{}') FROM agent_run_messages WHERE run_id = ? ORDER BY created_at")
        .bind(id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .filter_map(|row| row.try_get::<String, _>(0).ok())
        .filter_map(|raw| serde_json::from_str::<Value>(&raw).ok())
        .collect();

    let artifacts = sqlx::query("SELECT COALESCE(payload_json, '{}') FROM agent_run_artifacts WHERE run_id = ? ORDER BY created_at")
        .bind(id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .filter_map(|row| row.try_get::<String, _>(0).ok())
        .filter_map(|raw| serde_json::from_str::<Value>(&raw).ok())
        .collect();

    Ok(Some(AgentRunDetailView {
        run,
        messages,
        artifacts,
        usage_json: None,
    }))
}

async fn insert_agent_message(
    pool: &SqlitePool,
    run_id: &str,
    role: &str,
    content: &str,
    payload: Value,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO agent_run_messages (id, run_id, role, content, payload_json) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(run_id)
    .bind(role)
    .bind(content)
    .bind(payload.to_string())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn provider_process_args(provider: &str, prompt: &str, cwd: &str) -> Result<Vec<String>, String> {
    match provider {
        "codex" => Ok(vec![
            "exec".to_string(),
            "--json".to_string(),
            "--ephemeral".to_string(),
            "--skip-git-repo-check".to_string(),
            "--cd".to_string(),
            cwd.to_string(),
            prompt.to_string(),
        ]),
        // Claude Code non-interactive print mode: fixed identity, argument
        // array, no interactive prompt surface.
        "claude" => Ok(vec![
            "-p".to_string(),
            prompt.to_string(),
            "--output-format".to_string(),
            "json".to_string(),
        ]),
        other => Err(format!("Unsupported agent provider: {other}")),
    }
}

/// A running provider process tracked so interrupt/terminate can reach it.
#[derive(Clone)]
pub struct LiveSessionHandle {
    child: Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>,
    /// Terminal status to persist when the process dies because of a control
    /// request ("interrupted" or "terminated").
    status_on_kill: Arc<Mutex<String>>,
}

static LIVE_SESSIONS: LazyLock<Mutex<HashMap<String, LiveSessionHandle>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn register_live_session(run_id: &str, handle: LiveSessionHandle) {
    LIVE_SESSIONS
        .lock()
        .expect("live session registry lock")
        .insert(run_id.to_string(), handle);
}

fn unregister_live_session(run_id: &str) {
    LIVE_SESSIONS
        .lock()
        .expect("live session registry lock")
        .remove(run_id);
}

fn live_session(run_id: &str) -> Option<LiveSessionHandle> {
    LIVE_SESSIONS
        .lock()
        .expect("live session registry lock")
        .get(run_id)
        .cloned()
}

fn live_session_active(run_id: &str) -> bool {
    LIVE_SESSIONS
        .lock()
        .expect("live session registry lock")
        .contains_key(run_id)
}

/// Best-effort cleanup on unexpected drop paths: any run still registered
/// when a new run for the same id appears is stale.
fn truncate_for_storage(line: &str) -> String {
    if line.chars().count() <= MAX_MESSAGE_CHARS {
        return line.to_string();
    }
    let truncated: String = line.chars().take(MAX_MESSAGE_CHARS).collect();
    format!("{truncated}\n… [truncated by ScriptManager]")
}

/// Spawn the provider process with piped streams and register it as a live
/// session. Streams are taken before the child moves behind the mutex so
/// the monitor task can read them concurrently.
async fn spawn_provider_process(
    provider: &str,
    prompt: &str,
    cwd: &str,
    run_id: &str,
) -> Result<(LiveSessionHandle, LiveSessionStreams), String> {
    let executable = discover_provider_on_path(provider)
        .ok_or_else(|| format!("'{provider}' executable not found on PATH"))?;
    let args = provider_process_args(provider, prompt, cwd)?;
    let mut command = tokio::process::Command::new(&executable);
    command
        .args(&args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch {provider} provider process: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Provider process stdout unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Provider process stderr unavailable".to_string())?;

    let handle = LiveSessionHandle {
        child: Arc::new(tokio::sync::Mutex::new(Some(child))),
        status_on_kill: Arc::new(Mutex::new("terminated".to_string())),
    };
    register_live_session(run_id, handle.clone());
    Ok((
        handle,
        LiveSessionStreams { stdout, stderr },
    ))
}

pub struct LiveSessionStreams {
    stdout: tokio::process::ChildStdout,
    stderr: tokio::process::ChildStderr,
}

/// Drive one provider session to completion: stream stdout/stderr lines to
/// the renderer and collectors, wait for exit, then persist the final run
/// state. Runs as a background task in production; tests await it directly.
pub async fn run_provider_monitor(
    app_handle: Option<AppHandle>,
    pool: SqlitePool,
    run_id: String,
    handle: LiveSessionHandle,
    streams: LiveSessionStreams,
) -> Result<String, String> {
    let LiveSessionStreams { stdout, stderr, .. } = streams;
    let collected: Arc<Mutex<ProviderProcessResult>> = Arc::new(Mutex::new(ProviderProcessResult {
        stdout: Vec::new(),
        stderr: Vec::new(),
        exit_code: None,
        killed_status: None,
    }));

    let stdout_task = stream_lines_to_collector(
        BufReader::new(stdout).lines(),
        Arc::clone(&collected),
        app_handle.clone(),
        run_id.clone(),
        "assistant",
    );
    let stderr_task = stream_lines_to_collector(
        BufReader::new(stderr).lines(),
        Arc::clone(&collected),
        app_handle.clone(),
        run_id.clone(),
        "system",
    );

    let exit_code = {
        let mut guard = handle.child.lock().await;
        match guard.as_mut() {
            Some(child) => child.wait().await.map_err(|e| e.to_string())?.code(),
            None => None,
        }
    };
    let _ = tokio::join!(stdout_task, stderr_task);

    let mut result = collected.lock().expect("provider result lock").clone();
    result.exit_code = exit_code;
    result.killed_status = Some(
        handle
            .status_on_kill
            .lock()
            .expect("status on kill lock")
            .clone(),
    );

    unregister_live_session(&run_id);
    let status = persist_provider_process_result(&pool, &run_id, result).await?;
    emit_agent_terminal_event(&app_handle, &pool, &run_id, &status).await;
    Ok(status)
}

async fn stream_lines_to_collector(
    mut lines: tokio::io::Lines<tokio::io::BufReader<impl tokio::io::AsyncRead + Unpin>>,
    collected: Arc<Mutex<ProviderProcessResult>>,
    app_handle: Option<AppHandle>,
    run_id: String,
    role: &'static str,
) {
    let stream_name = if role == "assistant" { "stdout" } else { "stderr" };
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                {
                    let mut result = collected.lock().expect("provider result lock");
                    if role == "assistant" {
                        result.stdout.push(line.clone());
                    } else {
                        result.stderr.push(line.clone());
                    }
                }
                // The renderer only keys on sessionId; the payload documents
                // what changed so history refreshes stay truthful.
                if let Some(handle) = &app_handle {
                    handle
                        .emit(
                            "agent-event",
                            serde_json::json!({
                                "sessionId": run_id,
                                "event": {
                                    "type": "message",
                                    "role": role,
                                    "stream": stream_name,
                                    "content": truncate_for_storage(&line),
                                }
                            }),
                        )
                        .ok();
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
}

async fn emit_agent_terminal_event(
    app_handle: &Option<AppHandle>,
    pool: &SqlitePool,
    run_id: &str,
    status: &str,
) {
    let Some(handle) = app_handle else {
        return;
    };
    let message = read_run_core(pool, run_id)
        .await
        .ok()
        .flatten()
        .and_then(|detail| detail.messages.last().cloned())
        .and_then(|message| {
            message
                .get("content")
                .and_then(|content| content.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("Agent run {status}"));
    handle
        .emit(
            "agent-event",
            serde_json::json!({
                "sessionId": run_id,
                "event": {
                    "type": if status == "succeeded" { "state" } else { "error" },
                    "state": status,
                    "message": message,
                }
            }),
        )
        .ok();
}

async fn persist_provider_process_result(
    pool: &SqlitePool,
    run_id: &str,
    result: ProviderProcessResult,
) -> Result<String, String> {
    let status = if let Some(killed) = &result.killed_status {
        killed.clone()
    } else if result.exit_code == Some(0) {
        "succeeded".to_string()
    } else {
        "failed".to_string()
    };

    for line in &result.stdout {
        if line.trim().is_empty() {
            continue;
        }
        let mut payload = serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "role": "assistant",
            "content": truncate_for_storage(line),
            "stream": "stdout",
            "exitCode": result.exit_code,
        });
        // Codex --json and Claude --output-format json emit JSONL events;
        // keep the parsed event alongside the raw line.
        if let Ok(event) = serde_json::from_str::<Value>(line) {
            payload["event"] = event;
        }
        insert_agent_message(pool, run_id, "assistant", &truncate_for_storage(line), payload).await?;
    }

    let stderr_text = result.stderr.join("\n");
    if !stderr_text.trim().is_empty() || (status == "failed" && result.killed_status.is_none()) {
        let content = if stderr_text.trim().is_empty() {
            format!(
                "Agent provider process exited with {:?}",
                result.exit_code
            )
        } else {
            truncate_for_storage(stderr_text.trim())
        };
        insert_agent_message(
            pool,
            run_id,
            "system",
            &content,
            serde_json::json!({
                "id": Uuid::new_v4().to_string(),
                "role": "system",
                "content": content,
                "stream": "stderr",
                "status": status,
                "exitCode": result.exit_code,
            }),
        )
        .await?;
    }
    if let Some(killed) = &result.killed_status {
        let content = format!("Agent run {killed} by user control request.");
        insert_agent_message(
            pool,
            run_id,
            "system",
            &content,
            serde_json::json!({
                "id": Uuid::new_v4().to_string(),
                "role": "system",
                "content": content,
                "action": if killed == "interrupted" { "interrupt" } else { "terminate" },
                "status": killed,
            }),
        )
        .await?;
    }
    sqlx::query("UPDATE agent_runs SET status = ? WHERE id = ?")
        .bind(&status)
        .bind(run_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(status)
}

pub async fn run_agent_core(
    app_handle: Option<&AppHandle>,
    pool: &SqlitePool,
    payload: RunAgentPayload,
) -> Result<AgentRunView, String> {
    if payload.prompt.trim().is_empty() {
        return Err("Agent prompt is required".to_string());
    }
    if payload.cwd.trim().is_empty() {
        return Err("Agent working directory is required".to_string());
    }

    let profile = sqlx::query("SELECT provider FROM agent_profiles WHERE id = ?")
        .bind(&payload.profile_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent profile not found".to_string())?;
    let provider: String = profile.try_get(0).map_err(|e| e.to_string())?;
    if !ALLOWED_PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unsupported agent provider: {}", provider));
    }

    let run_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO agent_runs (id, profile_id, status, provider) VALUES (?, ?, 'running', ?)",
    )
    .bind(&run_id)
    .bind(&payload.profile_id)
    .bind(&provider)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    insert_agent_message(
        pool,
        &run_id,
        "user",
        payload.prompt.trim(),
        serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "role": "user",
            "content": payload.prompt.trim(),
            "cwd": payload.cwd.trim(),
        }),
    )
    .await?;

    match spawn_provider_process(&provider, payload.prompt.trim(), payload.cwd.trim(), &run_id)
        .await
    {
        Ok((handle, streams)) => {
            // The run continues in the background; the renderer follows it
            // through `agent-event` refreshes.
            if let Some(handle_app) = app_handle {
                let pool_for_task = pool.clone();
                let app = handle_app.clone();
                let run_for_task = run_id.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = run_provider_monitor(
                        Some(app),
                        pool_for_task,
                        run_for_task,
                        handle,
                        streams,
                    )
                    .await;
                });
            } else {
                let pool_for_task = pool.clone();
                let run_for_task = run_id.clone();
                tauri::async_runtime::spawn(async move {
                    let _ =
                        run_provider_monitor(None, pool_for_task, run_for_task, handle, streams)
                            .await;
                });
            }
        }
        Err(error) => {
            sqlx::query("UPDATE agent_runs SET status = 'failed' WHERE id = ?")
                .bind(&run_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            let migration_pending = provider != "codex" && provider != "claude";
            insert_agent_message(
                pool,
                &run_id,
                "system",
                &error,
                serde_json::json!({
                    "id": Uuid::new_v4().to_string(),
                    "role": "system",
                    "content": error,
                    "status": "failed",
                    "migrationPending": migration_pending,
                }),
            )
            .await?;
        }
    }

    list_runs_core(pool)
        .await?
        .into_iter()
        .find(|run| run.id == run_id)
        .ok_or_else(|| "Agent run creation failed".to_string())
}

async fn record_pending_control_core(
    pool: &SqlitePool,
    run_id: &str,
    action: &str,
    prompt: Option<&str>,
) -> Result<Value, String> {
    let run = read_run_core(pool, run_id)
        .await?
        .ok_or_else(|| "Agent run not found".to_string())?;
    let message = format!(
        "Agent {action} is migration-pending in the Tauri desktop app (ACP process control not ported)."
    );

    if let Some(prompt) = prompt.map(str::trim).filter(|prompt| !prompt.is_empty()) {
        insert_agent_message(
            pool,
            run_id,
            "user",
            prompt,
            serde_json::json!({
                "id": Uuid::new_v4().to_string(),
                "role": "user",
                "content": prompt,
                "resumeAttempt": true,
            }),
        )
        .await?;
    }

    insert_agent_message(
        pool,
        run_id,
        "system",
        &message,
        serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "role": "system",
            "content": message,
            "action": action,
            "status": run.run.status,
            "migrationPending": true,
        }),
    )
    .await?;

    Ok(serde_json::json!({
        "runId": run_id,
        "status": run.run.status,
        "action": action,
        "migrationPending": true,
        "message": message,
    }))
}

#[tauri::command]
pub async fn read_agent_run(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<Option<AgentRunDetailView>, String> {
    read_run_core(&pool, &id).await
}

/// Discovery uses only the fixed provider allowlist; it checks whether the
/// provider executable is on PATH and never launches anything.
pub fn discover_provider_on_path(provider: &str) -> Option<String> {
    if !ALLOWED_PROVIDERS.contains(&provider) {
        return None;
    }
    let path_env = std::env::var("PATH").unwrap_or_default();
    let extensions: Vec<String> = if cfg!(target_os = "windows") {
        vec![".exe".to_string(), ".cmd".to_string(), String::new()]
    } else {
        vec!["".to_string()]
    };
    for dir in std::env::split_paths(&path_env) {
        for ext in &extensions {
            let candidate = dir.join(format!("{provider}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

#[tauri::command]
pub async fn discover_agent_providers() -> Result<Vec<Value>, String> {
    Ok(ALLOWED_PROVIDERS
        .iter()
        .map(|provider| match discover_provider_on_path(provider) {
            Some(executable) => serde_json::json!({
                "provider": provider,
                "available": true,
                "executable": executable,
            }),
            None => serde_json::json!({
                "provider": provider,
                "available": false,
                "error": format!("'{provider}' executable not found on PATH"),
            }),
        })
        .collect())
}

#[tauri::command]
pub async fn run_agent(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: RunAgentPayload,
) -> Result<AgentRunView, String> {
    let run = run_agent_core(Some(&app_handle), &pool, payload).await?;
    Ok(run)
}

/// Attempt a control action against a live provider process. Returns None
/// when the run has no live session (already finished or launch failed).
async fn control_live_session(run_id: &str, action: &str) -> Option<Value> {
    let handle = live_session(run_id)?;
    let status = match action {
        "interrupt" => "interrupted",
        _ => "terminated",
    };
    *handle
        .status_on_kill
        .lock()
        .expect("status on kill lock") = status.to_string();

    let mut guard = handle.child.lock().await;
    if let Some(child) = guard.as_mut() {
        let _ = child.start_kill();
    }
    drop(guard);

    Some(serde_json::json!({
        "runId": run_id,
        "status": "running",
        "action": action,
        "requested": true,
        "message": format!("Agent {action} request sent to the running provider process."),
    }))
}

#[tauri::command]
pub async fn interrupt_agent_run(pool: State<'_, SqlitePool>, id: String) -> Result<Value, String> {
    if let Some(result) = control_live_session(&id, "interrupt").await {
        return Ok(result);
    }
    record_pending_control_core(&pool, &id, "interrupt", None).await
}

#[tauri::command]
pub async fn resume_agent_run(
    pool: State<'_, SqlitePool>,
    payload: ResumeAgentPayload,
) -> Result<Value, String> {
    record_pending_control_core(&pool, &payload.run_id, "resume", payload.prompt.as_deref()).await
}

#[tauri::command]
pub async fn terminate_agent_run(pool: State<'_, SqlitePool>, id: String) -> Result<Value, String> {
    if let Some(result) = control_live_session(&id, "terminate").await {
        return Ok(result);
    }
    record_pending_control_core(&pool, &id, "terminate", None).await
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
    async fn profile_create_and_validation() {
        let pool = test_pool().await;
        let profile = create_profile_core(
            &pool,
            CreateAgentProfilePayload {
                name: "Refactor bot".into(),
                provider: "codex".into(),
                access_level: "develop".into(),
                project_id: None,
                model: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(profile.access_level, "develop");

        assert!(create_profile_core(
            &pool,
            CreateAgentProfilePayload {
                name: "Bad".into(),
                provider: "arbitrary-binary".into(),
                access_level: "observe".into(),
                project_id: None,
                model: None,
            },
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn run_history_round_trip_and_detail() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO agent_profiles (id, name, provider, access_level) VALUES ('p-1', 'Test', 'codex', 'observe')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_runs (id, profile_id, status, provider) VALUES ('r-1', 'p-1', 'failed', 'codex')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_run_messages (id, run_id, role, content, payload_json) VALUES ('m-1', 'r-1', 'user', 'hi', '{\"id\":\"m-1\",\"role\":\"user\",\"content\":\"hi\"}')")
            .execute(&pool)
            .await
            .unwrap();

        let runs = list_runs_core(&pool).await.unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "failed");

        let detail = read_run_core(&pool, "r-1").await.unwrap().unwrap();
        assert_eq!(detail.messages.len(), 1);
        assert!(read_run_core(&pool, "missing").await.unwrap().is_none());
    }

    #[test]
    fn discovery_ignores_unknown_providers() {
        assert!(discover_provider_on_path("arbitrary-binary").is_none());
    }

    #[tokio::test]
    async fn run_agent_records_provider_spawn_failure_run() {
        let pool = test_pool().await;
        let profile = create_profile_core(
            &pool,
            CreateAgentProfilePayload {
                name: "Claude".into(),
                provider: "claude".into(),
                access_level: "observe".into(),
                project_id: None,
                model: None,
            },
        )
        .await
        .unwrap();

        // The provider launch fails in a controlled way (CLI missing from
        // PATH or cwd does not exist) and the failure is durably recorded.
        let run = run_agent_core(
            None,
            &pool,
            RunAgentPayload {
                profile_id: profile.id.clone(),
                prompt: "inspect".into(),
                cwd: "C:/workspace".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(run.profile_id, profile.id);
        assert_eq!(run.status, "failed");
        assert_eq!(run.provider, "claude");

        let detail = read_run_core(&pool, &run.id).await.unwrap().unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0]["role"], "user");
        assert_eq!(detail.messages[1]["role"], "system");
        assert_eq!(detail.messages[1]["status"], "failed");
        assert!(!detail.messages[1]["content"].as_str().unwrap().is_empty());
    }

    #[tokio::test]
    async fn codex_provider_result_persists_stdout_stderr_and_status() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO agent_profiles (id, name, provider, access_level) VALUES ('p-1', 'Codex', 'codex', 'observe')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_runs (id, profile_id, status, provider) VALUES ('r-1', 'p-1', 'running', 'codex')")
            .execute(&pool)
            .await
            .unwrap();

        let status = persist_provider_process_result(
            &pool,
            "r-1",
            ProviderProcessResult {
                stdout: vec![
                    "{\"type\":\"item.completed\"}".to_string(),
                    String::new(),
                    "plain output".to_string(),
                ],
                stderr: vec![],
                exit_code: Some(0),
                killed_status: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(status, "succeeded");

        let detail = read_run_core(&pool, "r-1").await.unwrap().unwrap();
        // Empty stdout lines are skipped; JSONL lines keep their parsed event.
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[0]["stream"], "stdout");
        assert_eq!(detail.messages[0]["exitCode"], 0);
        assert_eq!(detail.messages[0]["event"]["type"], "item.completed");
        assert_eq!(detail.messages[1]["content"], "plain output");

        let args = provider_process_args("codex", "inspect", "C:/workspace").unwrap();
        assert_eq!(args[0], "exec");
        assert!(args.contains(&"--json".to_string()));
        assert!(args.contains(&"--ephemeral".to_string()));
        assert!(args.contains(&"--cd".to_string()));
        assert_eq!(args.last().unwrap(), "inspect");

        // Claude uses the documented non-interactive print mode.
        let claude_args = provider_process_args("claude", "inspect", "C:/workspace").unwrap();
        assert_eq!(claude_args[0], "-p");
        assert!(claude_args.contains(&"--output-format".to_string()));
    }

    #[tokio::test]
    async fn interrupt_targets_live_session_and_persists_status() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO agent_profiles (id, name, provider, access_level) VALUES ('p-1', 'Codex', 'codex', 'observe')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_runs (id, profile_id, status, provider) VALUES ('r-live', 'p-1', 'running', 'codex')")
            .execute(&pool)
            .await
            .unwrap();

        // A real long-running placeholder child process stands in for the
        // provider CLI.
        let mut command = tokio::process::Command::new(if cfg!(windows) { "cmd" } else { "sleep" });
        command
            .args(if cfg!(windows) {
                vec!["/C".to_string(), "ping -n 30 127.0.0.1 > nul".to_string()]
            } else {
                vec!["30".to_string()]
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command.spawn().unwrap();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let handle = LiveSessionHandle {
            child: Arc::new(tokio::sync::Mutex::new(Some(child))),
            status_on_kill: Arc::new(Mutex::new("terminated".to_string())),
        };
        register_live_session("r-live", handle.clone());

        let control = control_live_session("r-live", "interrupt")
            .await
            .expect("live session is registered");
        assert_eq!(control["requested"], true);
        assert_eq!(control["action"], "interrupt");

        let status = run_provider_monitor(
            None,
            pool.clone(),
            "r-live".to_string(),
            handle,
            LiveSessionStreams { stdout, stderr },
        )
        .await
        .unwrap();
        assert_eq!(status, "interrupted");

        let detail = read_run_core(&pool, "r-live").await.unwrap().unwrap();
        assert_eq!(detail.run.status, "interrupted");
        assert!(detail
            .messages
            .iter()
            .any(|m| m["content"].as_str().unwrap_or("").contains("interrupted by user control")));
        assert!(!live_session_active("r-live"));

        // Controlling a finished run falls back to the durable record path.
        let after = interrupt_agent_record_only(&pool, "r-live").await.unwrap();
        assert_eq!(after["migrationPending"], true);
    }

    async fn interrupt_agent_record_only(pool: &SqlitePool, id: &str) -> Result<Value, String> {
        record_pending_control_core(pool, id, "interrupt", None).await
    }

    #[tokio::test]
    async fn agent_control_attempts_persist_migration_pending_messages() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO agent_profiles (id, name, provider, access_level) VALUES ('p-1', 'Test', 'codex', 'observe')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO agent_runs (id, profile_id, status, provider) VALUES ('r-1', 'p-1', 'failed', 'codex')")
            .execute(&pool)
            .await
            .unwrap();

        let interrupt = record_pending_control_core(&pool, "r-1", "interrupt", None)
            .await
            .unwrap();
        assert_eq!(interrupt["migrationPending"], true);
        assert!(interrupt["message"]
            .as_str()
            .unwrap()
            .contains("migration-pending"));

        let resume = record_pending_control_core(&pool, "r-1", "resume", Some("continue"))
            .await
            .unwrap();
        assert_eq!(resume["action"], "resume");

        let terminate = record_pending_control_core(&pool, "r-1", "terminate", None)
            .await
            .unwrap();
        assert_eq!(terminate["action"], "terminate");

        let detail = read_run_core(&pool, "r-1").await.unwrap().unwrap();
        assert_eq!(detail.messages.len(), 4);
        assert_eq!(detail.messages[0]["action"], "interrupt");
        assert_eq!(detail.messages[1]["resumeAttempt"], true);
        assert_eq!(detail.messages[2]["action"], "resume");
        assert_eq!(detail.messages[3]["action"], "terminate");
        assert!(record_pending_control_core(&pool, "missing", "interrupt", None)
            .await
            .unwrap_err()
            .contains("not found"));
    }
}
