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

pub async fn list_runs_core(pool: &SqlitePool, limit: i64) -> Result<Vec<AgentRunView>, String> {
    let rows = sqlx::query(
        "SELECT r.id, r.profile_id, r.status, r.provider, r.created_at FROM agent_runs r ORDER BY r.created_at DESC LIMIT ?",
    )
    .bind(limit.clamp(1, 100))
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
    list_runs_core(&pool, 50).await
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
    executable: &str,
    prompt: &str,
    cwd: &str,
    run_id: &str,
) -> Result<(LiveSessionHandle, LiveSessionStreams), String> {
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

    let _ = launch_provider_session(app_handle, pool, &run_id, &provider, payload.prompt.trim(), payload.cwd.trim()).await;

    list_runs_core(pool, 50)
        .await?
        .into_iter()
        .find(|run| run.id == run_id)
        .ok_or_else(|| "Agent run creation failed".to_string())
}

/// Spawn the provider process for an existing run row and monitor it in the
/// background. On spawn failure the run is marked failed and a system message
/// records the error; the caller receives the message as Err.
async fn launch_provider_session(
    app_handle: Option<&AppHandle>,
    pool: &SqlitePool,
    run_id: &str,
    provider: &str,
    prompt: &str,
    cwd: &str,
) -> Result<(), String> {
    // Resolution is async (settings override lives in the DB), so it happens
    // here where the pool is available rather than inside the spawn call.
    let executable = resolve_provider_executable(pool, provider).await?;
    match spawn_provider_process(provider, &executable, prompt, cwd, run_id).await {
        Ok((handle, streams)) => {
            // The run continues in the background; the renderer follows it
            // through `agent-event` refreshes.
            let app = app_handle.cloned();
            let pool_for_task = pool.clone();
            let run_for_task = run_id.to_string();
            tauri::async_runtime::spawn(async move {
                let _ = run_provider_monitor(app, pool_for_task, run_for_task, handle, streams)
                    .await;
            });
            Ok(())
        }
        Err(error) => {
            sqlx::query("UPDATE agent_runs SET status = 'failed' WHERE id = ?")
                .bind(run_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            insert_agent_message(
                pool,
                run_id,
                "system",
                &error,
                serde_json::json!({
                    "id": Uuid::new_v4().to_string(),
                    "role": "system",
                    "content": error,
                    "status": "failed",
                }),
            )
            .await?;
            Err(error)
        }
    }
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
    let message = if run.run.status == "running" {
        // The live session registry is the source of truth; a running status
        // with no live handle means the monitor already persisted a terminal
        // state that has not refreshed in the renderer yet.
        format!("Agent {action} has no live provider process; the run already finished.")
    } else {
        format!("Agent run is already {status}; nothing to {action}.", status = run.run.status, action = action)
    };

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
        }),
    )
    .await?;

    Ok(serde_json::json!({
        "runId": run_id,
        "status": run.run.status,
        "action": action,
        "requested": false,
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

/// Directories where the CLI shims of the supported providers are commonly
/// installed but which GUI-launched processes may not have on PATH (npm
/// global, Volta, nvm, scoop, bun, cargo).
fn well_known_provider_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from);
    let appdata = std::env::var_os("APPDATA").map(std::path::PathBuf::from);
    let localappdata = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from);
    if let Some(appdata) = &appdata {
        dirs.push(appdata.join("npm"));
    }
    if let Some(local) = &localappdata {
        dirs.push(local.join("npm"));
        dirs.push(local.join("pnpm"));
        dirs.push(local.join("Volta").join("bin"));
    }
    if let Some(home) = &home {
        dirs.push(home.join(".volta").join("bin"));
        dirs.push(home.join(".bun").join("bin"));
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join("scoop").join("shims"));
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));
    }
    #[cfg(not(target_os = "windows"))]
    {
        dirs.push(std::path::PathBuf::from("/usr/local/bin"));
        dirs.push(std::path::PathBuf::from("/opt/homebrew/bin"));
    }
    dirs
}

