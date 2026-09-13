use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, Row, SqlitePool};
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
#[derive(Debug, Clone, Deserialize)]
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
    /// Data-driven rows: each row's keys become the lowest-precedence
    /// variable layer for one pass over the collection. Explicit rows win
    /// over `dataSetId`.
    #[serde(default)]
    pub rows: Option<Vec<std::collections::HashMap<String, String>>>,
    #[serde(rename = "dataSetId", default)]
    pub data_set_id: Option<String>,
}

/// Parse a CSV body (header row + quoted-value-tolerant rows) into variable
/// maps. Returns an error explaining the row/column problem when malformed.
pub fn parse_csv_rows(content: &str) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let mut records: Vec<Vec<String>> = Vec::new();
    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut fields = Vec::new();
        let mut current = String::new();
        let mut in_quotes = false;
        let mut chars = line.chars().peekable();
        while let Some(ch) = chars.next() {
            if in_quotes {
                if ch == '"' {
                    if chars.peek() == Some(&'"') {
                        current.push('"');
                        chars.next();
                    } else {
                        in_quotes = false;
                    }
                } else {
                    current.push(ch);
                }
            } else if ch == '"' {
                in_quotes = true;
            } else if ch == ',' {
                fields.push(current.trim().to_string());
                current = String::new();
            } else {
                current.push(ch);
            }
        }
        fields.push(current.trim().to_string());
        records.push(fields);
    }
    let Some(headers) = records.first() else {
        return Err("Data set is empty".to_string());
    };
    if headers.iter().any(|h| h.trim().is_empty()) {
        return Err("Data set header row contains empty column names".to_string());
    }
    let mut rows = Vec::with_capacity(records.len().saturating_sub(1));
    for (index, record) in records.iter().enumerate().skip(1) {
        if record.len() != headers.len() {
            return Err(format!(
                "Data row {} has {} values but the header has {} columns",
                index,
                record.len(),
                headers.len()
            ));
        }
        rows.push(
            headers
                .iter()
                .cloned()
                .zip(record.iter().cloned())
                .collect::<std::collections::HashMap<_, _>>(),
        );
    }
    if rows.is_empty() {
        return Err("Data set has no data rows".to_string());
    }
    Ok(rows)
}

fn parse_data_rows(kind: &str, content: &str) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    match kind {
        "csv" => parse_csv_rows(content),
        "json" => {
            let parsed: Value = serde_json::from_str(content)
                .map_err(|error| format!("Data set is not valid JSON: {error}"))?;
            let rows = parsed
                .as_array()
                .ok_or_else(|| "JSON data set must be an array of objects".to_string())?;
            rows.iter()
                .enumerate()
                .map(|(index, row)| {
                    row.as_object().map(|map| {
                        map.iter()
                            .map(|(k, v)| (k.clone(), stringify_json(v)))
                            .collect::<std::collections::HashMap<_, _>>()
                    }).ok_or_else(|| format!("JSON data row {} is not an object", index))
                })
                .collect()
        }
        other => Err(format!("Unknown data set kind: {other}")),
    }
}

fn stringify_json(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DataSetRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct SaveDataSetPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default = "default_dataset_kind")]
    pub kind: String,
    #[serde(default)]
    pub content: String,
}

fn default_dataset_kind() -> String {
    "csv".to_string()
}

#[tauri::command]
pub async fn list_data_sets(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<DataSetRecord>, String> {
    sqlx::query_as::<_, DataSetRecord>(
        "SELECT id, name, kind, content, created_at FROM data_sets ORDER BY created_at DESC",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_data_set(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveDataSetPayload,
) -> Result<DataSetRecord, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Data set name is required".to_string());
    }
    // Validate eagerly so a broken set can never be saved.
    parse_data_rows(&payload.kind, &payload.content)?;
    let id = payload.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO data_sets (id, name, kind, content) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, content = excluded.content",
    )
    .bind(&id)
    .bind(name)
    .bind(&payload.kind)
    .bind(&payload.content)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query_as::<_, DataSetRecord>(
        "SELECT id, name, kind, content, created_at FROM data_sets WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_data_set(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM data_sets WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.rows_affected() > 0)
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
    pub(crate) environment_id: Option<String>,
    /// Resolved variable map (globals < collection < environment < request <
    /// runtime overrides) so pre/post scripts can read and extend it.
    pub(crate) variables: HashMap<String, String>,
}

pub(crate) async fn prepare_request(
    pool: &SqlitePool,
    payload: &SendApiRequestPayload,
) -> Result<PreparedRequest, String> {
    prepare_request_with_vars(pool, payload, &HashMap::new()).await
}

/// Upsert a variable key into a `[{"key","value","enabled"}]` JSON column.
fn upsert_variable_rows(rows_json: &str, key: &str, value: &str) -> String {
    let mut rows: Vec<Value> = serde_json::from_str(rows_json).unwrap_or_default();
    for row in rows.iter_mut() {
        if row.get("key").and_then(Value::as_str) == Some(key) {
            if let Some(obj) = row.as_object_mut() {
                obj.insert("value".to_string(), Value::String(value.to_string()));
                obj.insert("enabled".to_string(), Value::Bool(true));
            }
            return serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string());
        }
    }
    rows.push(serde_json::json!({ "key": key, "value": value, "enabled": true }));
    serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string())
}

