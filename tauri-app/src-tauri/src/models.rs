use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub description: String,
    pub language: String,
    pub source_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub description: String,
    pub folder_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopSettings {
    pub theme: String,
    pub notifications: bool,
    pub telemetry: bool,
}
