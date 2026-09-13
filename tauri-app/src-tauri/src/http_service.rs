//! Local HTTP services: mock servers (per-collection canned routes) and the
//! webhook listener that triggers workflows/scripts from external systems.
//!
//! A global registry owns every running
//! listener keyed by name (`mock:<id>` / `webhook`). Listeners bind
//! 127.0.0.1 unless LAN exposure is explicitly enabled in settings.

use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::response::IntoResponse;
use axum::routing::any;
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, Notify};

const MAX_LOGGED_BODY_CHARS: usize = 8000;
const MOCK_REQUEST_RETENTION: u32 = 500;

pub struct RunningInstance {
    pub port: u16,
    shutdown: Arc<Notify>,
}

/// Registry of listeners hosted by THIS process. The GUI process and the MCP
/// stdio process each keep their own registry (mock servers started via MCP
/// serve from the MCP process and stop when it exits).
static REGISTRY: std::sync::LazyLock<Mutex<HashMap<String, RunningInstance>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

async fn is_running(key: &str) -> Option<u16> {
    REGISTRY.lock().await.get(key).map(|instance| instance.port)
}

async fn spawn_listener(
    key: &str,
    host: &str,
    port: u16,
    app: Router,
) -> Result<u16, String> {
    {
        let mut running = REGISTRY.lock().await;
        if let Some(instance) = running.get(key) {
            return Ok(instance.port);
        }
    }
    let addr = format!("{host}:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .map_err(|error| format!("Could not bind {addr}: {error}"))?;
    let actual_port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let shutdown = Arc::new(Notify::new());
    let shutdown_for_task = Arc::clone(&shutdown);
    let key_owned = key.to_string();

    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, app).with_graceful_shutdown(async move {
            shutdown_for_task.notified().await;
        });
        let _ = server.await;
        // The registry entry is removed by the stop helper; nothing to do here
        // beyond the graceful shutdown completing.
        let _ = key_owned;
    });

    REGISTRY.lock().await.insert(
        key.to_string(),
        RunningInstance { port: actual_port, shutdown },
    );
    Ok(actual_port)
}

async fn stop_listener(key: &str) -> Result<bool, String> {
    let instance = REGISTRY.lock().await.remove(key);
    match instance {
        Some(instance) => {
            instance.shutdown.notify_one();
            Ok(true)
        }
        None => Ok(false),
    }
}

// ---------------------------------------------------------------------------
// Mock servers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
struct MockRoute {
    #[serde(default)]
    id: Option<String>,
    #[serde(default = "default_method")]
    method: String,
    #[serde(default)]
    path: String,
    #[serde(default = "default_status")]
    status: u16,
    #[serde(default)]
    headers: HashMap<String, String>,
    #[serde(default)]
    body: String,
    #[serde(default)]
    delay_ms: u64,
    #[serde(default = "default_match_mode")]
    match_mode: String,
    #[serde(default = "default_true")]
    enabled: bool,
}

fn default_method() -> String {
    "GET".to_string()
}
fn default_status() -> u16 {
    200
}
fn default_match_mode() -> String {
    "exact".to_string()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockServerRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub collection_id: Option<String>,
    pub port: i64,
    pub enabled: bool,
    #[serde(default)]
    pub routes: Vec<MockRoute>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveMockServerPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub collection_id: Option<String>,
    #[serde(default)]
    pub port: i64,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub routes: Vec<MockRoute>,
}

fn mock_row_to_record(row: &sqlx::sqlite::SqliteRow) -> Result<MockServerRecord, String> {
    let routes_json: String = row.try_get(5).map_err(|e| e.to_string())?;
    Ok(MockServerRecord {
        id: row.try_get(0).map_err(|e| e.to_string())?,
        name: row.try_get(1).map_err(|e| e.to_string())?,
        collection_id: row.try_get(2).map_err(|e| e.to_string())?,
        port: row.try_get(3).map_err(|e| e.to_string())?,
        enabled: row.try_get::<i64, _>(4).map_err(|e| e.to_string())? != 0,
        routes: serde_json::from_str(&routes_json).unwrap_or_default(),
        created_at: row.try_get(6).map_err(|e| e.to_string())?,
        updated_at: row.try_get(7).map_err(|e| e.to_string())?,
    })
}