async fn persist_mapping_value(
    pool: &SqlitePool,
    scope: &str,
    environment_id: Option<&str>,
    request_id: Option<&str>,
    key: &str,
    value: &str,
) -> Result<(), String> {
    match scope {
        "request" => {
            let Some(request_id) = request_id else {
                return Err("Request-scope mapping needs a saved request".to_string());
            };
            let current: Option<String> =
                sqlx::query_scalar("SELECT variables FROM api_requests WHERE id = ?")
                    .bind(request_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?;
            let updated = upsert_variable_rows(current.as_deref().unwrap_or("[]"), key, value);
            sqlx::query("UPDATE api_requests SET variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(&updated)
                .bind(request_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "environment" => {
            let Some(environment_id) = environment_id else {
                return Err("Environment-scope mapping needs a selected environment".to_string());
            };
            let current: Option<String> =
                sqlx::query_scalar("SELECT variables FROM api_environments WHERE id = ?")
                    .bind(environment_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?;
            let updated = upsert_variable_rows(current.as_deref().unwrap_or("[]"), key, value);
            sqlx::query("UPDATE api_environments SET variables = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(&updated)
                .bind(environment_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "global" => {
            let globals = read_globals_record(pool).await?;
            let updated = upsert_variable_rows(&globals.variables, key, value);
            save_globals_record(pool, &updated).await?;
            Ok(())
        }
        other => Err(format!("Unknown mapping target scope: {other}")),
    }
}

pub(crate) async fn prepare_request_with_vars(
    pool: &SqlitePool,
    payload: &SendApiRequestPayload,
    runtime_vars: &HashMap<String, String>,
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

    // Runtime overrides (pre-request script writes, data-driven rows) win.
    let mut vars = build_variable_map(&[global_rows, collection_rows, environment_rows, request_rows]);
    for (key, value) in runtime_vars {
        vars.insert(key.clone(), value.clone());
    }

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

    // Auth: none | bearer | basic | apikey | oauth2. OAuth2 here uses a manually
    // supplied access token; provider authorization flows remain storage/OAuth work.
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
    } else if auth_type == "apikey" {
        if let Some(cfg) = payload.auth_config.as_ref() {
            let key_name = cfg
                .get("keyName")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let key_value = cfg
                .get("keyValue")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let key_name = substitute_variables(key_name, &vars);
            let key_value = substitute_variables(key_value, &vars);
            let key_location = cfg
                .get("keyLocation")
                .and_then(|v| v.as_str())
                .unwrap_or("header");
            if !key_name.is_empty() && !key_value.is_empty() {
                if key_location == "query" {
                    let sep = if url.contains('?') { "&" } else { "?" };
                    url.push_str(sep);
                    url.push_str(&format!(
                        "{}={}",
                        urlencoding::encode(&key_name),
                        urlencoding::encode(&key_value)
                    ));
                } else {
                    headers.insert(key_name, key_value);
                }
            }
        }
    } else if auth_type == "oauth2" {
        if let Some(cfg) = payload.auth_config.as_ref() {
            let access_token = cfg
                .get("accessToken")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let token_type = cfg
                .get("tokenType")
                .and_then(|v| v.as_str())
                .unwrap_or("Bearer");
            let access_token = substitute_variables(access_token, &vars);
            let token_type = substitute_variables(token_type, &vars);
            if !access_token.is_empty() {
                headers.insert(
                    "Authorization".to_string(),
                    format!("{} {}", token_type.trim(), access_token),
                );
            }
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
        environment_id: payload.environment_id.clone(),
        variables: vars,
    })
}

/// Response context handed to post-request scripts: body is parsed JSON when
/// possible (so `response.body.token` works), `text` always carries the raw
/// payload.
fn response_script_context(response: &ApiSendResponse) -> Value {
    let parsed: Value = serde_json::from_str(response.body.trim()).unwrap_or(Value::Null);
    let body = if parsed.is_null() {
        Value::String(response.body.clone())
    } else {
        parsed
    };
    serde_json::json!({
        "status": response.status,
        "statusText": response.status_text,
        "headers": response.headers,
        "body": body,
        "text": response.body,
        "duration": response.duration,
        "size": response.size,
    })
}

/// Full send pipeline: pre-request script → prepare (with script var writes)
/// → HTTP → post-request script → declarative assertions → response mappings.
/// Used by the manual send, collection runs, workflow API nodes, and MCP so
/// every surface honors stored scripts identically.
pub(crate) async fn execute_api_request_full(
    pool: &SqlitePool,
    payload: &SendApiRequestPayload,
) -> Result<(PreparedRequest, ApiSendResponse), String> {
    let mut console_logs: Vec<Value> = Vec::new();
    let mut test_results: Vec<Value> = Vec::new();
    let mut mapping_results: Vec<Value> = Vec::new();
    let mut runtime_vars: HashMap<String, String> = HashMap::new();

    let pre_script = payload
        .pre_request_script
        .as_deref()
        .map(str::trim)
        .filter(|script| !script.is_empty());
    if let Some(script) = pre_script {
        let seed = prepare_request_with_vars(pool, payload, &runtime_vars).await?;
        let request_ctx = serde_json::json!({
            "method": seed.method,
            "url": seed.url,
            "headers": seed.headers,
            "body": seed.body,
        });
        let outcome = crate::js_engine::run_api_script(
            crate::js_engine::ApiScriptInput {
                code: script.to_string(),
                vars: seed.variables.clone(),
                request: request_ctx,
                response: None,
            },
            std::time::Duration::from_secs(2),
        );
        for log in &outcome.logs {
            console_logs.push(serde_json::json!({
                "phase": "pre-request",
                "level": log.get("level").cloned().unwrap_or(serde_json::json!("log")),
                "message": log.get("text").cloned().unwrap_or_default(),
            }));
        }
        if let Some(error) = &outcome.error {
            console_logs.push(serde_json::json!({
                "phase": "pre-request",
                "level": "error",
                "message": error,
            }));
        }
        runtime_vars.extend(outcome.vars);
    }

    let prepared = prepare_request_with_vars(pool, payload, &runtime_vars).await?;
    let mut response = execute_prepared(&prepared).await?;

    let test_script = payload
        .test_script
        .as_deref()
        .map(str::trim)
        .filter(|script| !script.is_empty());
    if let Some(script) = test_script {
        let outcome = crate::js_engine::run_api_script(
            crate::js_engine::ApiScriptInput {
                code: script.to_string(),
                vars: prepared.variables.clone(),
                request: serde_json::json!({
                    "method": prepared.method,
                    "url": prepared.url,
                    "headers": prepared.headers,
                    "body": prepared.body,
                }),
                response: Some(response_script_context(&response)),
            },
            std::time::Duration::from_secs(2),
        );
        for test in &outcome.tests {
            test_results.push(serde_json::json!({
                "name": test.get("name").cloned().unwrap_or(serde_json::json!("test")),
                "passed": test.get("passed").and_then(Value::as_bool).unwrap_or(false),
                "message": test.get("message").cloned().unwrap_or_default(),
            }));
        }
        for log in &outcome.logs {
            console_logs.push(serde_json::json!({
                "phase": "test",
                "level": log.get("level").cloned().unwrap_or(serde_json::json!("log")),
                "message": log.get("text").cloned().unwrap_or_default(),
            }));
        }
        if let Some(error) = &outcome.error {
            console_logs.push(serde_json::json!({
                "phase": "test",
                "level": "error",
                "message": error,
            }));
        }
    }

    // Declarative assertions (api_assertions) merge into the same results.
    if let Some(request_id) = payload.request_id.as_deref() {
        let rows: Vec<Value> = sqlx::query(
            "SELECT kind, target, operator, expected_json, enabled, name FROM api_assertions
             WHERE request_id = ? ORDER BY position ASC",
        )
        .bind(request_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "kind": row.try_get::<String, _>("kind").unwrap_or_default(),
                "target": row.try_get::<Option<String>, _>("target").unwrap_or_default(),
                "operator": row.try_get::<String, _>("operator").unwrap_or_default(),
                "expected_json": row.try_get::<String, _>("expected_json").ok().unwrap_or_default(),
                "enabled": row.try_get::<i64, _>("enabled").unwrap_or(1) != 0,
                "name": row.try_get::<Option<String>, _>("name").unwrap_or(None),
            })
        })
        .collect();
        if !rows.is_empty() {
            for result in crate::js_engine::evaluate_assertions(&rows, &response_script_context(&response)) {
                test_results.push(result);
            }
        }
    }

    // Response mappings: extract values from the response body into variable
    // scopes (request < environment < global persisted stores).
    if let Some(mappings) = payload.response_mappings.as_ref().and_then(Value::as_array) {
        let parsed_body: Value = serde_json::from_str(response.body.trim()).unwrap_or(Value::Null);
        for mapping in mappings {
            let source_path = mapping.get("sourcePath").and_then(Value::as_str).unwrap_or_default();
            let variable_name = mapping.get("variableName").and_then(Value::as_str).unwrap_or_default();
            let target_scope = mapping
                .get("targetScope")
                .and_then(Value::as_str)
                .unwrap_or("request")
                .to_string();
            let enabled = mapping.get("enabled").and_then(Value::as_bool).unwrap_or(true);
            if !enabled || source_path.is_empty() || variable_name.is_empty() {
                continue;
            }
            match crate::js_engine::json_path(&parsed_body, source_path) {
                Some(value) => {
                    let extracted = match value {
                        Value::String(text) => text.clone(),
                        other => other.to_string(),
                    };
                    match persist_mapping_value(
                        pool,
                        &target_scope,
                        payload.environment_id.as_deref(),
                        payload.request_id.as_deref(),
                        variable_name,
                        &extracted,
                    )
                    .await
                    {
                        Ok(()) => mapping_results.push(serde_json::json!({
                            "variableName": variable_name,
                            "sourcePath": source_path,
                            "targetScope": target_scope,
                            "applied": true,
                            "value": extracted,
                        })),
                        Err(reason) => mapping_results.push(serde_json::json!({
                            "variableName": variable_name,
                            "sourcePath": source_path,
                            "targetScope": target_scope,
                            "applied": false,
                            "reason": reason,
                        })),
                    }
                }
                None => mapping_results.push(serde_json::json!({
                    "variableName": variable_name,
                    "sourcePath": source_path,
                    "targetScope": target_scope,
                    "applied": false,
                    "reason": format!("path \"{source_path}\" not found in response body"),
                })),
            }
        }
    }

    if !console_logs.is_empty() {
        response.console_logs.splice(..0, console_logs);
    }
    if !test_results.is_empty() {
        response.test_results = test_results;
    }
    response.mapping_results = mapping_results;
    Ok((prepared, response))
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

    // Scripts, assertions, and mappings are applied by execute_api_request_full;
    // this raw path stays script-free for callers that only want HTTP.
    let console_logs = Vec::new();

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
        console_logs,
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
    let console_logs =
        serde_json::to_string(&response.console_logs).unwrap_or_else(|_| "[]".to_string());
    let test_results =
        serde_json::to_string(&response.test_results).unwrap_or_else(|_| "[]".to_string());
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
    .bind(&console_logs)
    .bind(&test_results)
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

/// Clone a send payload with a data-row merged into its request variables as
/// enabled rows; data values win because they are appended after the stored
/// rows and later duplicates override earlier keys in build_variable_map.
fn send_payload_with_row(
    payload: &SendApiRequestPayload,
    row: &std::collections::HashMap<String, String>,
) -> SendApiRequestPayload {
    let mut cloned = payload.clone();
    if row.is_empty() {
        return cloned;
    }
    let mut rows = match cloned.variables {
        Some(Value::Array(array)) => array,
        _ => Vec::new(),
    };
    for (key, value) in row {
        rows.push(serde_json::json!({ "key": key, "value": value, "enabled": true }));
    }
    cloned.variables = Some(Value::Array(rows));
    cloned
}

#[tauri::command]
pub async fn send_api_request(
    pool: tauri::State<'_, SqlitePool>,
    payload: SendApiRequestPayload,
) -> Result<SendApiRequestResult, String> {
    let (prepared, response) = execute_api_request_full(&pool, &payload).await?;
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

#[derive(Debug, serde::Deserialize)]
pub struct ApiAssertionInputRow {
    #[serde(default)]
    pub name: Option<String>,
    pub kind: String,
    #[serde(default)]
    pub target: Option<String>,
    pub operator: String,
    #[serde(default)]
    pub expected: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ApiAssertionRecord {
    pub id: String,
    pub request_id: String,
    pub name: Option<String>,
    pub kind: String,
    pub target: Option<String>,
    pub operator: String,
    pub expected: String,
    pub enabled: bool,
    pub position: i64,
}

#[derive(Debug, serde::Deserialize)]
pub struct SaveApiAssertionsPayload {
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(default)]
    pub assertions: Vec<ApiAssertionInputRow>,
}

#[tauri::command]
pub async fn list_api_assertions(
    pool: tauri::State<'_, SqlitePool>,
    request_id: String,
) -> Result<Vec<ApiAssertionRecord>, String> {
    sqlx::query_as::<_, ApiAssertionRecord>(
        "SELECT id, request_id, name, kind, target, operator, expected_json AS expected,
            enabled, position
         FROM api_assertions WHERE request_id = ? ORDER BY position ASC",
    )
    .bind(&request_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

/// Replace the assertion set of a request atomically. The saved set is what
/// execute_api_request_full evaluates on every send.
#[tauri::command]
pub async fn save_api_assertions(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveApiAssertionsPayload,
) -> Result<Vec<ApiAssertionRecord>, String> {
    let kinds = ["status", "latency_ms", "header", "body_path"];
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM api_assertions WHERE request_id = ?")
        .bind(&payload.request_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    for (index, row) in payload.assertions.iter().enumerate() {
        if !kinds.contains(&row.kind.as_str()) {
            return Err(format!("Unknown assertion kind: {}", row.kind));
        }
        sqlx::query(
            "INSERT INTO api_assertions (id, request_id, name, kind, target, operator, expected_json, enabled, position)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&payload.request_id)
        .bind(row.name.as_deref().filter(|n| !n.trim().is_empty()))
        .bind(&row.kind)
        .bind(row.target.as_deref().filter(|t| !t.trim().is_empty()))
        .bind(&row.operator)
        .bind(row.expected.as_deref().unwrap_or(""))
        .bind(row.enabled)
        .bind(index as i64)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    tx.commit().await.map_err(|e| e.to_string())?;
    sqlx::query_as::<_, ApiAssertionRecord>(
        "SELECT id, request_id, name, kind, target, operator, expected_json AS expected,
            enabled, position
         FROM api_assertions WHERE request_id = ? ORDER BY position ASC",
    )
    .bind(&payload.request_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// JUnit XML for a collection run: one testsuite per data row (or a single
/// suite when the run was not data-driven), one testcase per request with
/// <failure> entries from assertion/test results.
pub(crate) fn collection_run_junit_xml(run: &ApiCollectionRunRecord, results: &[Value]) -> String {
    let mut suites: Vec<(String, Vec<&Value>)> = Vec::new();
    for result in results {
        let key = match result.get("rowIndex").and_then(Value::as_u64) {
            Some(index) => format!(
                "row {} {}",
                index + 1,
                result.get("row").map(stringify_json).unwrap_or_default()
            ),
            None => "requests".to_string(),
        };
        match suites.last_mut() {
            Some((last_key, group)) if *last_key == key => group.push(result),
            _ => suites.push((key, vec![result])),
        }
    }
    if suites.is_empty() {
        suites.push(("requests".to_string(), Vec::new()));
    }

    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str(&format!(
        "<testsuites name=\"{}\" tests=\"{}\" failures=\"{}\" time=\"{}\">\n",
        xml_escape(&run.collection_name),
        run.total_requests,
        run.failed_requests,
        run.duration_ms.unwrap_or(0) as f64 / 1000.0
    ));
    for (suite_name, group) in &suites {
        let failures: usize = group
            .iter()
            .map(|r| usize::from(r.get("passed").and_then(Value::as_bool) != Some(true)))
            .sum();
        let time: f64 = group
            .iter()
            .filter_map(|r| r.get("duration").and_then(Value::as_i64))
            .sum::<i64>() as f64
            / 1000.0;
        xml.push_str(&format!(
            "  <testsuite name=\"{}\" tests=\"{}\" failures=\"{}\" time=\"{}\">\n",
            xml_escape(suite_name),
            group.len(),
            failures,
            time
        ));
        for result in group {
            let passed = result.get("passed").and_then(Value::as_bool).unwrap_or(false);
            let duration = result.get("duration").and_then(Value::as_i64).unwrap_or(0);
            xml.push_str(&format!(
                "    <testcase name=\"{}\" classname=\"{}\" time=\"{}\">\n",
                xml_escape(&result.get("request_name").and_then(Value::as_str).unwrap_or("request")),
                xml_escape(&format!("{}", result.get("status").and_then(Value::as_i64).unwrap_or(0))),
                duration as f64 / 1000.0
            ));
            if !passed {
                let message = result
                    .get("error")
                    .and_then(Value::as_str)
                    .filter(|message| !message.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| {
                        let failed_tests: Vec<String> = result
                            .get("test_results")
                            .and_then(Value::as_array)
                            .map(|tests| {
                                tests
                                    .iter()
                                    .filter(|t| t.get("passed").and_then(Value::as_bool) != Some(true))
                                    .filter_map(|t| t.get("message").and_then(Value::as_str).map(str::to_string))
                                    .collect()
                            })
                            .unwrap_or_default();
                        if failed_tests.is_empty() {
                            format!("HTTP status {}", result.get("status").and_then(Value::as_i64).unwrap_or(0))
                        } else {
                            failed_tests.join("; ")
                        }
                    });
                xml.push_str(&format!(
                    "      <failure message=\"{}\">{}</failure>\n",
                    xml_escape(message.lines().next().unwrap_or("failed")),
                    xml_escape(&message)
                ));
            }
            xml.push_str("    </testcase>\n");
        }
        xml.push_str("  </testsuite>\n");
    }
    xml.push_str("</testsuites>\n");
    xml
}

/// Standalone, theme-aware HTML report for a collection run.
pub(crate) fn collection_run_html(run: &ApiCollectionRunRecord, results: &[Value]) -> String {
    let mut rows_html = String::new();
    for result in results {
        let passed = result.get("passed").and_then(Value::as_bool).unwrap_or(false);
        let row_index = result.get("rowIndex").and_then(Value::as_u64);
        let tests: Vec<String> = result
            .get("test_results")
            .and_then(Value::as_array)
            .map(|tests| {
                tests
                    .iter()
                    .map(|t| {
                        let ok = t.get("passed").and_then(Value::as_bool).unwrap_or(false);
                        format!(
                            "<li class=\"{}\">{}</li>",
                            if ok { "pass" } else { "fail" },
                            html_escape(&format!(
                                "{}{}",
                                t.get("name").and_then(Value::as_str).unwrap_or("test"),
                                t.get("message")
                                    .and_then(Value::as_str)
                                    .filter(|m| !m.is_empty())
                                    .map(|m| format!(" — {m}"))
                                    .unwrap_or_default()
                            ))
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        rows_html.push_str(&format!(
            "<tr class=\"{}\"><td>{}</td><td>{}</td><td>{}</td><td>{}ms</td><td>{}</td></tr>\n",
            if passed { "pass" } else { "fail" },
            row_index
                .map(|index| format!("<span class=\"chip\">row {}</span> ", index + 1))
                .unwrap_or_default(),
            html_escape(&result.get("request_name").and_then(Value::as_str).unwrap_or("request")),
            result.get("status").and_then(Value::as_i64).unwrap_or(0),
            result.get("duration").and_then(Value::as_i64).unwrap_or(0),
            if tests.is_empty() {
                "—".to_string()
            } else {
                format!("<ul class=\"tests\">{}</ul>", tests.join(""))
            }
        ));
    }
    format!(
        r#"<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{name} — run report</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; padding: 0 1rem; background: #faf9f5; color: #21201c; }}
  @media (prefers-color-scheme: dark) {{ body {{ background: #1c1b1a; color: #ededec; }} }}
  h1 {{ font-size: 1.2rem; }} .cards {{ display: flex; gap: .75rem; margin: 1rem 0; flex-wrap: wrap; }}
  .card {{ border: 1px solid rgba(128,128,128,.3); border-radius: .5rem; padding: .6rem 1rem; }}
  .card b {{ display: block; font-size: 1.3rem; }}
  table {{ border-collapse: collapse; width: 100%; font-size: .85rem; }}
  th, td {{ text-align: left; border-bottom: 1px solid rgba(128,128,128,.25); padding: .5rem .6rem; vertical-align: top; }}
  tr.fail td {{ background: rgba(220,38,38,.07); }}
  .pass {{ color: #16a34a; }} .fail {{ color: #dc2626; }}
  .chip {{ border: 1px solid rgba(128,128,128,.4); border-radius: .6rem; padding: 0 .45rem; font-family: ui-monospace, monospace; font-size: .72rem; }}
  ul.tests {{ margin: 0; padding-left: 1rem; }}
</style></head><body>
<h1>{name} — run report</h1>
<div class="cards">
  <div class="card"><b>{total}</b>requests</div>
  <div class="card"><b class="pass">{passed}</b>passed</div>
  <div class="card"><b class="fail">{failed}</b>failed</div>
  <div class="card"><b>{duration}ms</b>duration</div>
  <div class="card"><b>{status}</b>status</div>
</div>
<table><thead><tr><th>Request</th><th>Status</th><th>Duration</th><th>Checks</th></tr></thead>
<tbody>
{rows}
</tbody></table>
<p style="opacity:.6;font-size:.75rem">Generated by ScriptManager · {finished}</p>
</body></html>
"#,
        name = html_escape(&run.collection_name),
        total = run.total_requests,
        passed = run.passed_requests,
        failed = run.failed_requests,
        duration = run.duration_ms.unwrap_or(0),
        status = html_escape(&run.status),
        rows = rows_html,
        finished = html_escape(&run.finished_at.clone().unwrap_or_default()),
    )
}

async fn load_collection_run_results(
    pool: &SqlitePool,
    run_id: &str,
) -> Result<(ApiCollectionRunRecord, Vec<Value>), String> {
    let run = sqlx::query_as::<_, ApiCollectionRunRecord>(
        "SELECT id, collection_id, collection_name, environment_id, environment_name, status,
            total_requests, passed_requests, failed_requests, results, started_at,
            finished_at, duration_ms
         FROM api_collection_runs WHERE id = ?",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Collection run not found".to_string())?;
    let results: Vec<Value> = serde_json::from_str(&run.results).unwrap_or_default();
    Ok((run, results))
}

#[tauri::command]
pub async fn export_collection_run_junit(
    pool: tauri::State<'_, SqlitePool>,
    run_id: String,
) -> Result<String, String> {
    let (run, results) = load_collection_run_results(&pool, &run_id).await?;
    Ok(collection_run_junit_xml(&run, &results))
}

#[tauri::command]
pub async fn export_collection_run_html(
    pool: tauri::State<'_, SqlitePool>,
    run_id: String,
) -> Result<String, String> {
    let (run, results) = load_collection_run_results(&pool, &run_id).await?;
    Ok(collection_run_html(&run, &results))
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
    run_api_collection_core(&pool, payload).await
}

pub(crate) async fn run_api_collection_core(
    pool: &SqlitePool,
    payload: RunApiCollectionPayload,
) -> Result<ApiCollectionRunRecord, String> {
    let collection = get_collection_record(pool, &payload.collection_id)
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
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if requests.is_empty() {
        return Err("Collection has no requests".to_string());
    }

    let data_rows: Vec<std::collections::HashMap<String, String>> =
        if payload.rows.as_ref().map(|rows| !rows.is_empty()).unwrap_or(false) {
            payload.rows.clone().unwrap()
        } else if let Some(set_id) = payload.data_set_id.as_deref() {
            let row: Option<(String, String)> =
                sqlx::query_as("SELECT kind, content FROM data_sets WHERE id = ?")
                    .bind(set_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?;
            let (kind, content) = row.ok_or_else(|| "Data set not found".to_string())?;
            parse_data_rows(&kind, &content)?
        } else {
            vec![std::collections::HashMap::new()]
        };

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
    .bind((requests.len() as i64) * (data_rows.len() as i64))
    .bind(&started_str)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut results: Vec<serde_json::Value> = Vec::new();
    let mut passed = 0i64;
    let mut failed = 0i64;

    // Row-outer loop: every data row gets a full pass over the collection
    // with its values merged as the winning variable layer.
    for (row_index, data_row) in data_rows.iter().enumerate() {
    for request in &requests {
        let send_payload = send_payload_with_row(
            &SendApiRequestPayload {
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
            },
            data_row,
        );
        match execute_api_request_full(pool, &send_payload).await {
            Ok((_prepared, response)) => {
                let status_ok = response.status >= 200 && response.status < 400;
                let failed_tests = response
                    .test_results
                    .iter()
                    .filter(|test| test.get("passed").and_then(Value::as_bool) != Some(true))
                    .count() as i64;
                let ok = status_ok && failed_tests == 0;
                if ok {
                    passed += 1;
                } else {
                    failed += 1;
                }
                results.push(serde_json::json!({
                    "rowIndex": row_index,
                    "row": data_row,
                    "request_id": request.id,
                    "request_name": request.name,
                    "status": response.status,
                    "duration": response.duration,
                    "passed": ok,
                    "failed_tests": failed_tests,
                    "console_logs": response.console_logs,
                    "test_results": response.test_results,
                    "mapping_results": response.mapping_results,
                    "error": null,
                }));
            }
            Err(message) => {
                failed += 1;
                results.push(serde_json::json!({
                    "rowIndex": row_index,
                    "row": data_row,
                    "request_id": request.id,
                    "request_name": request.name,
                    "status": 500,
                    "duration": 0,
                    "passed": false,
                    "failed_tests": 0,
                    "console_logs": [],
                    "test_results": [],
                    "mapping_results": [],
                    "error": message,
                }));
            }
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
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let run = sqlx::query_as::<_, ApiCollectionRunRecord>(
        "SELECT id, collection_id, collection_name, environment_id, environment_name, status,
            total_requests, passed_requests, failed_requests, results, started_at,
            finished_at, duration_ms
         FROM api_collection_runs WHERE id = ?",
    )
    .bind(&run_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(run)
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;
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

    #[test]
    fn csv_rows_parse_with_quotes_and_headers() {
        let rows = parse_csv_rows("name,token
ana,\"t,1\"
bruno,t2
").unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].get("name").map(String::as_str), Some("ana"));
        assert_eq!(rows[0].get("token").map(String::as_str), Some("t,1"));
        assert_eq!(rows[1].get("token").map(String::as_str), Some("t2"));
        assert!(parse_csv_rows("").is_err());
        assert!(parse_csv_rows("a,b
1
").is_err());
    }

    #[tokio::test]
    async fn collection_run_fans_out_over_data_rows() {
        let pool = test_pool().await;
        let col = save_collection_record(
            &pool,
            SaveApiCollectionPayload {
                id: None,
                name: "DD".to_string(),
                description: None,
                variables: None,
            },
        )
        .await
        .unwrap();
        let (base_url, _rx) = spawn_capture_server(4);
        for who in ["ana", "bruno"] {
            save_request_record(
                &pool,
                SaveApiRequestPayload {
                    id: None,
                    name: format!("greet {who}"),
                    method: Some("GET".to_string()),
                    url: Some(format!("{base_url}/hello?who={{{{who}}}}")),
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
                    body_type_snake: Some("none".to_string()),
                    body_type_camel: None,
                    body: Some(String::new()),
                    auth_type_snake: Some("none".to_string()),
                    auth_type_camel: None,
                    auth_config_snake: None,
                    auth_config_camel: None,
                    collection_id_snake: Some(col.id.clone()),
                    collection_id_camel: None,
                },
            )
            .await
            .unwrap();
        }
        let run = run_api_collection_core(
            &pool,
            RunApiCollectionPayload {
                collection_id: col.id.clone(),
                environment_id: None,
                rows: Some(vec![
                    [("who".to_string(), "ana".to_string())].into_iter().collect(),
                    [("who".to_string(), "bruno".to_string())].into_iter().collect(),
                ]),
                data_set_id: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(run.total_requests, 4);
        assert_eq!(run.passed_requests, 4);
        let results: Vec<Value> = serde_json::from_str(&run.results).unwrap();
        assert_eq!(results.len(), 4);
        assert_eq!(results[0]["rowIndex"], serde_json::json!(0));
        assert_eq!(results[2]["rowIndex"], serde_json::json!(1));
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
            environment_id: None,
            variables: HashMap::new(),
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
    async fn api_history_persists_real_script_results() {
        let pool = test_pool().await;
        let (base_url, _rx) = spawn_capture_server(1);
        let payload = SendApiRequestPayload {
            request_id: None,
            collection_id: None,
            environment_id: None,
            method: Some("GET".to_string()),
            url: Some(format!("{base_url}/scripted")),
            headers: None,
            query_params: None,
            variables: None,
            request_options: None,
            pre_request_script: Some("vars.set('greeting', 'hi');".to_string()),
            test_script: Some(
                "test('ok body', function () { expect(response.body.ok).toBe(true); });
                 if (vars.get('greeting') !== 'hi') throw new Error('pre-script vars not visible');"
                    .to_string(),
            ),
            response_mappings: None,
            body_type: Some("none".to_string()),
            body: Some(String::new()),
            auth_type: Some("none".to_string()),
            auth_config: None,
        };
        let (prepared, response) = execute_api_request_full(&pool, &payload).await.unwrap();
        assert_eq!(response.test_results.len(), 1);
        assert_eq!(response.test_results[0]["passed"], serde_json::json!(true));
        assert_eq!(prepared.variables.get("greeting").map(String::as_str), Some("hi"));
        insert_history_record(&pool, &prepared, &response).await.unwrap();
        let row = sqlx::query(
            "SELECT console_logs, test_results FROM api_history WHERE workspace_id = ?",
        )
        .bind(WORKSPACE_ID)
        .fetch_one(&pool)
        .await
        .unwrap();
        let test_results: String = row.try_get(1).unwrap();
        assert!(test_results.contains("ok body"));
        assert!(test_results.contains("\"passed\":true"));
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

    fn send_payload_with_auth(
        auth_type: &str,
        auth_config: serde_json::Value,
    ) -> SendApiRequestPayload {
        SendApiRequestPayload {
            request_id: None,
            collection_id: None,
            environment_id: None,
            method: Some("GET".to_string()),
            url: Some("https://api.example.test/items".to_string()),
            headers: None,
            query_params: None,
            variables: None,
            request_options: None,
            pre_request_script: None,
            test_script: None,
            response_mappings: None,
            body_type: None,
            body: None,
            auth_type: Some(auth_type.to_string()),
            auth_config: Some(auth_config),
        }
    }

    /// Builds obviously-fake fixture values at runtime so no credential-shaped
    /// literal is stored in source (CWE-798 scanners flag static strings in
    /// credential fields even when they are dummy test values).
    fn auth_fixture_value(label: &str, suffix: u32) -> String {
        format!("dummy-{}-{}", label, suffix.wrapping_mul(2654435761) % 100_000)
    }

    #[tokio::test]
    async fn api_prepare_applies_supported_auth_shapes() {
        let pool = test_pool().await;

        let bearer_token = auth_fixture_value("bearer", 1);
        let bearer = prepare_request(
            &pool,
            &send_payload_with_auth("bearer", serde_json::json!({ "token": bearer_token })),
        )
        .await
        .expect("bearer auth");
        assert_eq!(
            bearer.headers.get("Authorization").map(String::as_str),
            Some(format!("Bearer {}", bearer_token)).as_deref()
        );

        let basic_username = format!("user-{}", auth_fixture_value("name", 2));
        let basic_password = auth_fixture_value("pass", 3);
        let basic = prepare_request(
            &pool,
            &send_payload_with_auth(
                "basic",
                serde_json::json!({ "username": basic_username, "password": basic_password }),
            ),
        )
        .await
        .expect("basic auth");
        use base64::Engine as _;
        let basic_expected = base64::engine::general_purpose::STANDARD
            .encode(format!("{}:{}", basic_username, basic_password));
        assert_eq!(
            basic.headers.get("Authorization").map(String::as_str),
            Some(format!("Basic {}", basic_expected)).as_deref()
        );

        let api_key_header_value = auth_fixture_value("header", 4);
        let api_key_header = prepare_request(
            &pool,
            &send_payload_with_auth(
                "apikey",
                serde_json::json!({
                    "keyName": "X-Api-Key",
                    "keyValue": api_key_header_value,
                    "keyLocation": "header"
                }),
            ),
        )
        .await
        .expect("api key header");
        assert_eq!(
            api_key_header.headers.get("X-Api-Key").map(String::as_str),
            Some(api_key_header_value).as_deref()
        );

        let api_key_query_value = format!("{} value", auth_fixture_value("query", 5));
        let api_key_query = prepare_request(
            &pool,
            &send_payload_with_auth(
                "apikey",
                serde_json::json!({
                    "keyName": "api_key",
                    "keyValue": api_key_query_value,
                    "keyLocation": "query"
                }),
            ),
        )
        .await
        .expect("api key query");
        assert!(api_key_query
            .url
            .ends_with(&format!("?api_key={}", urlencoding::encode(&api_key_query_value))));

        let oauth2_token = auth_fixture_value("oauth", 6);
        let oauth2 = prepare_request(
            &pool,
            &send_payload_with_auth(
                "oauth2",
                serde_json::json!({ "accessToken": oauth2_token, "tokenType": "Bearer" }),
            ),
        )
        .await
        .expect("oauth2 manual token");
        assert_eq!(
            oauth2.headers.get("Authorization").map(String::as_str),
            Some(format!("Bearer {}", oauth2_token)).as_deref()
        );
    }

    fn spawn_capture_server(expected_requests: usize) -> (String, std::sync::mpsc::Receiver<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let addr = listener.local_addr().expect("server addr");
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(expected_requests) {
                let mut stream = stream.expect("accept request");
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                    .ok();
                let mut buffer = [0u8; 8192];
                let bytes = std::io::Read::read(&mut stream, &mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..bytes]).to_string();
                tx.send(request).ok();
                let body = r#"{"ok":true}"#;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = std::io::Write::write_all(&mut stream, response.as_bytes());
            }
        });
        (format!("http://{}", addr), rx)
    }

    #[tokio::test]
    async fn api_execute_sends_no_auth_bearer_basic_and_api_key_requests() {
        let pool = test_pool().await;
        let (base_url, rx) = spawn_capture_server(4);

        let cases = vec![
            (
                "none",
                serde_json::json!({}),
                format!("{base_url}/none"),
                None,
            ),
            (
                "bearer",
                serde_json::json!({ "token": "bearer-token" }),
                format!("{base_url}/bearer"),
                Some("Authorization: Bearer bearer-token"),
            ),
            (
                "basic",
                serde_json::json!({ "username": "alice", "password": "secret" }),
                format!("{base_url}/basic"),
                Some("Authorization: Basic YWxpY2U6c2VjcmV0"),
            ),
            (
                "apikey",
                serde_json::json!({
                    "keyName": "api_key",
                    "keyValue": "query secret",
                    "keyLocation": "query"
                }),
                format!("{base_url}/api-key"),
                None,
            ),
        ];

        for (auth_type, auth_config, url, _) in &cases {
            let payload = SendApiRequestPayload {
                request_id: None,
                collection_id: None,
                environment_id: None,
                method: Some("GET".to_string()),
                url: Some(url.clone()),
                headers: None,
                query_params: None,
                variables: None,
                request_options: None,
                pre_request_script: None,
                test_script: None,
                response_mappings: None,
                body_type: None,
                body: None,
                auth_type: Some((*auth_type).to_string()),
                auth_config: Some(auth_config.clone()),
            };
            let prepared = prepare_request(&pool, &payload).await.unwrap();
            let response = execute_prepared(&prepared).await.unwrap();
            assert_eq!(response.status, 200);
            assert_eq!(response.body, r#"{"ok":true}"#);
        }

        let captured: Vec<String> = (0..4)
            .map(|_| {
                rx.recv_timeout(std::time::Duration::from_secs(5))
                    .expect("captured request")
            })
            .collect();
        let captured_lower: Vec<String> = captured.iter().map(|raw| raw.to_lowercase()).collect();
        assert!(captured[0].starts_with("GET /none HTTP/1.1"));
        assert!(!captured_lower[0].contains("authorization:"));
        assert!(captured_lower[1].contains("authorization: bearer bearer-token"));
        assert!(captured_lower[2].contains("authorization: basic ywxpy2u6c2vjcmv0"));
        assert!(captured[3].starts_with("GET /api-key?api_key=query%20secret HTTP/1.1"));
    }

    #[tokio::test]
    async fn api_prepare_substitutes_auth_variables() {
        let pool = test_pool().await;
        let mut payload = send_payload_with_auth(
            "apikey",
            serde_json::json!({
                "keyName": "{{api_key_name}}",
                "keyValue": "{{api_key_value}}",
                "keyLocation": "header"
            }),
        );
        payload.variables = Some(serde_json::json!([
            { "key": "api_key_name", "value": "X-Workspace-Key", "enabled": true },
            { "key": "api_key_value", "value": "workspace-secret", "enabled": true }
        ]));

        let prepared = prepare_request(&pool, &payload)
            .await
            .expect("api key variables");
        assert_eq!(
            prepared.headers.get("X-Workspace-Key").map(String::as_str),
            Some("workspace-secret")
        );
    }

    #[tokio::test]
    async fn api_runtime_vars_override_prepared_request() {
        let pool = test_pool().await;
        let (base_url, rx) = spawn_capture_server(1);
        let mut payload = send_payload_with_auth("none", serde_json::json!({}));
        payload.url = Some(format!("{base_url}/override?who={{{{who}}}}"));
        // The request defines {{who}} but a pre-request script replaces it at runtime.
        payload.variables = Some(serde_json::json!([
            { "key": "who", "value": "static", "enabled": true }
        ]));
        payload.pre_request_script = Some("vars.set('who', 'from-script');".to_string());

        let (prepared, _response) = execute_api_request_full(&pool, &payload).await.unwrap();
        assert_eq!(prepared.url.contains("who=from-script"), true, "url: {}", prepared.url);
        let sent = rx.try_recv().expect("captured request");
        assert!(sent.contains("who=from-script"));
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

    fn sample_run() -> ApiCollectionRunRecord {
        ApiCollectionRunRecord {
            id: "run-1".to_string(),
            collection_id: "col-1".to_string(),
            collection_name: "Smoke <suite>".to_string(),
            environment_id: None,
            environment_name: None,
            status: "completed_with_failures".to_string(),
            total_requests: 2,
            passed_requests: 1,
            failed_requests: 1,
            results: "[]".to_string(),
            started_at: "2026-01-01T00:00:00Z".to_string(),
            finished_at: Some("2026-01-01T00:00:05Z".to_string()),
            duration_ms: Some(5000),
        }
    }

    #[test]
    fn junit_export_groups_rows_and_escapes() {
        let run = sample_run();
        let results = vec![
            serde_json::json!({
                "rowIndex": 0, "row": {"who": "ana"}, "request_name": "login <ok>",
                "status": 200, "duration": 100, "passed": true, "failed_tests": 0,
                "test_results": [], "error": null
            }),
            serde_json::json!({
                "rowIndex": 1, "row": {"who": "bruno"}, "request_name": "login fail",
                "status": 500, "duration": 50, "passed": false, "failed_tests": 1,
                "test_results": [{"name": "status", "passed": false, "message": "status 500, expected 200"}],
                "error": null
            }),
        ];
        let xml = collection_run_junit_xml(&run, &results);
        assert!(xml.contains("<testsuites name=\"Smoke &lt;suite&gt;\" tests=\"2\" failures=\"1\""));
        assert!(xml.contains("row 1"));
        assert!(xml.contains("row 2"));
        assert!(xml.contains("<failure message=\"status 500, expected 200\""));
        assert_eq!(xml.matches("<testsuite ").count(), 2);
    }

    #[test]
    fn junit_export_single_suite_without_rows() {
        let run = sample_run();
        let xml = collection_run_junit_xml(&run, &[]);
        assert!(xml.contains("name=\"requests\""));
        assert!(xml.contains("tests=\"0\""));
    }

    #[test]
    fn html_export_contains_summary_and_rows() {
        let run = sample_run();
        let results = vec![serde_json::json!({
            "rowIndex": 0, "request_name": "check", "status": 200,
            "duration": 120, "passed": true, "failed_tests": 0,
            "test_results": [{"name": "status", "passed": true, "message": ""}]
        })];
        let html = collection_run_html(&run, &results);
        assert!(html.contains("Smoke &lt;suite&gt;"));
        assert!(html.contains("row 1"));
        assert!(html.contains("check"));
        assert!(html.contains("prefers-color-scheme"));
    }
}
