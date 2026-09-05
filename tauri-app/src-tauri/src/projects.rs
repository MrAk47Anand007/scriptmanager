use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

const WORKSPACE_ID: &str = "default";
const VALID_ENVIRONMENTS: [&str; 4] = ["development", "qa", "uat", "production"];

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub environment: String,
    pub color: String,
    pub repository_root: Option<String>,
    pub default_branch: String,
    pub remote_url: Option<String>,
    pub workspace_policy: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub environment: String,
    pub color: String,
    pub repository_root: Option<String>,
    pub default_branch: String,
    pub remote_url: Option<String>,
    pub workspace_policy: serde_json::Value,
    pub collection_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveProjectPayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub environment: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(rename = "repository_root", default)]
    pub repository_root_snake: Option<String>,
    #[serde(rename = "repositoryRoot", default)]
    pub repository_root_camel: Option<String>,
    #[serde(rename = "default_branch", default)]
    pub default_branch_snake: Option<String>,
    #[serde(rename = "defaultBranch", default)]
    pub default_branch_camel: Option<String>,
    #[serde(rename = "remote_url", default)]
    pub remote_url_snake: Option<String>,
    #[serde(rename = "remoteUrl", default)]
    pub remote_url_camel: Option<String>,
    #[serde(rename = "workspace_policy", default)]
    pub workspace_policy_snake: Option<serde_json::Value>,
    #[serde(rename = "workspacePolicy", default)]
    pub workspace_policy_camel: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct AssignCollectionPayload {
    #[serde(rename = "collectionId")]
    pub collection_id: String,
    #[serde(rename = "projectId", default)]
    pub project_id: Option<String>,
}

pub(crate) fn default_workspace_policy() -> serde_json::Value {
    serde_json::json!({
        "allowCommit": true,
        "allowPull": true,
        "requireApprovalForPush": true,
        "requireApprovalForForce": true,
        "requireApprovalForCleanup": true
    })
}

pub(crate) fn parse_workspace_policy(raw: &str) -> serde_json::Value {
    let defaults = default_workspace_policy();
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(raw);
    let parsed = match parsed {
        Ok(serde_json::Value::Object(_)) => parsed.unwrap(),
        _ => return defaults.clone(),
    };
    let obj = parsed.as_object().unwrap();
    let get_bool = |key: &str, fallback: bool| {
        obj.get(key)
            .and_then(|v| v.as_bool())
            .unwrap_or(fallback)
    };
    serde_json::json!({
        "allowCommit": get_bool("allowCommit", true),
        "allowPull": get_bool("allowPull", true),
        "requireApprovalForPush": get_bool("requireApprovalForPush", true),
        "requireApprovalForForce": get_bool("requireApprovalForForce", true),
        "requireApprovalForCleanup": get_bool("requireApprovalForCleanup", true)
    })
}

fn normalize_environment(input: Option<String>) -> String {
    match input.as_deref() {
        Some(env) if VALID_ENVIRONMENTS.contains(&env) => env.to_string(),
        _ => "development".to_string(),
    }
}

