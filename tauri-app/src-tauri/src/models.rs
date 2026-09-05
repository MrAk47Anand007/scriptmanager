use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub description: String,
    pub language: String,
    pub interpreter: Option<String>,
    pub content: Option<String>,
    pub parameters: String,
    pub created_at: String,
    pub updated_at: String,
    pub last_run: Option<String>,
    pub schedule_cron: Option<String>,
    pub schedule_enabled: bool,
    pub collection_id: Option<String>,
    pub gist_id: Option<String>,
    pub gist_url: Option<String>,
    pub sync_to_gist: bool,
    pub timeout_ms: Option<i64>,
    pub require_webhook_signature: bool,
    pub webhook_secret_set: bool,
    pub source_path: Option<String>,
    pub source_available: bool,
    #[sqlx(skip)]
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub script_count: i64,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub folder_path: Option<String>,
    pub is_temporary: bool,
    pub runtime_preset: String,
    pub python_toolchain_enabled: bool,
    pub python_venv_path: Option<String>,
    pub python_interpreter_path: Option<String>,
    pub storage_provider_id: Option<String>,
    pub remote_prefix: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ScriptTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub language: String,
    pub interpreter: Option<String>,
    pub content: String,
    pub parameters: String,
    pub is_built_in: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BootstrapState {
    pub scripts: Vec<Script>,
    pub collections: Vec<Collection>,
    pub settings: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct DesktopSettings {
    pub theme: String,
    pub notifications: bool,
    pub telemetry: bool,
}
