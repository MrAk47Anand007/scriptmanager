use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

/// Agent support decision (recorded in the migration completion plan, S9.1):
/// profiles and run history are fully persisted. Provider **execution**
/// (run/interrupt/resume) stays feature-gated behind a typed pending error
/// until ACP provider process control is ported; discovery only ever checks
/// a fixed allowlist of executable names, never renderer-supplied commands.

const ALLOWED_PROVIDERS: [&str; 2] = ["codex", "claude"];

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
pub async fn run_agent() -> Result<Value, String> {
    Err("Agent provider execution is migration-pending in the Tauri desktop app (ACP process control not ported)".to_string())
}

#[tauri::command]
pub async fn interrupt_agent_run() -> Result<Value, String> {
    Err("Agent provider execution is migration-pending in the Tauri desktop app".to_string())
}

#[tauri::command]
pub async fn resume_agent_run() -> Result<Value, String> {
    Err("Agent provider execution is migration-pending in the Tauri desktop app".to_string())
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
}