const MOCK_COLUMNS: &str =
    "id, name, collection_id, port, enabled, routes_json, created_at, updated_at";

async fn get_mock_server(pool: &SqlitePool, id: &str) -> Result<Option<MockServerRecord>, String> {
    let row = sqlx::query(&format!(
        "SELECT {MOCK_COLUMNS} FROM mock_servers WHERE id = ?"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    match row {
        Some(row) => Ok(Some(mock_row_to_record(&row)?)),
        None => Ok(None),
    }
}

async fn upsert_mock_server(
    pool: &SqlitePool,
    payload: &SaveMockServerPayload,
) -> Result<MockServerRecord, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Mock server name is required".to_string());
    }
    for route in &payload.routes {
        if route.path.trim().is_empty() {
            return Err("Every route needs a path".to_string());
        }
    }
    let id = payload.id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let routes_json = serde_json::to_string(&payload.routes).unwrap_or_else(|_| "[]".to_string());
    sqlx::query(
        "INSERT INTO mock_servers (id, name, collection_id, port, enabled, routes_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, collection_id = excluded.collection_id,
            port = excluded.port, enabled = excluded.enabled, routes_json = excluded.routes_json,
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&id)
    .bind(name)
    .bind(payload.collection_id.as_deref().filter(|c| !c.is_empty()))
    .bind(payload.port)
    .bind(payload.enabled)
    .bind(&routes_json)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get_mock_server(pool, &id)
        .await?
        .ok_or_else(|| "Mock server save failed".to_string())
}

/// Build the axum app for one mock server: matching routes with delay +
/// canned response, request logging (trimmed), 404 JSON fallback.
fn mock_router(server: MockServerRecord, pool: SqlitePool) -> Router {
    Router::new()
        .route(
            "/*path",
            any(move |method: Method, path: Path<String>, headers: HeaderMap, body: axum::body::Bytes| {
                let server = server.clone();
                let pool = pool.clone();
                async move {
                    handle_mock_request(&server, &pool, &method, &path.0, &headers, &body).await
                }
            }),
        )
        .fallback(any(|| async {
            (
                StatusCode::NOT_FOUND,
                axum::Json(json!({ "error": "No route matched. Start routes in the Mocks tab." })),
            )
        }))
}

async fn handle_mock_request(
    server: &MockServerRecord,
    pool: &SqlitePool,
    method: &Method,
    path: &str,
    headers: &HeaderMap,
    body: &[u8],
) -> impl IntoResponse {
    let method_str = method.as_str().to_uppercase();
    // axum's `/*path` wildcard captures without the leading slash.
    let path = format!("/{path}");
    let route = server
        .routes
        .iter()
        .find(|route| {
            route.enabled
                && route.method.to_uppercase() == method_str
                && match route.match_mode.as_str() {
                    "prefix" => path.starts_with(route.path.trim_end_matches('*')),
                    _ => path == route.path || path.trim_start_matches('/') == route.path.trim_start_matches('/'),
                }
        });

    let body_text = String::from_utf8_lossy(body).to_string();
    let body_text = if body_text.chars().count() > MAX_LOGGED_BODY_CHARS {
        body_text.chars().take(MAX_LOGGED_BODY_CHARS).collect()
    } else {
        body_text
    };
    let headers_json: Value = Value::Object(
        headers
            .iter()
            .map(|(k, v)| (k.to_string(), Value::String(v.to_str().unwrap_or("").to_string())))
            .collect::<serde_json::Map<String, Value>>(),
    );

    let (status, payload_headers, payload_body) = match route {
        Some(route) => {
            if route.delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(route.delay_ms.min(30_000))).await;
            }
            (
                StatusCode::from_u16(route.status).unwrap_or(StatusCode::OK),
                route.headers.clone(),
                route.body.clone(),
            )
        }
        None => (
            StatusCode::NOT_FOUND,
            HashMap::new(),
            json!({ "error": "No mock route matched", "method": method_str, "path": path }).to_string(),
        ),
    };

    // Log the request (best effort) and trim old entries.
    let insert_result = sqlx::query(
        "INSERT INTO mock_server_requests (id, server_id, method, path, query_json, headers_json, body, status_sent, matched_route_id)
         VALUES (?, ?, ?, ?, '{}', ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&server.id)
    .bind(&method_str)
    .bind(path)
    .bind(&headers_json.to_string())
    .bind(&body_text)
    .bind(status.as_u16() as i64)
    .bind(route.and_then(|route| route.id.clone()))
    .execute(pool)
    .await;
    // Best-effort logging: a failed insert must not affect the mocked response.
    let _ = insert_result;
    let _ = sqlx::query(
        "DELETE FROM mock_server_requests WHERE id IN (
            SELECT id FROM mock_server_requests WHERE server_id = ?
            ORDER BY created_at DESC LIMIT -1 OFFSET ?
        )",
    )
    .bind(&server.id)
    .bind(MOCK_REQUEST_RETENTION)
    .execute(pool)
    .await;

    let mut response_headers = HeaderMap::new();
    for (key, value) in &payload_headers {
        if let (Ok(name), Ok(value)) = (
            key.parse::<axum::http::HeaderName>(),
            value.parse::<axum::http::HeaderValue>(),
        ) {
            response_headers.insert(name, value);
        }
    }
    if !payload_headers.contains_key("Content-Type") && !payload_headers.contains_key("content-type") {
        response_headers.insert(
            axum::http::header::CONTENT_TYPE,
            axum::http::HeaderValue::from_static("application/json"),
        );
    }
    (status, response_headers, Body::from(payload_body))
}