fn well_known_provider_executable(provider: &str) -> Option<String> {
    if !ALLOWED_PROVIDERS.contains(&provider) {
        return None;
    }
    let extensions: Vec<&str> = if cfg!(target_os = "windows") {
        vec![".cmd", ".exe", ""]
    } else {
        vec![""]
    };
    for dir in well_known_provider_dirs() {
        for ext in &extensions {
            let candidate = dir.join(format!("{provider}{ext}"));
            if candidate.is_file() {
                return Some(candidate.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Detect desktop (GUI) installations of a provider. Desktop apps cannot be
/// driven headlessly by ScriptManager — only their CLI counterparts can — but
/// surfacing them turns "Not found" into actionable guidance.
fn detect_desktop_install(provider: &str) -> Option<String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(std::path::PathBuf::from)?;
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from)?;
        match provider {
            "claude" => {
                let candidate = local.join("AnthropicClaude").join("claude.exe");
                if candidate.is_file() {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }
            "codex" => {
                if let Ok(entries) = std::fs::read_dir(local.join("Programs")) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_lowercase();
                        if name.contains("codex") {
                            if let Ok(exes) = std::fs::read_dir(entry.path()) {
                                for exe in exes.flatten() {
                                    let exe_name = exe.file_name().to_string_lossy().to_lowercase();
                                    if exe_name.ends_with(".exe")
                                        && (exe_name.contains("codex") || exe_name.contains(&name))
                                    {
                                        return Some(exe.path().to_string_lossy().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let applications = home.join("Applications");
        let global = std::path::PathBuf::from("/Applications");
        let app_name = match provider {
            "claude" => "Claude.app",
            "codex" => "Codex.app",
            _ => "",
        };
        if !app_name.is_empty() {
            for base in [applications, global] {
                let candidate = base.join(app_name);
                if candidate.is_dir() {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }
        }
    }
    let _ = home;
    None
}

fn install_hint(provider: &str) -> &'static str {
    match provider {
        "codex" => "Install the Codex CLI: npm install -g @openai/codex",
        "claude" => "Install the Claude Code CLI: npm install -g @anthropic-ai/claude-code",
        _ => "",
    }
}

/// Ask a discovered CLI for its version. Desktop binaries are never probed.
async fn probe_provider_version(executable: &str) -> Option<String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new(executable).arg("--version").output(),
    )
    .await
    .ok()?
    .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim().to_string();
    if line.is_empty() {
        None
    } else {
        Some(line)
    }
}

pub const AGENT_CLI_PATH_PREFIX: &str = "agent_cli_path_";

fn settings_key(provider: &str) -> String {
    format!("{AGENT_CLI_PATH_PREFIX}{provider}")
}

/// Resolve a provider executable for launching: manual override from settings
/// first, then PATH, then well-known install locations. The error message
/// always explains what to do next (install the CLI or set a path).
pub async fn resolve_provider_executable(pool: &SqlitePool, provider: &str) -> Result<String, String> {
    if !ALLOWED_PROVIDERS.contains(&provider) {
        return Err(format!("Unsupported agent provider: {provider}"));
    }
    if let Some(override_path) = crate::settings::get_setting(pool, &settings_key(provider))
        .await?
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
    {
        if std::path::Path::new(&override_path).is_file() {
            return Ok(override_path);
        }
        return Err(format!(
            "Configured {provider} CLI path does not exist: {override_path}. Update or clear it in the Agents panel."
        ));
    }
    if let Some(on_path) = discover_provider_on_path(provider) {
        return Ok(on_path);
    }
    if let Some(known) = well_known_provider_executable(provider) {
        return Ok(known);
    }
    let desktop_note = match detect_desktop_install(provider) {
        Some(_) => format!(
            " A {provider} desktop app is installed, but desktop apps cannot be automated headlessly — the CLI is required."
        ),
        None => String::new(),
    };
    Err(format!(
        "'{provider}' CLI not found.{desktop_note} {}. Or set the CLI path manually in the Agents panel.",
        install_hint(provider)
    ))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDiscovery {
    pub provider: String,
    pub available: bool,
    pub executable: Option<String>,
    pub source: Option<String>,
    pub version: Option<String>,
    pub desktop_detected: Option<String>,
    pub install_hint: Option<String>,
    pub error: Option<String>,
}

async fn discover_provider_detailed(provider: &str) -> ProviderDiscovery {
    if !ALLOWED_PROVIDERS.contains(&provider) {
        return ProviderDiscovery {
            provider: provider.to_string(),
            available: false,
            executable: None,
            source: None,
            version: None,
            desktop_detected: None,
            install_hint: None,
            error: Some(format!("Unsupported agent provider: {provider}")),
        };
    }
    if let Some(executable) = discover_provider_on_path(provider) {
        return ProviderDiscovery {
            provider: provider.to_string(),
            available: true,
            version: probe_provider_version(&executable).await,
            executable: Some(executable.clone()),
            source: Some("path".to_string()),
            desktop_detected: detect_desktop_install(provider),
            install_hint: None,
            error: None,
        };
    }
    if let Some(executable) = well_known_provider_executable(provider) {
        return ProviderDiscovery {
            provider: provider.to_string(),
            available: true,
            version: probe_provider_version(&executable).await,
            executable: Some(executable.clone()),
            source: Some("well-known".to_string()),
            desktop_detected: None,
            install_hint: None,
            error: None,
        };
    }
    ProviderDiscovery {
        provider: provider.to_string(),
        available: false,
        executable: None,
        source: None,
        version: None,
        desktop_detected: detect_desktop_install(provider),
        install_hint: Some(install_hint(provider).to_string()),
        error: Some(format!("'{provider}' CLI not found on PATH")),
    }
}


#[tauri::command]
pub async fn discover_agent_providers() -> Result<Vec<ProviderDiscovery>, String> {
    let mut out = Vec::new();
    for provider in ALLOWED_PROVIDERS {
        out.push(discover_provider_detailed(provider).await);
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct SetProviderPathPayload {
    pub provider: String,
    /// Empty string clears the override.
    pub path: String,
}

/// Store or clear a manual CLI executable path for a provider. The path is
/// probed for existence so a typo cannot silently break launches later.
#[tauri::command]
pub async fn set_agent_provider_path(
    pool: State<'_, SqlitePool>,
    payload: SetProviderPathPayload,
) -> Result<Value, String> {
    let provider = payload.provider.as_str();
    if !ALLOWED_PROVIDERS.contains(&provider) {
        return Err(format!("Unsupported agent provider: {provider}"));
    }
    let path = payload.path.trim().to_string();
    if path.is_empty() {
        crate::settings::delete_setting(&pool, &settings_key(provider)).await?;
        return Ok(serde_json::json!({
            "provider": provider,
            "override": null,
            "message": format!("Manual {provider} CLI path cleared."),
        }));
    }
    if !std::path::Path::new(&path).is_file() {
        return Err(format!("Path is not a file: {path}"));
    }
    crate::settings::set_setting(&pool, &settings_key(provider), &path).await?;
    let version = probe_provider_version(&path).await;
    Ok(serde_json::json!({
        "provider": provider,
        "override": path,
        "version": version,
        "message": format!("{provider} CLI path saved."),
    }))
}

#[tauri::command]
pub async fn get_agent_provider_paths(
    pool: State<'_, SqlitePool>,
) -> Result<Value, String> {
    let mut paths = serde_json::Map::new();
    for provider in ALLOWED_PROVIDERS {
        let value = crate::settings::get_setting(&pool, &settings_key(provider)).await?;
        paths.insert(provider.to_string(), Value::String(value.unwrap_or_default()));
    }
    Ok(Value::Object(paths))
}

/// Run a provider CLI to completion and collect its final reply. Used by the
/// workflow `agent` node where there is no interactive session to stream to.
pub struct ProviderCollectResult {
    pub reply: String,
    pub exit_code: Option<i32>,
    pub stderr_tail: String,
}

/// Extract the assistant's final message from provider output.
/// Claude `-p --output-format json` emits one JSON object with `result`;
/// Codex `exec --json` streams JSONL items whose agent_message holds text.
pub(crate) fn parse_provider_reply(provider: &str, stdout: &[String]) -> Option<String> {
    for line in stdout.iter().rev() {
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let candidate = match provider {
            "claude" => event.get("result").and_then(Value::as_str),
            "codex" => {
                let item = event.get("item").or_else(|| event.get("msg"));
                let kind = item
                    .and_then(|item| item.get("itemType").or_else(|| item.get("type")))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let is_message = kind == "agent_message"
                    || kind == "agent_message_delta"
                    || kind == "message";
                if is_message {
                    item.and_then(|item| {
                        item.get("text")
                            .or_else(|| item.get("content"))
                            .and_then(Value::as_str)
                    })
                } else {
                    event.get("text").and_then(Value::as_str)
                }
            }
            _ => None,
        };
        if let Some(text) = candidate.filter(|text| !text.trim().is_empty()) {
            return Some(text.trim().to_string());
        }
    }
    None
}

pub async fn run_provider_collect(
    pool: &SqlitePool,
    provider: &str,
    prompt: &str,
    cwd: &str,
) -> Result<ProviderCollectResult, String> {
    let executable = resolve_provider_executable(pool, provider).await?;
    let args = provider_process_args(provider, prompt, cwd)?;
    let output = tokio::process::Command::new(&executable)
        .args(&args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|error| format!("Failed to launch {provider} provider process: {error}"))?;
    let stdout: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_string)
        .collect();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let exit_code = output.status.code();
    let reply = parse_provider_reply(provider, &stdout).unwrap_or_else(|| {
        stdout
            .iter()
            .map(|line| line.as_str())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string()
    });
    if !output.status.success() {
        let tail: String = stderr.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!(
            "{provider} CLI exited with code {}: {}",
            exit_code.unwrap_or(-1),
            truncate_for_storage(&tail)
        ));
    }
    let stderr_tail = stderr.lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
    Ok(ProviderCollectResult {
        reply: truncate_for_storage(&reply),
        exit_code,
        stderr_tail: truncate_for_storage(&stderr_tail),
    })
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

/// Resume a finished agent run: relaunch the provider with a transcript of
/// the prior conversation plus the follow-up instruction. Runs execute as
/// fresh provider processes (the CLIs are ephemeral), so the continuation is
/// prompt-based — honest about what the transport supports while keeping one
/// persistent ScriptManager run thread.
#[tauri::command]
pub async fn resume_agent_run(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    payload: ResumeAgentPayload,
) -> Result<Value, String> {
    let detail = read_run_core(&pool, &payload.run_id)
        .await?
        .ok_or_else(|| "Agent run not found".to_string())?;
    if detail.run.status == "running" {
        return Err("Agent run is still active; interrupt it before resuming".to_string());
    }
    let provider = detail.run.provider.clone();
    if !ALLOWED_PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unsupported agent provider: {provider}"));
    }

    let cwd = detail
        .messages
        .iter()
        .filter_map(|message| message.get("cwd").and_then(Value::as_str))
        .last()
        .unwrap_or("")
        .to_string();
    if cwd.trim().is_empty() || !std::path::Path::new(cwd.trim()).is_dir() {
        return Err("Cannot resume: the original working directory is unavailable. Launch the profile again with a project folder.".to_string());
    }

    let follow_up = payload
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty())
        .unwrap_or("Continue where you left off and finish the task.");

    // Transcript for the continuation prompt: prior user turns and the most
    // recent assistant/system content, each capped so the CLI prompt stays
    // within a sane command-line size.
    const TURN_CAP: usize = 2000;
    let mut transcript = String::new();
    for message in &detail.messages {
        let role = message.get("role").and_then(Value::as_str).unwrap_or("");
        let content = message
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if content.is_empty() || message.get("resumeAttempt").is_some() {
            continue;
        }
        if role == "user" {
            transcript.push_str(&format!("User: {}\n", truncate_turn(content)));
        } else if role == "assistant" {
            transcript.push_str(&format!("Assistant: {}\n", truncate_turn(content)));
        }
    }
    let transcript = truncate_for_storage_tail(&transcript, TURN_CAP * 4);

    let prompt = if transcript.trim().is_empty() {
        follow_up.to_string()
    } else {
        format!(
            "Continue the following task.\n\n== Prior conversation ==\n{transcript}\n\n== Follow-up ==\n{follow_up}"
        )
    };

    sqlx::query("UPDATE agent_runs SET status = 'running' WHERE id = ?")
        .bind(&payload.run_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    insert_agent_message(
        &pool,
        &payload.run_id,
        "user",
        follow_up,
        serde_json::json!({
            "id": Uuid::new_v4().to_string(),
            "role": "user",
            "content": follow_up,
            "cwd": cwd,
            "resumeAttempt": true,
        }),
    )
    .await?;

    match launch_provider_session(
        Some(&app_handle),
        &pool,
        &payload.run_id,
        &provider,
        &prompt,
        cwd.trim(),
    )
    .await
    {
        Ok(()) => Ok(serde_json::json!({
            "runId": payload.run_id,
            "status": "running",
            "action": "resume",
            "resumed": true,
            "message": "Agent run resumed with the prior conversation context.",
        })),
        Err(error) => Err(error),
    }
}

fn truncate_turn(content: &str) -> String {
    let content = content.trim();
    let capped: String = content.chars().take(2000).collect();
    if capped.len() < content.len() {
        format!("{capped}…")
    } else {
        capped.to_string()
    }
}

fn truncate_for_storage_tail(content: &str, max_chars: usize) -> String {
    let count = content.chars().count();
    if count <= max_chars {
        return content.to_string();
    }
    let tail: String = content.chars().skip(count - max_chars).collect();
    format!("…{tail}")
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

        let runs = list_runs_core(&pool, 50).await.unwrap();
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
        assert!(live_session("r-live").is_none());

        // Controlling a finished run falls back to the durable record path.
        let after = interrupt_agent_record_only(&pool, "r-live").await.unwrap();
        assert_eq!(after["requested"], false);
        assert!(after["message"].as_str().unwrap().contains("nothing to"));
    }

    async fn interrupt_agent_record_only(pool: &SqlitePool, id: &str) -> Result<Value, String> {
        record_pending_control_core(pool, id, "interrupt", None).await
    }

    #[test]
    fn parse_provider_reply_handles_claude_and_codex() {
        let claude = vec![
            serde_json::json!({ "type": "result", "result": "Done!", "session_id": "s1" }).to_string(),
        ];
        assert_eq!(parse_provider_reply("claude", &claude).as_deref(), Some("Done!"));

        let codex = vec![
            serde_json::json!({ "type": "item.completed", "item": { "itemType": "reasoning", "text": "thinking" } }).to_string(),
            serde_json::json!({ "type": "item.completed", "item": { "itemType": "agent_message", "text": "All set." } }).to_string(),
        ];
        assert_eq!(parse_provider_reply("codex", &codex).as_deref(), Some("All set."));

        assert_eq!(parse_provider_reply("codex", &[]), None);
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
        assert_eq!(interrupt["requested"], false);
        assert!(interrupt["message"]
            .as_str()
            .unwrap()
            .contains("nothing to interrupt"));

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
