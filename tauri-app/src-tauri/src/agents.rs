use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use std::process::Command;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

/// Agent support decision (recorded in the migration completion plan, S9.1):
/// profiles and run history are fully persisted. Codex launch uses a fixed,
/// allowlisted non-interactive CLI shape. Long-lived process control and
/// Claude execution remain explicit pending work; discovery only ever checks
/// a fixed allowlist of executable names, never renderer-supplied commands.

const ALLOWED_PROVIDERS: [&str; 2] = ["codex", "claude"];

#[derive(Debug)]
struct ProviderProcessResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
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
        "claude" => Err("Claude ACP provider process launch is not migrated yet".to_string()),
        other => Err(format!("Unsupported agent provider: {other}")),
    }
}

fn run_provider_process(provider: &str, prompt: &str, cwd: &str) -> Result<ProviderProcessResult, String> {
    let executable = discover_provider_on_path(provider)
        .ok_or_else(|| format!("'{provider}' executable not found on PATH"))?;
    let args = provider_process_args(provider, prompt, cwd)?;
    let output = Command::new(&executable)
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|error| format!("Failed to launch {provider} provider process: {error}"))?;
    Ok(ProviderProcessResult {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

async fn persist_provider_process_result(
    pool: &SqlitePool,
    run_id: &str,
    result: ProviderProcessResult,
) -> Result<String, String> {
    let status = if result.exit_code == Some(0) { "succeeded" } else { "failed" };
    if !result.stdout.trim().is_empty() {
        insert_agent_message(
            pool,
            run_id,
            "assistant",
            result.stdout.trim(),
            serde_json::json!({
                "id": Uuid::new_v4().to_string(),
                "role": "assistant",
                "content": result.stdout.trim(),
                "stream": "stdout",
                "exitCode": result.exit_code,
            }),
        )
        .await?;
    }
    if !result.stderr.trim().is_empty() || status == "failed" {
        let content = if result.stderr.trim().is_empty() {
            format!("Agent provider process exited with {:?}", result.exit_code)
        } else {
            result.stderr.trim().to_string()
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
    sqlx::query("UPDATE agent_runs SET status = ? WHERE id = ?")
        .bind(status)
        .bind(run_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(status.to_string())
}

pub async fn run_agent_core(
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

    match run_provider_process(&provider, payload.prompt.trim(), payload.cwd.trim()) {
        Ok(result) => {
            persist_provider_process_result(pool, &run_id, result).await?;
        }
        Err(error) => {
            sqlx::query("UPDATE agent_runs SET status = 'failed' WHERE id = ?")
                .bind(&run_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
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
                    "migrationPending": provider != "codex",
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
    let run = run_agent_core(&pool, payload).await?;
    let state = if run.status == "succeeded" { "succeeded" } else { "failed" };
    let message = read_run_core(&pool, &run.id)
        .await?
        .and_then(|detail| detail.messages.last().cloned())
        .and_then(|message| message.get("content").and_then(|content| content.as_str()).map(str::to_string))
        .unwrap_or_else(|| format!("Agent run {}", run.status));
    app_handle
        .emit(
            "agent-event",
            serde_json::json!({
                "sessionId": run.id,
                "event": {
                    "type": if run.status == "succeeded" { "state" } else { "error" },
                    "state": state,
                    "message": message
                }
            }),
        )
        .ok();
    Ok(run)
}

#[tauri::command]
pub async fn interrupt_agent_run(pool: State<'_, SqlitePool>, id: String) -> Result<Value, String> {
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
    async fn run_agent_records_claude_execution_pending_run() {
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

        let run = run_agent_core(
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
        assert_eq!(detail.messages[1]["migrationPending"], true);
        assert!(detail.messages[1]["content"]
            .as_str()
            .unwrap()
            .contains("not migrated yet"));
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
                stdout: "{\"type\":\"message\",\"content\":\"done\"}\n".to_string(),
                stderr: String::new(),
                exit_code: Some(0),
            },
        )
        .await
        .unwrap();
        assert_eq!(status, "succeeded");

        let detail = read_run_core(&pool, "r-1").await.unwrap().unwrap();
        assert_eq!(detail.run.status, "succeeded");
        assert_eq!(detail.messages.len(), 1);
        assert_eq!(detail.messages[0]["stream"], "stdout");
        assert_eq!(detail.messages[0]["exitCode"], 0);

        let args = provider_process_args("codex", "inspect", "C:/workspace").unwrap();
        assert_eq!(args[0], "exec");
        assert!(args.contains(&"--json".to_string()));
        assert!(args.contains(&"--ephemeral".to_string()));
        assert!(args.contains(&"--cd".to_string()));
        assert_eq!(args.last().unwrap(), "inspect");
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