// ---------------------------------------------------------------------------
// Webhook listener
// ---------------------------------------------------------------------------

pub struct WebhookAppState {
    pub pool: SqlitePool,
    pub app_handle: AppHandle,
}

fn verify_signature(
    secret: &str,
    signature_header: Option<&str>,
    timestamp_header: Option<&str>,
    body: &[u8],
) -> Result<(), String> {
    if secret.is_empty() {
        return Ok(());
    }
    let Some(timestamp) = timestamp_header else {
        return Err("Missing X-ScriptManager-Timestamp header".to_string());
    };
    let Ok(sent_at) = chrono::DateTime::parse_from_rfc3339(timestamp) else {
        return Err("X-ScriptManager-Timestamp must be RFC3339".to_string());
    };
    let now = chrono::Utc::now();
    if (now - sent_at.with_timezone(&chrono::Utc)).num_minutes().abs() > 5 {
        return Err("Timestamp outside the 5-minute replay window".to_string());
    }
    let Some(provided) = signature_header else {
        return Err("Missing X-ScriptManager-Signature header".to_string());
    };
    let provided = provided.trim_start_matches("sha256=").trim();
    let mut mac = hmac_sha256(secret.as_bytes(), timestamp.as_bytes(), body);
    let expected = hex_encode(&mut mac);
    if constant_time_eq(provided.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err("Signature mismatch".to_string())
    }
}

