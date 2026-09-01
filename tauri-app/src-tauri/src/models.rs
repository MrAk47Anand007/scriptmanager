use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Script {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub filename: String,
    pub description: String,
    pub language: String,
    pub source_path: Option<String>,
}