fn trim_to_null(value: Option<String>) -> Option<String> {
    match value {
        Some(v) => {
            let trimmed = v.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => None,
    }
}

async fn to_record(pool: &SqlitePool, row: ProjectRow) -> Result<ProjectRecord, String> {
    let collection_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM collections WHERE project_id = ?",
    )
    .bind(&row.id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(ProjectRecord {
        id: row.id,
        name: row.name,
        description: row.description,
        environment: row.environment,
        color: row.color,
        repository_root: row.repository_root,
        default_branch: row.default_branch,
        remote_url: row.remote_url,
        workspace_policy: parse_workspace_policy(&row.workspace_policy),
        collection_ids,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn get_project_row(pool: &SqlitePool, id: &str) -> Result<Option<ProjectRow>, String> {
    sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, description, environment, color, repository_root,
            default_branch, remote_url, workspace_policy, created_at, updated_at
         FROM projects WHERE id = ? AND workspace_id = ?",
    )
    .bind(id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn get_project_record(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<ProjectRecord>, String> {
    match get_project_row(pool, id).await? {
        Some(row) => Ok(Some(to_record(pool, row).await?)),
        None => Ok(None),
    }
}

async fn list_project_records(pool: &SqlitePool) -> Result<Vec<ProjectRecord>, String> {
    let rows = sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, description, environment, color, repository_root,
            default_branch, remote_url, workspace_policy, created_at, updated_at
         FROM projects WHERE workspace_id = ? ORDER BY name ASC",
    )
    .bind(WORKSPACE_ID)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(to_record(pool, row).await?);
    }
    Ok(out)
}

async fn save_project_record(
    pool: &SqlitePool,
    payload: SaveProjectPayload,
) -> Result<ProjectRecord, String> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    let description = payload.description.unwrap_or_default();
    let environment = normalize_environment(payload.environment);
    let color = payload.color.unwrap_or_else(|| "#6366f1".to_string());
    let repository_root = trim_to_null(
        payload
            .repository_root_camel
            .or(payload.repository_root_snake),
    );
    let default_branch = payload
        .default_branch_camel
        .or(payload.default_branch_snake)
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| "main".to_string());
    let remote_url = trim_to_null(payload.remote_url_camel.or(payload.remote_url_snake));
    let policy_value = payload
        .workspace_policy_camel
        .or(payload.workspace_policy_snake)
        .unwrap_or_else(default_workspace_policy);
    let policy_text = serde_json::to_string(&parse_workspace_policy(
        &serde_json::to_string(&policy_value).unwrap_or_else(|_| "{}".to_string()),
    ))
    .unwrap_or_else(|_| "{}".to_string());
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    if let Some(id) = payload.id {
        let existing = get_project_row(pool, &id).await?;
        if existing.is_none() {
            return Err("Project not found".to_string());
        }
        sqlx::query(
            "UPDATE projects SET name = ?, description = ?, environment = ?, color = ?,
                repository_root = ?, default_branch = ?, remote_url = ?,
                workspace_policy = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
        )
        .bind(&name)
        .bind(&description)
        .bind(&environment)
        .bind(&color)
        .bind(&repository_root)
        .bind(&default_branch)
        .bind(&remote_url)
        .bind(&policy_text)
        .bind(&now)
        .bind(&id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_project_record(pool, &id)
            .await?
            .ok_or_else(|| "Project not found".to_string())
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO projects (id, workspace_id, name, description, environment, color,
                repository_root, default_branch, remote_url, workspace_policy, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .bind(&name)
        .bind(&description)
        .bind(&environment)
        .bind(&color)
        .bind(&repository_root)
        .bind(&default_branch)
        .bind(&remote_url)
        .bind(&policy_text)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_project_record(pool, &id)
            .await?
            .ok_or_else(|| "Project not found".to_string())
    }
}

async fn delete_project_record(pool: &SqlitePool, id: &str) -> Result<String, String> {
    let existing = get_project_row(pool, id).await?;
    if existing.is_none() {
        return Err("Project not found".to_string());
    }
    sqlx::query("UPDATE collections SET project_id = NULL WHERE project_id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM projects WHERE id = ? AND workspace_id = ?")
        .bind(id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

async fn assign_collection_record(
    pool: &SqlitePool,
    collection_id: &str,
    project_id: Option<&str>,
) -> Result<serde_json::Value, String> {
    if let Some(pid) = project_id {
        if get_project_row(pool, pid).await?.is_none() {
            return Err("Project not found".to_string());
        }
    }
    let res = sqlx::query("UPDATE collections SET project_id = ? WHERE id = ?")
        .bind(project_id)
        .bind(collection_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Collection not found".to_string());
    }
    Ok(serde_json::json!({ "collectionId": collection_id, "projectId": project_id }))
}

#[tauri::command]
pub async fn list_projects(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ProjectRecord>, String> {
    list_project_records(&pool).await
}

#[tauri::command]
pub async fn save_project(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveProjectPayload,
) -> Result<ProjectRecord, String> {
    save_project_record(&pool, payload).await
}

#[tauri::command]
pub async fn delete_project(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<String, String> {
    delete_project_record(&pool, &id).await
}

#[tauri::command]
pub async fn assign_collection_to_project(
    pool: tauri::State<'_, SqlitePool>,
    payload: AssignCollectionPayload,
) -> Result<serde_json::Value, String> {
    assign_collection_record(&pool, &payload.collection_id, payload.project_id.as_deref()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::schema::ensure_schema(&pool).await.unwrap();
        pool
    }

    #[test]
    fn workspace_policy_falls_back_to_defaults() {
        let policy = parse_workspace_policy("not-json");
        assert_eq!(policy["allowCommit"], serde_json::Value::Bool(true));
        let policy = parse_workspace_policy(r#"{"allowCommit":false}"#);
        assert_eq!(policy["allowCommit"], serde_json::Value::Bool(false));
        assert_eq!(
            policy["requireApprovalForPush"],
            serde_json::Value::Bool(true)
        );
    }

    #[tokio::test]
    async fn projects_crud_round_trip() {
        let pool = test_pool().await;
        let created = save_project_record(
            &pool,
            SaveProjectPayload {
                id: None,
                name: "Web".to_string(),
                description: Some("d".to_string()),
                environment: Some("qa".to_string()),
                color: None,
                repository_root_snake: None,
                repository_root_camel: Some("/tmp/repo".to_string()),
                default_branch_snake: None,
                default_branch_camel: None,
                remote_url_snake: None,
                remote_url_camel: None,
                workspace_policy_snake: None,
                workspace_policy_camel: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(created.environment, "qa");
        assert_eq!(created.default_branch, "main");
        assert!(created.collection_ids.is_empty());

        let listed = list_project_records(&pool).await.unwrap();
        assert_eq!(listed.len(), 1);

        assert!(save_project_record(
            &pool,
            SaveProjectPayload {
                id: None,
                name: "   ".to_string(),
                description: None,
                environment: None,
                color: None,
                repository_root_snake: None,
                repository_root_camel: None,
                default_branch_snake: None,
                default_branch_camel: None,
                remote_url_snake: None,
                remote_url_camel: None,
                workspace_policy_snake: None,
                workspace_policy_camel: None,
            },
        )
        .await
        .is_err());

        delete_project_record(&pool, &created.id).await.unwrap();
        assert!(list_project_records(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn assign_collection_links_and_unlinks() {
        let pool = test_pool().await;
        let project = save_project_record(
            &pool,
            SaveProjectPayload {
                id: None,
                name: "P".to_string(),
                description: None,
                environment: None,
                color: None,
                repository_root_snake: None,
                repository_root_camel: None,
                default_branch_snake: None,
                default_branch_camel: None,
                remote_url_snake: None,
                remote_url_camel: None,
                workspace_policy_snake: None,
                workspace_policy_camel: None,
            },
        )
        .await
        .unwrap();
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        sqlx::query(
            "INSERT INTO collections (id, workspace_id, name, created_at) VALUES (?, 'default', 'C', ?)",
        )
        .bind("col-1")
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        assign_collection_record(&pool, "col-1", Some(&project.id))
            .await
            .unwrap();
        let refreshed = get_project_record(&pool, &project.id).await.unwrap().unwrap();
        assert_eq!(refreshed.collection_ids, vec!["col-1".to_string()]);

        assign_collection_record(&pool, "col-1", None).await.unwrap();
        let refreshed = get_project_record(&pool, &project.id).await.unwrap().unwrap();
        assert!(refreshed.collection_ids.is_empty());

        assert!(assign_collection_record(&pool, "col-1", Some("missing"))
            .await
            .is_err());
        assert!(assign_collection_record(&pool, "missing", Some(&project.id))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn delete_project_unlinks_collections() {
        let pool = test_pool().await;
        let project = save_project_record(
            &pool,
            SaveProjectPayload {
                id: None,
                name: "P".to_string(),
                description: None,
                environment: None,
                color: None,
                repository_root_snake: None,
                repository_root_camel: None,
                default_branch_snake: None,
                default_branch_camel: None,
                remote_url_snake: None,
                remote_url_camel: None,
                workspace_policy_snake: None,
                workspace_policy_camel: None,
            },
        )
        .await
        .unwrap();
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        sqlx::query(
            "INSERT INTO collections (id, workspace_id, name, project_id, created_at) VALUES (?, 'default', 'C', ?, ?)",
        )
        .bind("col-9")
        .bind(&project.id)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();
        delete_project_record(&pool, &project.id).await.unwrap();
        let orphan: Option<String> =
            sqlx::query_scalar("SELECT project_id FROM collections WHERE id = 'col-9'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(orphan.is_none());
    }
}