/// Minimal HMAC-SHA256 (block size 64) so no new dependency is needed.
fn hmac_sha256(key: &[u8], timestamp: &[u8], message: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut block = [0u8; 64];
    if key.len() > 64 {
        let digest = Sha256::digest(key);
        block[..32].copy_from_slice(&digest);
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for index in 0..64 {
        ipad[index] ^= block[index];
        opad[index] ^= block[index];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(timestamp);
    inner.update(message);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_hash);
    outer.finalize().into()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

async fn handle_webhook(
    state: State<Arc<WebhookAppState>>,
    Path(token): Path<String>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> impl IntoResponse {
    // Find a matching workflow trigger first, then a script webhook.
    let trigger: Option<(String, String, Option<String>, Option<i64>)> = sqlx::query_as(
        "SELECT workflow_triggers.id, workflow_triggers.workflow_id,
            workflow_triggers.webhook_secret_encrypted, workflows.published_version
         FROM workflow_triggers JOIN workflows ON workflows.id = workflow_triggers.workflow_id
         WHERE workflow_triggers.type = 'webhook' AND workflow_triggers.webhook_token = ?
           AND workflow_triggers.enabled = 1",
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let signature = headers.get("x-scriptmanager-signature").and_then(|v| v.to_str().ok());
    let timestamp = headers.get("x-scriptmanager-timestamp").and_then(|v| v.to_str().ok());
    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();

    if let Some((trigger_id, workflow_id, secret_encrypted, published_version)) = trigger {
        if published_version.is_none() {
            return (
                StatusCode::CONFLICT,
                axum::Json(json!({ "error": "Workflow has no published version to run" })),
            );
        }
        let master_key = crate::security::current_master_key().unwrap_or_default();
        let secret = secret_encrypted
            .as_deref()
            .filter(|s| !s.is_empty())
            .and_then(|encrypted| crate::security::decrypt_value(&master_key, encrypted).ok())
            .unwrap_or_default();
        if let Err(error) = verify_signature(&secret, signature, timestamp, &body) {
            return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": error })));
        }
        if !idempotency_key.is_empty() {
            let duplicate: Option<String> = sqlx::query_scalar(
                "SELECT id FROM workflow_runs WHERE correlation_id = ? LIMIT 1",
            )
            .bind(&idempotency_key)
            .fetch_optional(&state.pool)
            .await
            .unwrap_or(None);
            if duplicate.is_some() {
                return (
                    StatusCode::CONFLICT,
                    axum::Json(json!({ "error": "Duplicate Idempotency-Key", "runId": duplicate })),
                );
            }
        }
        let payload: Value = serde_json::from_slice(&body).unwrap_or_else(|_| json!({ "body": String::from_utf8_lossy(&body) }));
        let mut input = json!({ "trigger": "webhook", "triggerId": trigger_id, "payload": payload });
        if !idempotency_key.is_empty() {
            input["correlationId"] = json!(idempotency_key);
        }
        match crate::workflows::start_workflow_run_record(&state.pool, &workflow_id, input, "webhook", "webhook").await {
            Ok(detail) => (
                StatusCode::ACCEPTED,
                axum::Json(json!({ "accepted": true, "runId": detail.id, "status": detail.status })),
            ),
            Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, axum::Json(json!({ "error": error }))),
        }
    } else {
        // Script webhook fallback: scripts.webhook_token + signature settings.
        let script: Option<(String, Option<String>, i64)> = sqlx::query_as(
            "SELECT id, webhook_secret, require_webhook_signature FROM scripts WHERE webhook_token = ?",
        )
        .bind(&token)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);
        let Some((script_id, webhook_secret, require_signature)) = script else {
            return (StatusCode::NOT_FOUND, axum::Json(json!({ "error": "Unknown webhook token" })));
        };
        let secret = webhook_secret.unwrap_or_default();
        if require_signature != 0 || !secret.is_empty() {
            if let Err(error) = verify_signature(&secret, signature, timestamp, &body) {
                return (StatusCode::UNAUTHORIZED, axum::Json(json!({ "error": error })));
            }
        }
        let params: HashMap<String, String> = serde_json::from_slice(&body).unwrap_or_default();
        let exec_state = state.app_handle.state::<crate::execution::ExecutionState>();
        let result = crate::execution::run_script_core(
            state.pool.clone(),
            state.app_handle.clone(),
            &exec_state,
            crate::execution::RunScriptPayload {
                script_id,
                param_values: Some(params),
                build_id: Some(uuid::Uuid::new_v4().to_string()),
                triggered_by: Some("webhook".to_string()),
            },
        )
        .await;
        match result {
            Ok(result) => (
                StatusCode::ACCEPTED,
                axum::Json(json!({ "accepted": true, "buildId": result.build_id, "status": result.status })),
            ),
            Err(error) => (StatusCode::INTERNAL_SERVER_ERROR, axum::Json(json!({ "error": error }))),
        }
    }
}

pub fn webhook_router(state: Arc<WebhookAppState>) -> Router {
    Router::new()
        .route("/webhook/:token", any(handle_webhook))
        .with_state(state)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_mock_servers(pool: tauri::State<'_, SqlitePool>) -> Result<Vec<MockServerRecord>, String> {
    let rows = sqlx::query(&format!(
        "SELECT {MOCK_COLUMNS} FROM mock_servers ORDER BY created_at DESC"
    ))
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    rows.iter().map(mock_row_to_record).collect()
}

#[tauri::command]
pub async fn save_mock_server(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveMockServerPayload,
) -> Result<MockServerRecord, String> {
    let key = payload.id.as_deref().map(|id| format!("mock:{id}"));
    let saved = upsert_mock_server(&pool, &payload).await?;
    // A running server restarts with the new routes.
    if let Some(key) = key {
        if is_running(&key).await.is_some() {
            stop_listener(&key).await?;
            let app = mock_router(saved.clone(), (*pool).clone());
            spawn_listener(&key, "127.0.0.1", if saved.port > 0 { saved.port as u16 } else { 0 }, app).await?;
        }
    }
    Ok(saved)
}

#[tauri::command]
pub async fn delete_mock_server(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<bool, String> {
    stop_listener(&format!("mock:{id}")).await?;
    let result = sqlx::query("DELETE FROM mock_servers WHERE id = ?")
        .bind(&id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.rows_affected() > 0)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockServerStatus {
    pub server: MockServerRecord,
    pub running: bool,
    pub port: Option<u16>,
}

/// Start (or report the already-running) mock server in THIS process. When
/// called from the MCP stdio process, the server lives as long as that
/// process does — documented on the MCP tool.
pub(crate) async fn mock_start_core(
    pool: &SqlitePool,
    id: &str,
) -> Result<MockServerStatus, String> {
    let key = format!("mock:{id}");
    if let Some(port) = is_running(&key).await {
        let server = get_mock_server(pool, id)
            .await?
            .ok_or_else(|| "Mock server not found".to_string())?;
        return Ok(MockServerStatus { server, running: true, port: Some(port) });
    }
    let server = get_mock_server(pool, id)
        .await?
        .ok_or_else(|| "Mock server not found".to_string())?;
    let desired_port = if server.port > 0 { server.port as u16 } else { 0 };
    let app = mock_router(server.clone(), pool.clone());
    let port = spawn_listener(&key, "127.0.0.1", desired_port, app).await?;
    Ok(MockServerStatus { server, running: true, port: Some(port) })
}

pub(crate) async fn mock_stop_core(
    pool: &SqlitePool,
    id: &str,
) -> Result<MockServerStatus, String> {
    let key = format!("mock:{id}");
    stop_listener(&key).await?;
    let server = get_mock_server(pool, id).await?;
    match server {
        Some(server) => Ok(MockServerStatus { server, running: false, port: None }),
        None => Err("Mock server not found".to_string()),
    }
}

#[tauri::command]
pub async fn start_mock_server(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<MockServerStatus, String> {
    mock_start_core(&pool, &id).await
}

#[tauri::command]
pub async fn stop_mock_server(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<MockServerStatus, String> {
    mock_stop_core(&pool, &id).await
}

#[tauri::command]
pub async fn mock_server_status(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<MockServerStatus>, String> {
    let servers = list_mock_servers_inner(&pool).await?;
    let mut out = Vec::with_capacity(servers.len());
    for server in servers {
        let port = is_running(&format!("mock:{}", server.id)).await;
        out.push(MockServerStatus { running: port.is_some(), port, server });
    }
    Ok(out)
}

pub(crate) async fn list_mock_servers_inner(pool: &SqlitePool) -> Result<Vec<MockServerRecord>, String> {
    let rows = sqlx::query(&format!(
        "SELECT {MOCK_COLUMNS} FROM mock_servers ORDER BY created_at DESC"
    ))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    rows.iter().map(mock_row_to_record).collect()
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRequestRecord {
    pub id: String,
    pub server_id: String,
    pub method: String,
    pub path: String,
    pub headers: Value,
    pub body: String,
    pub status_sent: i64,
    pub matched_route_id: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_mock_requests(
    pool: tauri::State<'_, SqlitePool>,
    server_id: String,
) -> Result<Vec<MockRequestRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, server_id, method, path, headers_json, body, status_sent, matched_route_id, created_at
         FROM mock_server_requests WHERE server_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(&server_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|row| {
            Ok(MockRequestRecord {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                server_id: row.try_get(1).map_err(|e| e.to_string())?,
                method: row.try_get(2).map_err(|e| e.to_string())?,
                path: row.try_get(3).map_err(|e| e.to_string())?,
                headers: serde_json::from_str(&row.try_get::<String, _>(4).map_err(|e| e.to_string())?).unwrap_or(json!({})),
                body: row.try_get(5).map_err(|e| e.to_string())?,
                status_sent: row.try_get(6).map_err(|e| e.to_string())?,
                matched_route_id: row.try_get(7).map_err(|e| e.to_string())?,
                created_at: row.try_get(8).map_err(|e| e.to_string())?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?)
}

#[tauri::command]
pub async fn clear_mock_requests(
    pool: tauri::State<'_, SqlitePool>,
    server_id: String,
) -> Result<bool, String> {
    sqlx::query("DELETE FROM mock_server_requests WHERE server_id = ?")
        .bind(&server_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

// ---- Webhook listener commands ----

pub const WEBHOOK_PORT_KEY: &str = "webhook_port";
pub const DEFAULT_WEBHOOK_PORT: u16 = 8787;

async fn webhook_port(pool: &SqlitePool) -> u16 {
    crate::settings::get_setting(pool, WEBHOOK_PORT_KEY)
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_WEBHOOK_PORT)
}

/// Start the webhook listener in the background at app launch so external
/// systems can trigger runs without anyone clicking anything. Failures (port
/// taken) are logged, never fatal.
pub fn spawn_webhook_startup(app_handle: AppHandle, pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        let port = webhook_port(&pool).await;
        let app_state = Arc::new(WebhookAppState { pool, app_handle });
        match spawn_listener("webhook", "127.0.0.1", port, webhook_router(app_state)).await {
            Ok(actual) => log::info!("Webhook listener ready on 127.0.0.1:{actual}"),
            Err(error) => log::warn!("Webhook listener not started: {error}"),
        }
    });
}

#[tauri::command]
pub async fn start_webhook_listener(
    pool: tauri::State<'_, SqlitePool>,
    app_handle: AppHandle,
) -> Result<u16, String> {
    let port = webhook_port(&pool).await;
    let app_state = Arc::new(WebhookAppState { pool: (*pool).clone(), app_handle });
    spawn_listener("webhook", "127.0.0.1", port, webhook_router(app_state)).await
}

#[tauri::command]
pub async fn stop_webhook_listener() -> Result<bool, String> {
    stop_listener("webhook").await
}

#[tauri::command]
pub async fn webhook_listener_status() -> Result<Option<u16>, String> {
    Ok(is_running("webhook").await)
}

/// Rotate (or create) the webhook trigger of a workflow: new token + secret.
#[tauri::command]
pub async fn rotate_workflow_webhook(
    pool: tauri::State<'_, SqlitePool>,
    workflow_id: String,
) -> Result<Value, String> {
    if crate::workflows::get_workflow_record(&pool, &workflow_id).await.is_none() {
        return Err("Workflow not found".to_string());
    }
    let token = uuid::Uuid::new_v4().to_string().replace('-', "");
    let secret = uuid::Uuid::new_v4().to_string().replace('-', "");
    let master_key = crate::security::current_master_key()?;
    let encrypted = crate::security::encrypt_value(&master_key, &secret)?;
    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM workflow_triggers WHERE workflow_id = ? AND type = 'webhook'")
            .bind(&workflow_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
    match existing {
        Some(id) => {
            sqlx::query(
                "UPDATE workflow_triggers SET webhook_token = ?, webhook_secret_encrypted = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(&token)
            .bind(&encrypted)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        None => {
            sqlx::query(
                "INSERT INTO workflow_triggers (id, workflow_id, type, enabled, webhook_token, webhook_secret_encrypted)
                 VALUES (?, ?, 'webhook', 1, ?, ?)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&workflow_id)
            .bind(&token)
            .bind(&encrypted)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(json!({ "token": token, "secret": secret }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::test_pool;

    fn server_fixture(routes: Vec<MockRoute>) -> MockServerRecord {
        MockServerRecord {
            id: "ms-1".to_string(),
            name: "Test mock".to_string(),
            collection_id: None,
            port: 0,
            enabled: true,
            routes,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn route(method: &str, path: &str, status: u16, body: &str, match_mode: &str) -> MockRoute {
        MockRoute {
            id: Some(uuid::Uuid::new_v4().to_string()),
            method: method.to_string(),
            path: path.to_string(),
            status,
            headers: HashMap::new(),
            body: body.to_string(),
            delay_ms: 0,
            match_mode: match_mode.to_string(),
            enabled: true,
        }
    }

    #[tokio::test]
    async fn mock_server_matches_routes_and_logs_requests() {
        let pool = test_pool().await;
        let server = upsert_mock_server(
            &pool,
            &SaveMockServerPayload {
                id: Some("ms-1".to_string()),
                name: "Test mock".to_string(),
                collection_id: None,
                port: 0,
                enabled: true,
                routes: vec![
                    route("GET", "/users/me", 200, "{\"name\":\"ana\"}", "exact"),
                    route("POST", "/users", 201, "{\"created\":true}", "exact"),
                    route("GET", "/files/", 200, "{\"file\":true}", "prefix"),
                ],
            },
        )
        .await
        .unwrap();
        let app = mock_router(server.clone(), pool.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        let client = reqwest::Client::new();
        let base = format!("http://{addr}");

        let me = client.get(format!("{base}/users/me")).send().await.unwrap();
        assert_eq!(me.status().as_u16(), 200);
        assert_eq!(me.json::<Value>().await.unwrap()["name"], "ana");

        let created = client.post(format!("{base}/users")).body("{}").send().await.unwrap();
        assert_eq!(created.status().as_u16(), 201);

        let file = client.get(format!("{base}/files/report.pdf")).send().await.unwrap();
        assert_eq!(file.status().as_u16(), 200);

        let missing = client.get(format!("{base}/nope")).send().await.unwrap();
        assert_eq!(missing.status().as_u16(), 404);

        // Requests logged, oldest first so trimming keeps the newest.
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM mock_server_requests WHERE server_id = 'ms-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 4);
        let logged: (String, String, i64) =
            sqlx::query_as("SELECT method, path, status_sent FROM mock_server_requests WHERE server_id = 'ms-1' ORDER BY created_at ASC LIMIT 1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(logged.0, "GET");
        assert_eq!(logged.1, "/users/me");
        assert_eq!(logged.2, 200);
    }

    #[test]
    fn signature_verification_round_trip() {
        let secret = "hook-secret";
        let timestamp = "2026-09-13T12:00:00+00:00";
        let body = b"{\"hello\":\"world\"}";
        let mac = hmac_sha256(secret.as_bytes(), timestamp.as_bytes(), body);
        let signature = format!("sha256={}", hex_encode(&mac));
        // Within window: temporarily accept any parseable recent timestamp by
        // using "now" below.
        let now = chrono::Utc::now().to_rfc3339();
        let mac_now = hmac_sha256(secret.as_bytes(), now.as_bytes(), body);
        let signature_now = format!("sha256={}", hex_encode(&mac_now));
        let _ = (signature, timestamp);

        assert!(verify_signature(secret, Some(&signature_now), Some(&now), body).is_ok());
        assert!(verify_signature(secret, Some("sha256=deadbeef"), Some(&now), body).is_err());
        assert!(verify_signature(secret, None, Some(&now), body).is_err());
        assert!(verify_signature("", None, None, body).is_ok());
    }

    #[tokio::test]
    async fn listener_registry_start_stop() {
        let pool = test_pool().await;
        let server = server_fixture(vec![route("GET", "/ping", 200, "\"pong\"", "exact")]);
        let app = mock_router(server, pool);
        let key = "mock:test";
        assert!(is_running(key).await.is_none());
        let port = spawn_listener(key, "127.0.0.1", 0, app).await.unwrap();
        assert_eq!(is_running(key).await, Some(port));
        assert!(stop_listener(key).await.unwrap());

        // Port 0 assigns an ephemeral port.
        assert!(port > 0);
    }
}
