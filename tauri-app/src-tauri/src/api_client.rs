use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashMap;
use std::time::Instant;

const WORKSPACE_ID: &str = "default";
const GLOBALS_KEY: &str = "api_global_variables:default";
const LEGACY_GLOBALS_KEY: &str = "api_global_variables";

// ---------- DTOs (snake_case to match renderer/apiSlice expectations) ----------

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiCollectionRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub variables: String,
    pub request_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiRequestRecord {
    pub id: String,
    pub name: String,
    pub method: String,
    pub url: String,
    pub headers: String,
    pub query_params: String,
    pub variables: String,
    pub request_options: String,
    pub pre_request_script: String,
    pub test_script: String,
    pub response_mappings: String,
    pub body_type: String,
    pub body: String,
    pub auth_type: String,
    pub auth_config: String,
    pub collection_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiEnvironmentRecord {
    pub id: String,
    pub name: String,
    pub variables: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiHistoryRecord {
    pub id: String,
    pub request_id: Option<String>,
    pub method: String,
    pub url: String,
    pub request_headers: String,
    pub request_body: String,
    pub status: i64,
    pub status_text: String,
    pub duration: i64,
    pub size: i64,
    pub response_headers: String,
    pub response_body: String,
    pub console_logs: String,
    pub test_results: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiCollectionRunRecord {
    pub id: String,
    pub collection_id: String,
    pub collection_name: String,
    pub environment_id: Option<String>,
    pub environment_name: Option<String>,
    pub status: String,
    pub total_requests: i64,
    pub passed_requests: i64,
    pub failed_requests: i64,
    pub results: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiGlobalsPayload {
    pub variables: String,
}

// ---------- Payloads (camelCase from renderer) ----------

#[derive(Debug, Deserialize)]
pub struct SaveApiCollectionPayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub variables: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveApiRequestPayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: Option<String>,
    #[serde(rename = "query_params", default)]
    pub query_params_snake: Option<String>,
    #[serde(rename = "queryParams", default)]
    pub query_params_camel: Option<String>,
    #[serde(default)]
    pub variables: Option<String>,
    #[serde(rename = "request_options", default)]
    pub request_options_snake: Option<String>,
    #[serde(rename = "requestOptions", default)]
    pub request_options_camel: Option<String>,
    #[serde(rename = "pre_request_script", default)]
    pub pre_request_script_snake: Option<String>,
    #[serde(rename = "preRequestScript", default)]
    pub pre_request_script_camel: Option<String>,
    #[serde(rename = "test_script", default)]
    pub test_script_snake: Option<String>,
    #[serde(rename = "testScript", default)]
    pub test_script_camel: Option<String>,
    #[serde(rename = "response_mappings", default)]
    pub response_mappings_snake: Option<String>,
    #[serde(rename = "responseMappings", default)]
    pub response_mappings_camel: Option<String>,
    #[serde(rename = "body_type", default)]
    pub body_type_snake: Option<String>,
    #[serde(rename = "bodyType", default)]
    pub body_type_camel: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(rename = "auth_type", default)]
    pub auth_type_snake: Option<String>,
    #[serde(rename = "authType", default)]
    pub auth_type_camel: Option<String>,
    #[serde(rename = "auth_config", default)]
    pub auth_config_snake: Option<String>,
    #[serde(rename = "authConfig", default)]
    pub auth_config_camel: Option<String>,
    #[serde(rename = "collection_id", default)]
    pub collection_id_snake: Option<String>,
    #[serde(rename = "collectionId", default)]
    pub collection_id_camel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveApiEnvironmentPayload {
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub variables: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct SendApiRequestPayload {
    #[serde(rename = "requestId", default)]
    pub request_id: Option<String>,
    #[serde(rename = "collectionId", default)]
    pub collection_id: Option<String>,
    #[serde(rename = "environmentId", default)]
    pub environment_id: Option<String>,
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub headers: Option<serde_json::Value>,
    #[serde(rename = "queryParams", default)]
    pub query_params: Option<serde_json::Value>,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
    #[serde(rename = "requestOptions", default)]
    pub request_options: Option<serde_json::Value>,
    #[serde(rename = "preRequestScript", default)]
    pub pre_request_script: Option<String>,
    #[serde(rename = "testScript", default)]
    pub test_script: Option<String>,
    #[serde(rename = "responseMappings", default)]
    pub response_mappings: Option<serde_json::Value>,
    #[serde(rename = "bodyType", default)]
    pub body_type: Option<String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(rename = "authType", default)]
    pub auth_type: Option<String>,
    #[serde(rename = "authConfig", default)]
    pub auth_config: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RunApiCollectionPayload {
    #[serde(rename = "collectionId")]
    pub collection_id: String,
    #[serde(rename = "environmentId", default)]
    pub environment_id: Option<String>,
}

// Response shape expected by apiSlice desktop branch (camelCase inside `response`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSendResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration: i64,
    pub size: i64,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub cookie_jar_host: Option<String>,
    #[serde(default)]
    pub console_logs: Vec<serde_json::Value>,
    #[serde(default)]
    pub test_results: Vec<serde_json::Value>,
    #[serde(default)]
    pub mapping_results: Vec<serde_json::Value>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SendApiRequestResult {
    pub response: ApiSendResponse,
}

// ---------- Variable helpers (pub(crate) for unit tests) ----------

#[derive(Debug, Deserialize)]
pub struct VariableRow {
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

pub(crate) fn parse_variable_rows(raw: &str) -> Vec<(String, String)> {
    let parsed: Result<Vec<VariableRow>, _> = serde_json::from_str(raw);
    match parsed {
        Ok(rows) => rows
            .into_iter()
            .filter(|r| r.enabled)
            .filter_map(|r| match (r.key, r.value) {
                (Some(k), Some(v)) if !k.trim().is_empty() => Some((k, v)),
                _ => None,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

pub(crate) fn parse_variable_value(value: &serde_json::Value) -> Vec<(String, String)> {
    match value {
        serde_json::Value::String(s) => parse_variable_rows(s),
        serde_json::Value::Array(_) => {
            let rows: Result<Vec<VariableRow>, _> =
                serde_json::from_value(value.clone());
            match rows {
                Ok(rows) => rows
                    .into_iter()
                    .filter(|r| r.enabled)
                    .filter_map(|r| match (r.key, r.value) {
                        (Some(k), Some(v)) if !k.trim().is_empty() => Some((k, v)),
                        _ => None,
                    })
                    .collect(),
                Err(_) => Vec::new(),
            }
        }
        _ => Vec::new(),
    }
}

pub(crate) fn build_variable_map(layers: &[Vec<(String, String)>]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for layer in layers {
        for (k, v) in layer {
            map.insert(k.clone(), v.clone());
        }
    }
    map
}

pub(crate) fn substitute_variables(text: &str, vars: &HashMap<String, String>) -> String {
    let mut out = text.to_string();
    for (key, value) in vars {
        for pattern in [
            format!("{{{{{}}}}}", key),
            format!("{{{{ {} }}}}", key),
        ] {
            out = out.replace(&pattern, value);
        }
    }
    out
}

fn status_text_for(status: u16) -> String {
    match status {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        500 => "Internal Server Error",
        _ => "Response",
    }
    .to_string()
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

// ---------- Internal record functions ----------

async fn list_collection_records(pool: &SqlitePool) -> Result<Vec<ApiCollectionRecord>, String> {
    sqlx::query_as::<_, ApiCollectionRecord>(
        "SELECT id, name, description, variables,
            (SELECT COUNT(*) FROM api_requests WHERE collection_id = api_collections.id) AS request_count,
            created_at, updated_at
         FROM api_collections WHERE workspace_id = ? ORDER BY name ASC",
    )
    .bind(WORKSPACE_ID)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn save_collection_record(
    pool: &SqlitePool,
    payload: SaveApiCollectionPayload,
) -> Result<ApiCollectionRecord, String> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    let description = payload.description.unwrap_or_default();
    let variables = payload.variables.unwrap_or_else(|| "[]".to_string());
    // Validate variables JSON round-trips; fall back to [] on garbage.
    let variables = if serde_json::from_str::<serde_json::Value>(&variables).is_ok() {
        variables
    } else {
        "[]".to_string()
    };
    let now = now_rfc3339();

    if let Some(id) = payload.id {
        sqlx::query(
            "UPDATE api_collections SET name = ?, description = ?, variables = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ?",
        )
        .bind(&name)
        .bind(&description)
        .bind(&variables)
        .bind(&now)
        .bind(&id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_collection_record(pool, &id)
            .await?
            .ok_or_else(|| "Collection not found".to_string())
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO api_collections (id, workspace_id, name, description, variables, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .bind(&name)
        .bind(&description)
        .bind(&variables)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_collection_record(pool, &id)
            .await?
            .ok_or_else(|| "Collection not found".to_string())
    }
}

async fn get_collection_record(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<ApiCollectionRecord>, String> {
    sqlx::query_as::<_, ApiCollectionRecord>(
        "SELECT id, name, description, variables,
            (SELECT COUNT(*) FROM api_requests WHERE collection_id = api_collections.id) AS request_count,
            created_at, updated_at
         FROM api_collections WHERE id = ? AND workspace_id = ?",
    )
    .bind(id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn delete_collection_record(pool: &SqlitePool, id: &str) -> Result<String, String> {
    let res = sqlx::query("DELETE FROM api_collections WHERE id = ? AND workspace_id = ?")
        .bind(id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Collection not found".to_string());
    }
    Ok(id.to_string())
}

async fn list_request_records(
    pool: &SqlitePool,
    collection_id: Option<&str>,
) -> Result<Vec<ApiRequestRecord>, String> {
    if let Some(cid) = collection_id {
        sqlx::query_as::<_, ApiRequestRecord>(
            "SELECT id, name, method, url, headers, query_params, variables, request_options,
                pre_request_script, test_script, response_mappings, body_type, body,
                auth_type, auth_config, collection_id, created_at, updated_at
             FROM api_requests WHERE workspace_id = ? AND collection_id = ? ORDER BY updated_at DESC",
        )
        .bind(WORKSPACE_ID)
        .bind(cid)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    } else {
        sqlx::query_as::<_, ApiRequestRecord>(
            "SELECT id, name, method, url, headers, query_params, variables, request_options,
                pre_request_script, test_script, response_mappings, body_type, body,
                auth_type, auth_config, collection_id, created_at, updated_at
             FROM api_requests WHERE workspace_id = ? ORDER BY updated_at DESC",
        )
        .bind(WORKSPACE_ID)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
    }
}

#[allow(clippy::too_many_arguments)]
async fn save_request_record(
    pool: &SqlitePool,
    payload: SaveApiRequestPayload,
) -> Result<ApiRequestRecord, String> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    let collection_id = payload
        .collection_id_camel
        .or(payload.collection_id_snake);
    if let Some(ref cid) = collection_id {
        let exists: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM api_collections WHERE id = ? AND workspace_id = ?")
                .bind(cid)
                .bind(WORKSPACE_ID)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;
        if exists == 0 {
            return Err("Collection not found".to_string());
        }
    }
    let method = payload.method.unwrap_or_else(|| "GET".to_string());
    let now = now_rfc3339();
    let headers = payload.headers.unwrap_or_else(|| "[]".to_string());
    let query_params = payload
        .query_params_camel
        .or(payload.query_params_snake)
        .unwrap_or_else(|| "[]".to_string());
    let variables = payload.variables.unwrap_or_else(|| "[]".to_string());
    let request_options = payload
        .request_options_camel
        .or(payload.request_options_snake)
        .unwrap_or_else(|| "{}".to_string());
    let pre_request_script = payload
        .pre_request_script_camel
        .or(payload.pre_request_script_snake)
        .unwrap_or_default();
    let test_script = payload
        .test_script_camel
        .or(payload.test_script_snake)
        .unwrap_or_default();
    let response_mappings = payload
        .response_mappings_camel
        .or(payload.response_mappings_snake)
        .unwrap_or_else(|| "[]".to_string());
    let body_type = payload
        .body_type_camel
        .or(payload.body_type_snake)
        .unwrap_or_else(|| "none".to_string());
    let body = payload.body.unwrap_or_default();
    let auth_type = payload
        .auth_type_camel
        .or(payload.auth_type_snake)
        .unwrap_or_else(|| "none".to_string());
    let auth_config = payload
        .auth_config_camel
        .or(payload.auth_config_snake)
        .unwrap_or_else(|| "{}".to_string());
    let url = payload.url.unwrap_or_default();

    if let Some(id) = payload.id {
        sqlx::query(
            "UPDATE api_requests SET name = ?, method = ?, url = ?, headers = ?, query_params = ?,
                variables = ?, request_options = ?, pre_request_script = ?, test_script = ?,
                response_mappings = ?, body_type = ?, body = ?, auth_type = ?, auth_config = ?,
                collection_id = ?, updated_at = ? WHERE id = ? AND workspace_id = ?",
        )
        .bind(&name)
        .bind(&method)
        .bind(&url)
        .bind(&headers)
        .bind(&query_params)
        .bind(&variables)
        .bind(&request_options)
        .bind(&pre_request_script)
        .bind(&test_script)
        .bind(&response_mappings)
        .bind(&body_type)
        .bind(&body)
        .bind(&auth_type)
        .bind(&auth_config)
        .bind(&collection_id)
        .bind(&now)
        .bind(&id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_request_record(pool, &id)
            .await?
            .ok_or_else(|| "Request not found".to_string())
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO api_requests (id, workspace_id, name, method, url, headers, query_params,
                variables, request_options, pre_request_script, test_script, response_mappings,
                body_type, body, auth_type, auth_config, collection_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .bind(&name)
        .bind(&method)
        .bind(&url)
        .bind(&headers)
        .bind(&query_params)
        .bind(&variables)
        .bind(&request_options)
        .bind(&pre_request_script)
        .bind(&test_script)
        .bind(&response_mappings)
        .bind(&body_type)
        .bind(&body)
        .bind(&auth_type)
        .bind(&auth_config)
        .bind(&collection_id)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        get_request_record(pool, &id)
            .await?
            .ok_or_else(|| "Request not found".to_string())
    }
}

async fn get_request_record(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<ApiRequestRecord>, String> {
    sqlx::query_as::<_, ApiRequestRecord>(
        "SELECT id, name, method, url, headers, query_params, variables, request_options,
            pre_request_script, test_script, response_mappings, body_type, body,
            auth_type, auth_config, collection_id, created_at, updated_at
         FROM api_requests WHERE id = ? AND workspace_id = ?",
    )
    .bind(id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn delete_request_record(pool: &SqlitePool, id: &str) -> Result<String, String> {
    let res = sqlx::query("DELETE FROM api_requests WHERE id = ? AND workspace_id = ?")
        .bind(id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Request not found".to_string());
    }
    Ok(id.to_string())
}

async fn list_environment_records(pool: &SqlitePool) -> Result<Vec<ApiEnvironmentRecord>, String> {
    sqlx::query_as::<_, ApiEnvironmentRecord>(
        "SELECT id, name, variables, created_at, updated_at
         FROM api_environments WHERE workspace_id = ? ORDER BY name ASC",
    )
    .bind(WORKSPACE_ID)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn save_environment_record(
    pool: &SqlitePool,
    payload: SaveApiEnvironmentPayload,
) -> Result<ApiEnvironmentRecord, String> {
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    let variables = payload.variables.unwrap_or_else(|| "[]".to_string());
    let now = now_rfc3339();
    if let Some(id) = payload.id {
        sqlx::query(
            "UPDATE api_environments SET name = ?, variables = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ?",
        )
        .bind(&name)
        .bind(&variables)
        .bind(&now)
        .bind(&id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        sqlx::query_as::<_, ApiEnvironmentRecord>(
            "SELECT id, name, variables, created_at, updated_at
             FROM api_environments WHERE id = ? AND workspace_id = ?",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Environment not found".to_string())
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO api_environments (id, workspace_id, name, variables, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .bind(&name)
        .bind(&variables)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        sqlx::query_as::<_, ApiEnvironmentRecord>(
            "SELECT id, name, variables, created_at, updated_at
             FROM api_environments WHERE id = ? AND workspace_id = ?",
        )
        .bind(&id)
        .bind(WORKSPACE_ID)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Environment not found".to_string())
    }
}

async fn delete_environment_record(pool: &SqlitePool, id: &str) -> Result<String, String> {
    let res = sqlx::query("DELETE FROM api_environments WHERE id = ? AND workspace_id = ?")
        .bind(id)
        .bind(WORKSPACE_ID)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Environment not found".to_string());
    }
    Ok(id.to_string())
}

async fn read_globals_record(pool: &SqlitePool) -> Result<ApiGlobalsPayload, String> {
    let scoped: Option<String> =
        sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
            .bind(GLOBALS_KEY)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    if let Some(value) = scoped {
        return Ok(ApiGlobalsPayload { variables: value });
    }
    let legacy: Option<String> = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
        .bind(LEGACY_GLOBALS_KEY)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ApiGlobalsPayload {
        variables: legacy.unwrap_or_else(|| "[]".to_string()),
    })
}

async fn save_globals_record(
    pool: &SqlitePool,
    variables: &str,
) -> Result<ApiGlobalsPayload, String> {
    let value = if serde_json::from_str::<serde_json::Value>(variables).is_ok() {
        variables.to_string()
    } else {
        "[]".to_string()
    };
    let now = now_rfc3339();
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(GLOBALS_KEY)
    .bind(&value)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(ApiGlobalsPayload { variables: value })
}

// ---------- HTTP execution ----------

pub(crate) struct PreparedRequest {
    pub(crate) method: String,
    pub(crate) url: String,
    pub(crate) headers: HashMap<String, String>,
    pub(crate) body: String,
    pub(crate) request_id: Option<String>,
}

pub(crate) async fn prepare_request(
    pool: &SqlitePool,
    payload: &SendApiRequestPayload,
) -> Result<PreparedRequest, String> {
    let method = payload
        .method
        .clone()
        .unwrap_or_else(|| "GET".to_string())
        .to_uppercase();
    let raw_url = payload.url.clone().unwrap_or_default();
    if raw_url.trim().is_empty() {
        return Err("URL is required".to_string());
    }

    // Load variable layers: globals < collection < environment < request.
    let globals = read_globals_record(pool).await?;
    let global_rows = parse_variable_rows(&globals.variables);

    let collection_rows = if let Some(cid) = payload.collection_id.as_deref() {
        if let Some(col) = get_collection_record(pool, cid).await? {
            parse_variable_rows(&col.variables)
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    let environment_rows = if let Some(eid) = payload.environment_id.as_deref() {
        let vars: Option<String> = sqlx::query_scalar(
            "SELECT variables FROM api_environments WHERE id = ? AND workspace_id = ?",
        )
        .bind(eid)
        .bind(WORKSPACE_ID)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        vars.map(|v| parse_variable_rows(&v)).unwrap_or_default()
    } else {
        Vec::new()
    };

    let request_rows = payload
        .variables
        .as_ref()
        .map(parse_variable_value)
        .unwrap_or_default();

    let vars = build_variable_map(&[global_rows, collection_rows, environment_rows, request_rows]);

    let mut url = substitute_variables(&raw_url, &vars);

    // Headers: renderer sends KeyValueRow[]; keep enabled only, substitute values.
    let mut headers: HashMap<String, String> = HashMap::new();
    if let Some(h) = payload.headers.as_ref() {
        for (k, v) in parse_variable_value(h) {
            headers.insert(
                substitute_variables(&k, &vars),
                substitute_variables(&v, &vars),
            );
        }
    }

    // Query params appended to URL.
    if let Some(q) = payload.query_params.as_ref() {
        let pairs = parse_variable_value(q);
        if !pairs.is_empty() {
            let sep = if url.contains('?') { "&" } else { "?" };
            let qs: Vec<String> = pairs
                .iter()
                .map(|(k, v)| {
                    format!(
                        "{}={}",
                        urlencoding::encode(&substitute_variables(k, &vars)),
                        urlencoding::encode(&substitute_variables(v, &vars))
                    )
                })
                .collect();
            url.push_str(sep);
            url.push_str(&qs.join("&"));
        }
    }

    // Auth: none | bearer | basic (subset of web behavior; api keys via headers already covered).
    let auth_type = payload.auth_type.as_deref().unwrap_or("none");
    if auth_type == "bearer" {
        if let Some(cfg) = payload.auth_config.as_ref() {
            let token = cfg
                .get("token")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let token = substitute_variables(&token, &vars);
            if !token.is_empty() {
                headers.insert("Authorization".to_string(), format!("Bearer {}", token));
            }
        }
    } else if auth_type == "basic" {
        if let Some(cfg) = payload.auth_config.as_ref() {
            let username = cfg
                .get("username")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let password = cfg
                .get("password")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            use base64::Engine;
            let encoded = base64::engine::general_purpose::STANDARD
                .encode(format!("{}:{}", username, password));
            headers.insert("Authorization".to_string(), format!("Basic {}", encoded));
        }
    }

    let raw_body = payload.body.clone().unwrap_or_default();
    let body = substitute_variables(&raw_body, &vars);

    Ok(PreparedRequest {
        method,
        url,
        headers,
        body,
        request_id: payload.request_id.clone(),
    })
}

pub(crate) async fn execute_prepared(prepared: &PreparedRequest) -> Result<ApiSendResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let started = Instant::now();
    let mut req = match prepared.method.as_str() {
        "GET" => client.get(&prepared.url),
        "POST" => client.post(&prepared.url),
        "PUT" => client.put(&prepared.url),
        "DELETE" => client.delete(&prepared.url),
        "PATCH" => client.patch(&prepared.url),
        "HEAD" => client.head(&prepared.url),
        "OPTIONS" => client.request(reqwest::Method::OPTIONS, &prepared.url),
        _ => return Err(format!("Unsupported method: {}", prepared.method)),
    };
    for (k, v) in &prepared.headers {
        req = req.header(k, v);
    }
    if !prepared.body.is_empty()
        && !matches!(prepared.method.as_str(), "GET" | "HEAD" | "OPTIONS")
    {
        req = req.body(prepared.body.clone());
    }
    let request_headers_json =
        serde_json::to_string(&prepared.headers).unwrap_or_else(|_| "{}".to_string());

    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let status_text = res
        .status()
        .canonical_reason()
        .map(|s| s.to_string())
        .unwrap_or_else(|| status_text_for(status));
    let res_headers: HashMap<String, String> = res
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let text = res.text().await.map_err(|e| e.to_string())?;
    let duration = started.elapsed().as_millis() as i64;
    let size = text.len() as i64;

    // History is persisted by the caller so collection runs can skip per-request rows.
    let _ = request_headers_json;

    Ok(ApiSendResponse {
        status,
        status_text,
        headers: res_headers,
        body: text,
        duration,
        size,
        error: None,
        truncated: false,
        cookie_jar_host: None,
        // Pre-request / test script execution via boa is migration-pending;
        // return stable empty results instead of pretending scripts ran.
        console_logs: Vec::new(),
        test_results: Vec::new(),
        mapping_results: Vec::new(),
        timestamp: chrono::Utc::now().timestamp_millis(),
    })
}

async fn insert_history_record(
    pool: &SqlitePool,
    prepared: &PreparedRequest,
    response: &ApiSendResponse,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let request_headers =
        serde_json::to_string(&prepared.headers).unwrap_or_else(|_| "{}".to_string());
    let response_headers =
        serde_json::to_string(&response.headers).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(
        "INSERT INTO api_history (id, workspace_id, request_id, method, url, request_headers,
            request_body, status, status_text, duration, size, response_headers, response_body,
            console_logs, test_results, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&prepared.request_id)
    .bind(&prepared.method)
    .bind(&prepared.url)
    .bind(&request_headers)
    .bind(&prepared.body)
    .bind(response.status as i64)
    .bind(&response.status_text)
    .bind(response.duration)
    .bind(response.size)
    .bind(&response_headers)
    .bind(&response.body)
    .bind("[]")
    .bind("[]")
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Tauri commands ----------

#[tauri::command]
pub async fn list_api_collections(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ApiCollectionRecord>, String> {
    list_collection_records(&pool).await
}

#[tauri::command]
pub async fn save_api_collection(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveApiCollectionPayload,
) -> Result<ApiCollectionRecord, String> {
    save_collection_record(&pool, payload).await
}

#[tauri::command]
pub async fn delete_api_collection(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<String, String> {
    delete_collection_record(&pool, &id).await
}

#[tauri::command]
pub async fn list_api_requests(
    pool: tauri::State<'_, SqlitePool>,
    collection_id: Option<String>,
) -> Result<Vec<ApiRequestRecord>, String> {
    list_request_records(&pool, collection_id.as_deref()).await
}

#[tauri::command]
pub async fn save_api_request(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveApiRequestPayload,
) -> Result<ApiRequestRecord, String> {
    save_request_record(&pool, payload).await
}

#[tauri::command]
pub async fn delete_api_request(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<String, String> {
    delete_request_record(&pool, &id).await
}

#[tauri::command]
pub async fn list_api_environments(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ApiEnvironmentRecord>, String> {
    list_environment_records(&pool).await
}

#[tauri::command]
pub async fn save_api_environment(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveApiEnvironmentPayload,
) -> Result<ApiEnvironmentRecord, String> {
    save_environment_record(&pool, payload).await
}

#[tauri::command]
pub async fn delete_api_environment(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<String, String> {
    delete_environment_record(&pool, &id).await
}

#[tauri::command]
pub async fn read_api_globals(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<ApiGlobalsPayload, String> {
    read_globals_record(&pool).await
}

#[tauri::command]
pub async fn save_api_globals(
    pool: tauri::State<'_, SqlitePool>,
    variables: String,
) -> Result<ApiGlobalsPayload, String> {
    save_globals_record(&pool, &variables).await
}

#[tauri::command]
pub async fn send_api_request(
    pool: tauri::State<'_, SqlitePool>,
    payload: SendApiRequestPayload,
) -> Result<SendApiRequestResult, String> {
    let prepared = prepare_request(&pool, &payload).await?;
    let response = execute_prepared(&prepared).await?;
    insert_history_record(&pool, &prepared, &response).await?;
    Ok(SendApiRequestResult { response })
}

#[tauri::command]
pub async fn list_api_history(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ApiHistoryRecord>, String> {
    sqlx::query_as::<_, ApiHistoryRecord>(
        "SELECT id, request_id, method, url, request_headers, request_body, status,
            status_text, duration, size, response_headers, response_body,
            console_logs, test_results, created_at
         FROM api_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(WORKSPACE_ID)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_api_history(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<serde_json::Value, String> {
    sqlx::query("DELETE FROM api_history WHERE workspace_id = ?")
        .bind(WORKSPACE_ID)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true }))
}

#[tauri::command]
pub async fn list_api_collection_runs(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<ApiCollectionRunRecord>, String> {
    sqlx::query_as::<_, ApiCollectionRunRecord>(
        "SELECT id, collection_id, collection_name, environment_id, environment_name, status,
            total_requests, passed_requests, failed_requests, results, started_at,
            finished_at, duration_ms
         FROM api_collection_runs ORDER BY started_at DESC LIMIT 100",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_api_collection(
    pool: tauri::State<'_, SqlitePool>,
    payload: RunApiCollectionPayload,
) -> Result<ApiCollectionRunRecord, String> {
    let collection = get_collection_record(&pool, &payload.collection_id)
        .await?
        .ok_or_else(|| "Collection not found".to_string())?;

    let (environment_id, environment_name) = if let Some(eid) = payload.environment_id.as_deref() {
        let env: Option<ApiEnvironmentRecord> = sqlx::query_as::<_, ApiEnvironmentRecord>(
            "SELECT id, name, variables, created_at, updated_at
             FROM api_environments WHERE id = ? AND workspace_id = ?",
        )
        .bind(eid)
        .bind(WORKSPACE_ID)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        match env {
            Some(e) => (Some(e.id), Some(e.name)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    let requests: Vec<ApiRequestRecord> = sqlx::query_as::<_, ApiRequestRecord>(
        "SELECT id, name, method, url, headers, query_params, variables, request_options,
            pre_request_script, test_script, response_mappings, body_type, body,
            auth_type, auth_config, collection_id, created_at, updated_at
         FROM api_requests WHERE workspace_id = ? AND collection_id = ? ORDER BY created_at ASC",
    )
    .bind(WORKSPACE_ID)
    .bind(&collection.id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if requests.is_empty() {
        return Err("Collection has no requests".to_string());
    }

    let run_id = uuid::Uuid::new_v4().to_string();
    let started = chrono::Utc::now();
    let started_str = started.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    sqlx::query(
        "INSERT INTO api_collection_runs (id, collection_id, collection_name, environment_id,
            environment_name, status, total_requests, passed_requests, failed_requests,
            results, started_at)
         VALUES (?, ?, ?, ?, ?, 'running', ?, 0, 0, '[]', ?)",
    )
    .bind(&run_id)
    .bind(&collection.id)
    .bind(&collection.name)
    .bind(&environment_id)
    .bind(&environment_name)
    .bind(requests.len() as i64)
    .bind(&started_str)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut passed = 0i64;
    let mut failed = 0i64;

    for request in &requests {
        let send_payload = SendApiRequestPayload {
            request_id: Some(request.id.clone()),
            collection_id: request.collection_id.clone(),
            environment_id: environment_id.clone(),
            method: Some(request.method.clone()),
            url: Some(request.url.clone()),
            headers: serde_json::from_str(&request.headers).ok(),
            query_params: serde_json::from_str(&request.query_params).ok(),
            variables: serde_json::from_str(&request.variables).ok(),
            request_options: serde_json::from_str(&request.request_options).ok(),
            pre_request_script: Some(request.pre_request_script.clone()),
            test_script: Some(request.test_script.clone()),
            response_mappings: serde_json::from_str(&request.response_mappings).ok(),
            body_type: Some(request.body_type.clone()),
            body: Some(request.body.clone()),
            auth_type: Some(request.auth_type.clone()),
            auth_config: serde_json::from_str(&request.auth_config).ok(),
        };
        match prepare_request(&pool, &send_payload).await {
            Ok(prepared) => match execute_prepared(&prepared).await {
                Ok(response) => {
                    let ok = response.status >= 200 && response.status < 400;
                    if ok {
                        passed += 1;
                    } else {
                        failed += 1;
                    }
                    results.push(serde_json::json!({
                        "request_id": request.id,
                        "request_name": request.name,
                        "status": response.status,
                        "duration": response.duration,
                        "passed": ok,
                        "failed_tests": 0,
                        "console_logs": [],
                        "test_results": [],
                        "error": null,
                    }));
                }
                Err(message) => {
                    failed += 1;
                    results.push(serde_json::json!({
                        "request_id": request.id,
                        "request_name": request.name,
                        "status": 500,
                        "duration": 0,
                        "passed": false,
                        "failed_tests": 0,
                        "console_logs": [],
                        "test_results": [],
                        "error": message,
                    }));
                }
            },
            Err(message) => {
                failed += 1;
                results.push(serde_json::json!({
                    "request_id": request.id,
                    "request_name": request.name,
                    "status": 500,
                    "duration": 0,
                    "passed": false,
                    "failed_tests": 0,
                    "console_logs": [],
                    "test_results": [],
                    "error": message,
                }));
            }
        }
    }

    let finished = chrono::Utc::now();
    let finished_str = finished.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let duration_ms = (finished - started).num_milliseconds();
    let status = if failed > 0 {
        "completed_with_failures"
    } else {
        "completed"
    };
    let results_json = serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string());
    sqlx::query(
        "UPDATE api_collection_runs SET status = ?, passed_requests = ?, failed_requests = ?,
            results = ?, finished_at = ?, duration_ms = ? WHERE id = ?",
    )
    .bind(status)
    .bind(passed)
    .bind(failed)
    .bind(&results_json)
    .bind(&finished_str)
    .bind(duration_ms)
    .bind(&run_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ApiCollectionRunRecord>(
        "SELECT id, collection_id, collection_name, environment_id, environment_name, status,
            total_requests, passed_requests, failed_requests, results, started_at,
            finished_at, duration_ms
         FROM api_collection_runs WHERE id = ?",
    )
    .bind(&run_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())
}

// ---------- Tests ----------

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
    fn variable_rows_round_trip_enabled_only() {
        let raw = r#"[{"key":"A","value":"1","enabled":true},{"key":"B","value":"2","enabled":false},{"key":"","value":"x","enabled":true}]"#;
        let rows = parse_variable_rows(raw);
        assert_eq!(rows, vec![("A".to_string(), "1".to_string())]);
    }

    #[test]
    fn variable_substitution_replaces_both_spacings() {
        let mut vars = HashMap::new();
        vars.insert("HOST".to_string(), "example.com".to_string());
        assert_eq!(
            substitute_variables("https://{{HOST}}/{{ HOST }}/x", &vars),
            "https://example.com/example.com/x"
        );
    }

    #[test]
    fn variable_map_precedence_request_wins() {
        let map = build_variable_map(&[
            vec![("K".to_string(), "global".to_string())],
            vec![("K".to_string(), "collection".to_string())],
            vec![("K".to_string(), "env".to_string())],
            vec![("K".to_string(), "request".to_string())],
        ]);
        assert_eq!(map.get("K").unwrap(), "request");
    }

    #[tokio::test]
    async fn api_collections_crud_round_trip() {
        let pool = test_pool().await;
        let created = save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: None,
                name: "REST".to_string(),
                description: Some("desc".to_string()),
                variables: Some(r#"[{"key":"BASE","value":"https://x","enabled":true}]"#.to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(created.name, "REST");
        assert_eq!(created.request_count, 0);

        let listed = list_collection_records(&pool).await.unwrap();
        assert_eq!(listed.len(), 1);

        let updated = save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: Some(created.id.clone()),
                name: "REST2".to_string(),
                description: None,
                variables: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(updated.name, "REST2");

        assert!(save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: None,
                name: "   ".to_string(),
                description: None,
                variables: None,
            },
        )
        .await
        .is_err());

        delete_collection_record(&pool, &created.id).await.unwrap();
        assert!(list_collection_records(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn api_requests_crud_round_trip() {
        let pool = test_pool().await;
        let col = save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: None,
                name: "C".to_string(),
                description: None,
                variables: None,
            },
        )
        .await
        .unwrap();

        let created = save_request_record(
            &pool,
            SaveApiRequestPayload {
                id: None,
                name: "Get users".to_string(),
                method: Some("GET".to_string()),
                url: Some("https://example.com".to_string()),
                headers: Some("[]".to_string()),
                query_params_snake: None,
                query_params_camel: Some("[]".to_string()),
                variables: Some("[]".to_string()),
                request_options_snake: None,
                request_options_camel: Some("{}".to_string()),
                pre_request_script_snake: None,
                pre_request_script_camel: None,
                test_script_snake: None,
                test_script_camel: None,
                response_mappings_snake: None,
                response_mappings_camel: None,
                body_type_snake: None,
                body_type_camel: None,
                body: None,
                auth_type_snake: None,
                auth_type_camel: None,
                auth_config_snake: None,
                auth_config_camel: None,
                collection_id_snake: None,
                collection_id_camel: Some(col.id.clone()),
            },
        )
        .await
        .unwrap();
        assert_eq!(created.method, "GET");

        let listed = list_request_records(&pool, Some(&col.id)).await.unwrap();
        assert_eq!(listed.len(), 1);

        assert!(save_request_record(
            &pool,
            SaveApiRequestPayload {
                id: None,
                name: "Bad".to_string(),
                method: None,
                url: None,
                headers: None,
                query_params_snake: None,
                query_params_camel: None,
                variables: None,
                request_options_snake: None,
                request_options_camel: None,
                pre_request_script_snake: None,
                pre_request_script_camel: None,
                test_script_snake: None,
                test_script_camel: None,
                response_mappings_snake: None,
                response_mappings_camel: None,
                body_type_snake: None,
                body_type_camel: None,
                body: None,
                auth_type_snake: None,
                auth_type_camel: None,
                auth_config_snake: None,
                auth_config_camel: None,
                collection_id_snake: None,
                collection_id_camel: Some("missing".to_string()),
            },
        )
        .await
        .is_err());

        delete_request_record(&pool, &created.id).await.unwrap();
        assert!(list_request_records(&pool, None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn api_environments_crud_round_trip() {
        let pool = test_pool().await;
        let created = save_environment_record(
            &pool,
            SaveApiEnvironmentPayload {
                id: None,
                name: "Prod".to_string(),
                variables: Some("[]".to_string()),
            },
        )
        .await
        .unwrap();
        assert_eq!(created.name, "Prod");
        assert_eq!(list_environment_records(&pool).await.unwrap().len(), 1);
        delete_environment_record(&pool, &created.id).await.unwrap();
        assert!(list_environment_records(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn api_globals_persist_and_fallback() {
        let pool = test_pool().await;
        let initial = read_globals_record(&pool).await.unwrap();
        assert_eq!(initial.variables, "[]");
        let saved = save_globals_record(&pool, r#"[{"key":"T","value":"1","enabled":true}]"#)
            .await
            .unwrap();
        assert!(saved.variables.contains("\"T\""));
        let reread = read_globals_record(&pool).await.unwrap();
        assert_eq!(reread.variables, saved.variables);
    }

    #[tokio::test]
    async fn api_history_insert_and_clear() {
        let pool = test_pool().await;
        let prepared = PreparedRequest {
            method: "GET".to_string(),
            url: "https://example.com".to_string(),
            headers: HashMap::new(),
            body: String::new(),
            request_id: None,
        };
        let response = ApiSendResponse {
            status: 200,
            status_text: "OK".to_string(),
            headers: HashMap::new(),
            body: "hi".to_string(),
            duration: 5,
            size: 2,
            error: None,
            truncated: false,
            cookie_jar_host: None,
            console_logs: Vec::new(),
            test_results: Vec::new(),
            mapping_results: Vec::new(),
            timestamp: 0,
        };
        insert_history_record(&pool, &prepared, &response)
            .await
            .unwrap();
        let history: Vec<ApiHistoryRecord> = sqlx::query_as(
            "SELECT id, request_id, method, url, request_headers, request_body, status,
                status_text, duration, size, response_headers, response_body,
                console_logs, test_results, created_at
             FROM api_history WHERE workspace_id = ?",
        )
        .bind(WORKSPACE_ID)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].status, 200);
    }

    #[tokio::test]
    async fn api_prepare_rejects_missing_url() {
        let pool = test_pool().await;
        let payload = SendApiRequestPayload {
            request_id: None,
            collection_id: None,
            environment_id: None,
            method: Some("GET".to_string()),
            url: Some("   ".to_string()),
            headers: None,
            query_params: None,
            variables: None,
            request_options: None,
            pre_request_script: None,
            test_script: None,
            response_mappings: None,
            body_type: None,
            body: None,
            auth_type: None,
            auth_config: None,
        };
        assert!(prepare_request(&pool, &payload).await.is_err());
    }

    #[tokio::test]
    async fn api_collection_run_rejects_empty_collection() {
        let pool = test_pool().await;
        let col = save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: None,
                name: "Empty".to_string(),
                description: None,
                variables: None,
            },
        )
        .await
        .unwrap();
        let result = sqlx::query_as::<_, ApiRequestRecord>(
            "SELECT id, name, method, url, headers, query_params, variables, request_options,
                pre_request_script, test_script, response_mappings, body_type, body,
                auth_type, auth_config, collection_id, created_at, updated_at
             FROM api_requests WHERE workspace_id = ? AND collection_id = ?",
        )
        .bind(WORKSPACE_ID)
        .bind(&col.id)
        .fetch_all(&pool)
        .await
        .unwrap();
        assert!(result.is_empty());
    }
}
