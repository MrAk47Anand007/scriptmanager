//! Model Context Protocol (MCP) stdio server.
//!
//! Launch the desktop binary with `--mcp` (or `--mcp-stdio`) and it acts as
//! an MCP server speaking newline-delimited JSON-RPC 2.0 on stdin/stdout.
//! This makes workflows, scripts, API requests, agent runs, and pending
//! approvals accessible to any MCP client (Claude Desktop, Codex, Zed, …).
//! Access is on-demand: the human asks, the agent calls a tool, results come
//! back through the protocol. The GUI never starts in this mode, and all
//! diagnostics go to stderr so stdout stays protocol-clean.

use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::path::PathBuf;

pub const MCP_FLAG_ALIASES: [&str; 2] = ["--mcp", "--mcp-stdio"];
const MAX_TOOL_TEXT_CHARS: usize = 40_000;

/// Must mirror the bundle identifier in tauri.conf.json; the MCP mode runs
/// before any Tauri AppHandle exists, so the app-data path is derived by hand
/// the same way Tauri resolves `app_data_dir`.
const BUNDLE_IDENTIFIER: &str = "com.scriptmanager.desktop";

fn app_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(|base| PathBuf::from(base).join(BUNDLE_IDENTIFIER))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|base| {
            PathBuf::from(base)
                .join("Library")
                .join("Application Support")
                .join(BUNDLE_IDENTIFIER)
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if let Some(xdg) = std::env::var_os("XDG_DATA_HOME") {
            return Some(PathBuf::from(xdg).join(BUNDLE_IDENTIFIER));
        }
        std::env::var_os("HOME")
            .map(|base| PathBuf::from(base).join(".local/share").join(BUNDLE_IDENTIFIER))
    }
}

pub fn current_executable() -> String {
    std::env::current_exe()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| "scriptmanager".to_string())
}

pub fn mcp_server_args() -> Vec<String> {
    vec!["--mcp".to_string()]
}

/// Config file locations surfaced to the UI so the user can inspect or edit
/// them; None when the platform location cannot be determined.
fn claude_desktop_config_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(|base| PathBuf::from(base).join("Claude").join("claude_desktop_config.json"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|base| {
            PathBuf::from(base)
                .join("Library/Application Support/Claude/claude_desktop_config.json")
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        None
    }
}

fn codex_config_path() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(|base| PathBuf::from(base).join(".codex").join("config.toml"))
        .or_else(|| std::env::var_os("USERPROFILE").map(|base| PathBuf::from(base).join(".codex").join("config.toml")))
}

pub fn claude_desktop_snippet() -> Value {
    json!({
        "mcpServers": {
            "scriptmanager": {
                "command": current_executable(),
                "args": mcp_server_args(),
            }
        }
    })
}

pub fn codex_snippet_toml() -> String {
    // TOML literal strings keep Windows backslashes readable without escaping.
    format!(
        "[mcp_servers.scriptmanager]\ncommand = '{}'\nargs = ['--mcp']\n",
        current_executable().replace('\'', "''")
    )
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatusView {
    pub exe_path: String,
    pub args: Vec<String>,
    pub claude_desktop_config_path: Option<String>,
    pub claude_desktop_installed: bool,
    pub codex_config_path: Option<String>,
    pub codex_installed: bool,
    pub claude_desktop_snippet: Value,
    pub codex_snippet_toml: String,
}

#[tauri::command]
pub async fn get_mcp_status() -> Result<McpStatusView, String> {
    let claude_path = claude_desktop_config_path();
    let claude_installed = claude_path
        .as_ref()
        .map(|p| p.is_file())
        .unwrap_or(false)
        && claude_path
            .as_ref()
            .map(|p| std::fs::read_to_string(p).unwrap_or_default().contains("scriptmanager"))
            .unwrap_or(false);
    let codex_path = codex_config_path();
    let codex_installed = codex_path
        .as_ref()
        .map(|p| p.is_file())
        .unwrap_or(false)
        && codex_path
            .as_ref()
            .map(|p| std::fs::read_to_string(p).unwrap_or_default().contains("mcp_servers.scriptmanager"))
            .unwrap_or(false);
    Ok(McpStatusView {
        exe_path: current_executable(),
        args: mcp_server_args(),
        claude_desktop_config_path: claude_path.map(|p| p.to_string_lossy().to_string()),
        claude_desktop_installed: claude_installed,
        codex_config_path: codex_path.map(|p| p.to_string_lossy().to_string()),
        codex_installed,
        claude_desktop_snippet: claude_desktop_snippet(),
        codex_snippet_toml: codex_snippet_toml(),
    })
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct InstallMcpPayload {
    /// "claude-desktop" or "codex"
    pub target: String,
}

/// Merge the ScriptManager MCP entry into the target client's config file.
/// Existing config content is preserved; only the ScriptManager entry is
/// added or refreshed.
#[tauri::command]
pub async fn install_mcp_config(payload: InstallMcpPayload) -> Result<Value, String> {
    match payload.target.as_str() {
        "claude-desktop" => install_claude_desktop(),
        "codex" => install_codex(),
        other => Err(format!("Unknown MCP install target: {other}")),
    }
}

fn install_claude_desktop() -> Result<Value, String> {
    let path = claude_desktop_config_path()
        .ok_or_else(|| "Claude Desktop config location is unknown on this platform".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut root: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}));
    if !root.is_object() {
        return Err(format!(
            "Claude Desktop config at {} is not a JSON object; refusing to overwrite",
            path.display()
        ));
    }
    let servers = root
        .as_object_mut()
        .unwrap()
        .entry("mcpServers")
        .or_insert_with(|| json!({}));
    if !servers.is_object() {
        return Err("Claude Desktop config mcpServers is not an object; refusing to overwrite".to_string());
    }
    servers
        .as_object_mut()
        .unwrap()
        .insert("scriptmanager".to_string(), {
            let snippet = claude_desktop_snippet();
            snippet["mcpServers"]["scriptmanager"].clone()
        });
    let serialized = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    write_atomic(&path, &serialized)?;
    Ok(json!({
        "target": "claude-desktop",
        "path": path.to_string_lossy(),
        "message": "ScriptManager MCP server installed into Claude Desktop config. Restart Claude Desktop to pick it up.",
    }))
}

fn install_codex() -> Result<Value, String> {
    let path = codex_config_path()
        .ok_or_else(|| "Codex config location is unknown on this platform".to_string())?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    // Naive but safe: we only ever append our own block, never rewrite the
    // user's file. A prior ScriptManager block is replaced by stripping lines
    // that belong to it (we know exactly what we wrote).
    let block = codex_snippet_toml();
    let cleaned = remove_managed_codex_block(&existing);
    let mut next = cleaned;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str("\n# Added by ScriptManager desktop\n");
    next.push_str(&block);
    write_atomic(&path, &next)?;
    Ok(json!({
        "target": "codex",
        "path": path.to_string_lossy(),
        "message": "ScriptManager MCP server installed into Codex config (~/.codex/config.toml). Restart Codex to pick it up.",
    }))
}

fn remove_managed_codex_block(content: &str) -> String {
    const MANAGED_HEADER: &str = "[mcp_servers.scriptmanager]";
    let mut lines: Vec<&str> = Vec::new();
    let mut in_block = false;
    for line in content.lines() {
        if line.trim() == "# Added by ScriptManager desktop" {
            in_block = true;
            continue;
        }
        if in_block {
            // The managed block ends when a different top-level table begins;
            // our own header and its key-value lines are always skipped.
            if line.starts_with('[') && line.trim() != MANAGED_HEADER {
                in_block = false;
                lines.push(line);
            }
            continue;
        }
        lines.push(line);
    }
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

fn write_atomic(path: &std::path::Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("scriptmanager-tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tool catalogue
// ---------------------------------------------------------------------------

struct ToolSpec {
    name: &'static str,
    description: &'static str,
    schema: Value,
}

fn tool_catalogue() -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: "app_overview",
            description: "Inventory of the local ScriptManager workspace: counts of workflows, scripts, API requests, and agent profiles, plus usage tips. Call this first when unsure what is available.",
            schema: json!({ "type": "object", "properties": {} }),
        },
        ToolSpec {
            name: "workflow_list",
            description: "List saved automation workflows with id, name, description, and published version.",
            schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Optional case-insensitive substring filter on name/description." }
                }
            }),
        },
        ToolSpec {
            name: "workflow_get",
            description: "Read a workflow's full definition (nodes, edges, variables) by id or exact name.",
            schema: json!({
                "type": "object",
                "properties": { "workflowId": { "type": "string" } },
                "required": ["workflowId"]
            }),
        },
        ToolSpec {
            name: "workflow_run",
            description: "Start a published workflow in the background and immediately return its run id. Poll workflow_run_status until the status is succeeded/failed/paused.",
            schema: json!({
                "type": "object",
                "properties": {
                    "workflowId": { "type": "string" },
                    "input": { "type": "object", "description": "Optional JSON object delivered to the workflow as its trigger payload." }
                },
                "required": ["workflowId"]
            }),
        },
        ToolSpec {
            name: "workflow_run_status",
            description: "Fetch one workflow run's status, per-node statuses, outputs, and errors.",
            schema: json!({
                "type": "object",
                "properties": { "runId": { "type": "string" } },
                "required": ["runId"]
            }),
        },
        ToolSpec {
            name: "workflow_runs_list",
            description: "List recent runs of a workflow (newest first).",
            schema: json!({
                "type": "object",
                "properties": {
                    "workflowId": { "type": "string" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": 50 }
                },
                "required": ["workflowId"]
            }),
        },
        ToolSpec {
            name: "workflow_run_cancel",
            description: "Request cooperative cancellation of a running workflow.",
            schema: json!({
                "type": "object",
                "properties": { "runId": { "type": "string" } },
                "required": ["runId"]
            }),
        },
        ToolSpec {
            name: "script_list",
            description: "List saved scripts (id, name, language, description) without content.",
            schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Optional case-insensitive substring filter on name/description." }
                }
            }),
        },
        ToolSpec {
            name: "script_get",
            description: "Read a script's metadata and content by id or exact name.",
            schema: json!({
                "type": "object",
                "properties": { "scriptId": { "type": "string" } },
                "required": ["scriptId"]
            }),
        },
        ToolSpec {
            name: "script_run",
            description: "Execute a stored script with its saved interpreter and return stdout/stderr/exitCode. Runs to completion; long scripts are capped at 5 minutes.",
            schema: json!({
                "type": "object",
                "properties": { "scriptId": { "type": "string" } },
                "required": ["scriptId"]
            }),
        },
        ToolSpec {
            name: "api_request_list",
            description: "List saved API requests (id, name, method, url, collection).",
            schema: json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string", "description": "Optional case-insensitive substring filter on name/url." }
                }
            }),
        },
        ToolSpec {
            name: "api_request_send",
            description: "Send a stored API request (with its saved auth, headers, and body) and return status, headers, and body.",
            schema: json!({
                "type": "object",
                "properties": { "requestId": { "type": "string" } },
                "required": ["requestId"]
            }),
        },
        ToolSpec {
            name: "agent_run_list",
            description: "List recent AI agent (Codex/Claude) runs launched from ScriptManager, newest first.",
            schema: json!({
                "type": "object",
                "properties": { "limit": { "type": "integer", "minimum": 1, "maximum": 50 } }
            }),
        },
        ToolSpec {
            name: "mock_server_list",
            description: "List local mock servers (canned HTTP endpoints) with running state, port, and routes.",
            schema: json!({ "type": "object", "properties": {} }),
        },
        ToolSpec {
            name: "mock_server_start",
            description: "Start a local mock server so its routes serve HTTP on 127.0.0.1. Returns the assigned port.",
            schema: json!({
                "type": "object",
                "properties": { "serverId": { "type": "string" } },
                "required": ["serverId"]
            }),
        },
        ToolSpec {
            name: "mock_server_stop",
            description: "Stop a running mock server.",
            schema: json!({
                "type": "object",
                "properties": { "serverId": { "type": "string" } },
                "required": ["serverId"]
            }),
        },
        ToolSpec {
            name: "script_save",
            description: "Update the content of a stored script (full access; requires human approval per script on first write — approve in ScriptManager's Approvals inbox, then retry).",
            schema: json!({
                "type": "object",
                "properties": {
                    "scriptId": { "type": "string" },
                    "content": { "type": "string", "description": "The complete new script content." }
                },
                "required": ["scriptId", "content"]
            }),
        },
        ToolSpec {
            name: "approval_list",
            description: "List pending human approvals (workflow approval nodes and remote-execution gates) that may be blocking runs.",
            schema: json!({ "type": "object", "properties": {} }),
        },
    ]
}

fn tool_definitions() -> Value {
    json!(tool_catalogue()
        .into_iter()
        .map(|spec| json!({
            "name": spec.name,
            "description": spec.description,
            "inputSchema": spec.schema,
        }))
        .collect::<Vec<_>>())
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

pub const MCP_ACCESS_LEVEL_KEY: &str = "mcp_access_level";
const ACCESS_LEVELS: [&str; 3] = ["observe", "develop", "full"];

async fn access_level(pool: &SqlitePool) -> String {
    match crate::settings::get_setting(pool, MCP_ACCESS_LEVEL_KEY).await {
        Ok(Some(level)) => {
            let level = level.trim().to_lowercase();
            if ACCESS_LEVELS.contains(&level.as_str()) {
                level
            } else {
                "develop".to_string()
            }
        }
        _ => "develop".to_string(),
    }
}

fn level_rank(level: &str) -> usize {
    ACCESS_LEVELS.iter().position(|item| *item == level).unwrap_or(1)
}

/// Minimum access level per tool: observe is read-only inventory; develop can
/// run things; full can cancel and mutate stored artifacts (write tools are
/// additionally approval-gated per resource).
fn tool_level(name: &str) -> &'static str {
    match name {
        "app_overview"
        | "workflow_list"
        | "workflow_get"
        | "workflow_run_status"
        | "workflow_runs_list"
        | "script_list"
        | "script_get"
        | "api_request_list"
        | "agent_run_list"
        | "approval_list"
        | "mock_server_list" => "observe",
        "workflow_run_cancel"
        | "script_save" => "full",
        _ => "develop",
    }
}

/// Fail-closed approval gate for mutating tools: consume an existing approved
/// decision (allow_once) or create a fresh pending request and return an
/// error the agent can surface to the human.
async fn ensure_resource_approval(
    pool: &SqlitePool,
    operation: &str,
    resource: &str,
    risk: &str,
    reason: &str,
    preview: Value,
) -> Result<(), String> {
    match crate::approvals::check_approval_for_resource(pool, operation, resource).await {
        Ok(()) => Ok(()),
        Err(message) if message == "no-approval-record" => {
            let id = crate::approvals::create_request_with_actor(
                pool,
                operation,
                resource,
                risk,
                reason,
                preview,
                "ai-agent",
                Some("MCP agent"),
            )
            .await?;
            Err(format!(
                "Approval required: request {id} is pending. Approve it in ScriptManager's Approvals inbox, then retry."
            ))
        }
        Err(message) => Err(message),
    }
}

fn truncate_text(text: String) -> String {
    if text.chars().count() <= MAX_TOOL_TEXT_CHARS {
        return text;
    }
    let truncated: String = text.chars().take(MAX_TOOL_TEXT_CHARS).collect();
    format!("{truncated}\n… [truncated by ScriptManager MCP]")
}

fn text_result(value: Value) -> Value {
    let text = truncate_text(serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string()));
    json!({ "content": [ { "type": "text", "text": text } ], "isError": false })
}

fn error_result(message: String) -> Value {
    json!({
        "content": [ { "type": "text", "text": truncate_text(message) } ],
        "isError": true,
    })
}

async fn call_tool(pool: &SqlitePool, name: &str, arguments: Value) -> Value {
    let args = arguments.as_object().cloned().unwrap_or_default();
    let query = args.get("query").and_then(Value::as_str).map(str::to_string);
    match name {
        "app_overview" => match overview(pool).await {
            Ok(value) => text_result(value),
            Err(message) => error_result(message),
        },
        "workflow_list" => {
            let mut workflows = crate::workflows::list_workflow_records(pool).await.unwrap_or_default();
            if let Some(q) = &query {
                let needle = q.to_lowercase();
                workflows.retain(|w| {
                    w.name.to_lowercase().contains(&needle)
                        || w.description.to_lowercase().contains(&needle)
                });
            }
            text_result(json!({
                "count": workflows.len(),
                "workflows": workflows.iter().map(|w| json!({
                    "id": w.id,
                    "name": w.name,
                    "description": w.description,
                    "publishedVersion": w.published_version,
                    "updatedAt": w.updated_at,
                })).collect::<Vec<_>>(),
            }))
        }
        "workflow_get" => match args.get("workflowId").and_then(Value::as_str) {
            Some(id) => match crate::workflows::get_workflow_record(pool, id).await {
                Some(record) => text_result(serde_json::to_value(&record).unwrap_or(Value::Null)),
                None => error_result(format!("Workflow not found: {id}")),
            },
            None => error_result("workflowId is required".to_string()),
        },
        "workflow_run" => {
            let Some(id) = args.get("workflowId").and_then(Value::as_str) else {
                return error_result("workflowId is required".to_string());
            };
            let input = args.get("input").cloned().unwrap_or_else(|| json!({}));
            match crate::workflows::start_workflow_run_record(pool, id, input, "mcp", "ai-agent").await {
                Ok(detail) => text_result(json!({
                    "runId": detail.id,
                    "workflowId": detail.workflow_id,
                    "status": detail.status,
                    "hint": "Poll workflow_run_status with this runId until finished.",
                })),
                Err(message) => error_result(message),
            }
        }
        "workflow_run_status" => match args.get("runId").and_then(Value::as_str) {
            Some(id) => match crate::workflows::get_run_detail(pool, id).await {
                Ok(detail) => text_result(serde_json::to_value(&detail).unwrap_or(Value::Null)),
                Err(message) => error_result(message),
            },
            None => error_result("runId is required".to_string()),
        },
        "workflow_runs_list" => {
            let Some(id) = args.get("workflowId").and_then(Value::as_str) else {
                return error_result("workflowId is required".to_string());
            };
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(10).min(50) as i64;
            match crate::workflows::list_run_summaries(pool, id, limit).await {
                Ok(runs) => text_result(json!({ "runs": runs })),
                Err(message) => error_result(message),
            }
        }
        "workflow_run_cancel" => match args.get("runId").and_then(Value::as_str) {
            Some(id) => match crate::workflows::cancel_workflow_run_core(pool, id).await {
                Ok(detail) => text_result(serde_json::to_value(&detail).unwrap_or(Value::Null)),
                Err(message) => error_result(message),
            },
            None => error_result("runId is required".to_string()),
        },
        "script_list" => match crate::commands::load_scripts(pool).await {
            Ok(scripts) => {
                let filtered: Vec<_> = scripts
                    .into_iter()
                    .filter(|s| match &query {
                        Some(q) => {
                            let needle = q.to_lowercase();
                            s.name.to_lowercase().contains(&needle)
                                || s.description.to_lowercase().contains(&needle)
                        }
                        None => true,
                    })
                    .map(|s| json!({
                        "id": s.id,
                        "name": s.name,
                        "language": s.language,
                        "description": s.description,
                        "scheduleCron": s.schedule_cron,
                        "lastRun": s.last_run,
                    }))
                    .collect();
                text_result(json!({ "count": filtered.len(), "scripts": filtered }))
            }
            Err(message) => error_result(message),
        },
        "script_get" => match args.get("scriptId").and_then(Value::as_str) {
            Some(id) => match crate::commands::load_scripts(pool).await {
                Ok(scripts) => match scripts.iter().find(|s| s.id == id || s.name == id) {
                    Some(script) => text_result(serde_json::to_value(script).unwrap_or(Value::Null)),
                    None => error_result(format!("Script not found: {id}")),
                },
                Err(message) => error_result(message),
            },
            None => error_result("scriptId is required".to_string()),
        },
        "script_run" => match args.get("scriptId").and_then(Value::as_str) {
            Some(id) => match crate::workflows::run_script_node(pool, id).await {
                Ok(output) => text_result(output),
                Err(message) => error_result(message),
            },
            None => error_result("scriptId is required".to_string()),
        },
        "api_request_list" => match crate::workflows::list_api_request_summaries(pool).await {
            Ok(requests) => {
                let filtered: Vec<_> = requests
                    .into_iter()
                    .filter(|r| match &query {
                        Some(q) => {
                            let needle = q.to_lowercase();
                            r["name"].as_str().unwrap_or("").to_lowercase().contains(&needle)
                                || r["url"].as_str().unwrap_or("").to_lowercase().contains(&needle)
                        }
                        None => true,
                    })
                    .collect();
                text_result(json!({ "count": filtered.len(), "requests": filtered }))
            }
            Err(message) => error_result(message),
        },
        "api_request_send" => match args.get("requestId").and_then(Value::as_str) {
            Some(id) => match crate::workflows::send_api_request_lenient(pool, id).await {
                Ok(output) => text_result(output),
                Err(message) => error_result(message),
            },
            None => error_result("requestId is required".to_string()),
        },
        "agent_run_list" => {
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(10).min(50) as i64;
            match crate::agents::list_runs_core(pool, limit).await {
                Ok(runs) => text_result(json!({ "runs": runs })),
                Err(message) => error_result(message),
            }
        }
        "mock_server_list" => match crate::http_service::list_mock_servers_inner(pool).await {
            Ok(servers) => text_result(json!({ "count": servers.len(), "servers": servers })),
            Err(message) => error_result(message),
        },
        "mock_server_start" => match args.get("serverId").and_then(Value::as_str) {
            Some(id) => match crate::http_service::mock_start_core(pool, id).await {
                Ok(status) => text_result(serde_json::to_value(&status).unwrap_or(Value::Null)),
                Err(message) => error_result(message),
            },
            None => error_result("serverId is required".to_string()),
        },
        "mock_server_stop" => match args.get("serverId").and_then(Value::as_str) {
            Some(id) => match crate::http_service::mock_stop_core(pool, id).await {
                Ok(status) => text_result(serde_json::to_value(&status).unwrap_or(Value::Null)),
                Err(message) => error_result(message),
            },
            None => error_result("serverId is required".to_string()),
        },
        "script_save" => {
            let Some(script_id) = args.get("scriptId").and_then(Value::as_str) else {
                return error_result("scriptId is required".to_string());
            };
            let Some(content) = args.get("content").and_then(Value::as_str) else {
                return error_result("content is required".to_string());
            };
            if content.trim().is_empty() {
                return error_result("content must not be empty".to_string());
            }
            // Approval gate: a human approves the first write per script.
            let preview = json!({
                "scriptId": script_id,
                "newLengthChars": content.chars().count(),
                "preview": truncate_text(content.chars().take(400).collect()),
            });
            if let Err(message) =
                ensure_resource_approval(pool, "mcp.script_save", script_id, "high", "MCP agent requested a script content change", preview).await
            {
                return error_result(message);
            }
            let result = sqlx::query(
                "UPDATE scripts SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(content)
            .bind(script_id)
            .execute(pool)
            .await;
            match result {
                Ok(updated) if updated.rows_affected() > 0 => {
                    text_result(json!({ "saved": true, "scriptId": script_id }))
                }
                Ok(_) => error_result(format!("Script not found: {script_id}")),
                Err(error) => error_result(error.to_string()),
            }
        }
        "approval_list" => match crate::approvals::list_pending_approvals(pool).await {
            Ok(approvals) => text_result(json!({ "count": approvals.len(), "approvals": approvals })),
            Err(message) => error_result(message),
        },
        other => error_result(format!("Unknown tool: {other}")),
    }
}

async fn overview(pool: &SqlitePool) -> Result<Value, String> {
    let workflow_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM workflows").fetch_one(pool).await.map_err(|e| e.to_string())?;
    let published: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflows WHERE published_version IS NOT NULL")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    let script_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM scripts").fetch_one(pool).await.map_err(|e| e.to_string())?;
    let request_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM api_requests").fetch_one(pool).await.map_err(|e| e.to_string())?;
    let profile_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM agent_profiles").fetch_one(pool).await.map_err(|e| e.to_string())?;
    Ok(json!({
        "app": "ScriptManager",
        "workspaces": {
            "workflows": workflow_count,
            "publishedWorkflows": published,
            "scripts": script_count,
            "apiRequests": request_count,
            "agentProfiles": profile_count,
        },
        "tips": [
            "Use workflow_list then workflow_run to execute an automation; poll workflow_run_status.",
            "script_run executes a stored script locally; api_request_send fires a stored request.",
            "Workflow definitions are versioned: run requires a published version.",
        ],
    }))
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

fn jsonrpc_ok(id: Value, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

fn jsonrpc_error(id: Value, code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }).to_string()
}

const ERR_PARSE: i64 = -32700;
const ERR_METHOD: i64 = -32601;
const ERR_INVALID: i64 = -32602;

async fn handle_request(pool: &SqlitePool, request: Value) -> Option<String> {
    // Notifications (no id) are accepted and produce no response.
    let id = request.get("id").cloned();
    let method = request.get("method").and_then(Value::as_str).unwrap_or_default().to_string();

    if method.starts_with("notifications/") {
        return None;
    }

    let Some(id) = id else { return None };

    match method.as_str() {
        "initialize" => {
            let requested = request
                .pointer("/params/protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or("2025-06-18")
                .to_string();
            Some(jsonrpc_ok(
                id,
                json!({
                    "protocolVersion": requested,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": "scriptmanager", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": "ScriptManager exposes saved workflows, scripts, and API requests as tools. Start with app_overview, then workflow_list / script_list / api_request_list.",
                }),
            ))
        }
        "ping" => Some(jsonrpc_ok(id, json!({}))),
        "tools/list" => Some(jsonrpc_ok(id, json!({ "tools": tool_definitions() }))),
        "tools/call" => {
            let name = request.pointer("/params/name").and_then(Value::as_str).unwrap_or_default().to_string();
            if name.is_empty() {
                return Some(jsonrpc_error(id, ERR_INVALID, "tools/call requires params.name"));
            }
            let arguments = request.pointer("/params/arguments").cloned().unwrap_or_else(|| json!({}));
            if !arguments.is_object() {
                return Some(jsonrpc_error(id, ERR_INVALID, "tools/call arguments must be an object"));
            }
            let known = tool_catalogue().iter().any(|spec| spec.name == name);
            if !known {
                return Some(jsonrpc_error(id, ERR_METHOD, &format!("Unknown tool: {name}")));
            }
            // Guardrail: every tool declares its minimum access level and the
            // configured MCP access level gates the call.
            let level = access_level(pool).await;
            let required = tool_level(&name);
            if level_rank(&level) < level_rank(required) {
                return Some(jsonrpc_ok(
                    id,
                    error_result(format!(
                        "Tool '{name}' requires '{required}' MCP access, but the current level is '{level}'. Raise it in ScriptManager → Agents → AI Access."
                    )),
                ));
            }
            let result = call_tool(pool, &name, arguments).await;
            Some(jsonrpc_ok(id, result))
        }
        other => Some(jsonrpc_error(id, ERR_METHOD, &format!("Method not found: {other}"))),
    }
}

/// Run the MCP stdio loop until stdin EOF. Returns the process exit code.
pub async fn run_stdio_server() -> i32 {
    let Some(data_dir) = app_data_dir() else {
        eprintln!("scriptmanager --mcp: cannot resolve app data dir");
        return 1;
    };
    let db_path = data_dir.join("scriptmanager.db");
    let pool = match crate::db::init_db_at_path(&db_path).await {
        Ok(pool) => pool,
        Err(error) => {
            eprintln!("scriptmanager --mcp: failed to open database: {error}");
            return 1;
        }
    };

    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut stdout = tokio::io::stdout();

    eprintln!(
        "scriptmanager --mcp: serving {} tools on stdio (db: {})",
        tool_catalogue().len(),
        db_path.display()
    );

    loop {
        let line = match lines.next_line().await {
            Ok(Some(line)) => line,
            Ok(None) => break,
            Err(error) => {
                eprintln!("scriptmanager --mcp: stdin read error: {error}");
                break;
            }
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(error) => {
                let response = jsonrpc_error(Value::Null, ERR_PARSE, &format!("Parse error: {error}"));
                if stdout.write_all(response.as_bytes()).await.is_err() {
                    break;
                }
                let _ = stdout.write_all(b"\n").await;
                let _ = stdout.flush().await;
                continue;
            }
        };
        let response = handle_request(&pool, request).await;
        if let Some(response) = response {
            if stdout.write_all(response.as_bytes()).await.is_err() {
                break;
            }
            if stdout.write_all(b"\n").await.is_err() {
                break;
            }
            if stdout.flush().await.is_err() {
                break;
            }
        }
    }
    0
}

use serde::Deserialize;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalogue_has_unique_names_and_schemas() {
        let tools = tool_catalogue();
        assert!(tools.len() >= 12);
        let mut names: Vec<_> = tools.iter().map(|t| t.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), tools.len());
        for tool in &tools {
            assert!(tool.schema.is_object(), "{} schema must be an object", tool.name);
        }
    }

    #[test]
    fn snippets_reference_current_executable_and_flag() {
        let claude = claude_desktop_snippet();
        assert_eq!(claude["mcpServers"]["scriptmanager"]["args"][0], "--mcp");
        assert!(claude["mcpServers"]["scriptmanager"]["command"].is_string());
        let codex = codex_snippet_toml();
        assert!(codex.starts_with("[mcp_servers.scriptmanager]"));
        assert!(codex.contains("command = '"));
        assert!(codex.contains("args = ['--mcp']"));
    }

    #[test]
    fn managed_codex_block_replacement() {
        let existing = "[mcp_servers.other]\ncommand = 'x'\n\n# Added by ScriptManager desktop\n[mcp_servers.scriptmanager]\ncommand = 'old'\nargs = ['--mcp']\n";
        let cleaned = remove_managed_codex_block(existing);
        assert!(cleaned.contains("[mcp_servers.other]"));
        assert!(!cleaned.contains("scriptmanager"));
        assert!(cleaned.contains("command = 'x'"));
    }

    #[test]
    fn jsonrpc_error_shapes() {
        let ok = jsonrpc_ok(json!(7), json!({ "a": 1 }));
        assert!(ok.contains("\"id\":7"));
        let err = jsonrpc_error(json!(7), ERR_METHOD, "nope");
        assert!(err.contains("-32601"));
    }

    #[tokio::test]
    async fn handle_request_initialize_and_tools_list() {
        let pool = crate::schema::test_pool().await;
        let init = json!({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "test" } }
        });
        let response = handle_request(&pool, init).await.expect("initialize response");
        assert!(response.contains("2024-11-05"));
        assert!(response.contains("scriptmanager"));

        let list = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        let response = handle_request(&pool, list).await.expect("tools/list response");
        assert!(response.contains("workflow_run"));
        assert!(response.contains("app_overview"));
    }

    #[tokio::test]
    async fn handle_request_unknown_tool_and_method() {
        let pool = crate::schema::test_pool().await;
        let call = json!({
            "jsonrpc": "2.0", "id": 3,
            "method": "tools/call",
            "params": { "name": "not_a_tool", "arguments": {} }
        });
        let response = handle_request(&pool, call).await.expect("call response");
        assert!(response.contains("-32601"));

        let bogus = json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" });
        let response = handle_request(&pool, bogus).await.expect("bogus response");
        assert!(response.contains("Method not found"));
    }

    #[tokio::test]
    async fn handle_request_notification_produces_nothing() {
        let pool = crate::schema::test_pool().await;
        let notification = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert!(handle_request(&pool, notification).await.is_none());
    }

    #[tokio::test]
    async fn tools_call_overview_works_against_schema() {
        let pool = crate::schema::test_pool().await;
        let call = json!({
            "jsonrpc": "2.0", "id": 5,
            "method": "tools/call",
            "params": { "name": "app_overview", "arguments": {} }
        });
        let response = handle_request(&pool, call).await.expect("overview response");
        assert!(response.contains("\"isError\":false"));
        assert!(response.contains("workflows"));
    }

    #[tokio::test]
    async fn tools_call_workflow_list_empty() {
        let pool = crate::schema::test_pool().await;
        let call = json!({
            "jsonrpc": "2.0", "id": 6,
            "method": "tools/call",
            "params": { "name": "workflow_list", "arguments": { "query": "deploy" } }
        });
        let response = handle_request(&pool, call).await.expect("workflow_list response");
        // The tool payload is embedded as an escaped JSON string inside the
        // JSON-RPC text content.
        assert!(response.contains(r#"\"count\":0"#));
        assert!(response.contains(r#""isError":false"#));
    }

    async fn set_access_level(pool: &sqlx::SqlitePool, level: &str) {
        crate::settings::set_setting(pool, MCP_ACCESS_LEVEL_KEY, level).await.unwrap();
    }

    fn call_arguments(name: &str, arguments: Value) -> Value {
        json!({
            "jsonrpc": "2.0", "id": 99,
            "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        })
    }

    #[tokio::test]
    async fn guard_blocks_tools_below_configured_level() {
        let pool = crate::schema::test_pool().await;
        set_access_level(&pool, "observe").await;

        // script_run is a develop tool: blocked at observe, reported as a tool
        // error (isError), not a protocol error.
        let response = handle_request(&pool, call_arguments("script_run", json!({ "scriptId": "x" })))
            .await
            .expect("guard response");
        assert!(response.contains(r#""isError":true"#));
        assert!(response.contains("requires 'develop' MCP access"));

        // observe tools keep working.
        let response = handle_request(&pool, call_arguments("workflow_list", json!({})))
            .await
            .expect("list response");
        assert!(response.contains(r#""isError":false"#));
    }

    #[tokio::test]
    async fn guard_allows_develop_level_runtime_tools() {
        let pool = crate::schema::test_pool().await;
        set_access_level(&pool, "develop").await;
        let response = handle_request(&pool, call_arguments("script_run", json!({ "scriptId": "ghost" })))
            .await
            .expect("script_run response");
        assert!(response.contains(r#""isError":true"#));
        assert!(response.contains("Script not found") || response.contains("not found"));
    }

    #[tokio::test]
    async fn script_save_is_approval_gated_fail_closed() {
        let pool = crate::schema::test_pool().await;
        set_access_level(&pool, "full").await;
        sqlx::query("INSERT INTO scripts (id, name, filename, language, content) VALUES ('s-1', 'Gated', 'g.py', 'python', 'print(1)')")
            .execute(&pool)
            .await
            .unwrap();

        // First attempt: creates a pending approval, fails closed.
        let first = handle_request(&pool, call_arguments("script_save", json!({ "scriptId": "s-1", "content": "print(2)" })))
            .await
            .expect("first save");
        assert!(first.contains(r#""isError":true"#), "first: {first}");
        assert!(first.contains("pending"), "first: {first}");

        let content: String =
            sqlx::query_scalar("SELECT content FROM scripts WHERE id = 's-1'").fetch_one(&pool).await.unwrap();
        assert_eq!(content, "print(1)", "content must not change before approval");

        // Approve with allow_once.
        let request_id: String = sqlx::query_scalar(
            "SELECT id FROM approval_requests WHERE operation = 'mcp.script_save' AND status = 'pending'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        crate::approvals::decide_approval_core(
            &pool,
            crate::approvals::DecideApprovalPayload { id: request_id, decision: "allow_once".into(), note: None },
        )
        .await
        .unwrap();

        // Retry consumes the decision and succeeds.
        let second = handle_request(&pool, call_arguments("script_save", json!({ "scriptId": "s-1", "content": "print(2)" })))
            .await
            .expect("second save");
        assert!(second.contains(r#""isError":false"#));
        let content: String =
            sqlx::query_scalar("SELECT content FROM scripts WHERE id = 's-1'").fetch_one(&pool).await.unwrap();
        assert_eq!(content, "print(2)");

        // A further write needs a fresh approval (allow_once consumed).
        let third = handle_request(&pool, call_arguments("script_save", json!({ "scriptId": "s-1", "content": "print(3)" })))
            .await
            .expect("third save");
        assert!(third.contains("pending"));
    }

    #[tokio::test]
    async fn tools_call_workflow_run_missing_workflow_is_error() {
        let pool = crate::schema::test_pool().await;
        let call = json!({
            "jsonrpc": "2.0", "id": 8,
            "method": "tools/call",
            "params": { "name": "workflow_run", "arguments": { "workflowId": "ghost" } }
        });
        let response = handle_request(&pool, call).await.expect("workflow_run response");
        assert!(response.contains(r#""isError":true"#));
    }

    #[tokio::test]
    async fn tools_call_script_run_missing_script_is_error_result() {
        let pool = crate::schema::test_pool().await;
        let call = json!({
            "jsonrpc": "2.0", "id": 7,
            "method": "tools/call",
            "params": { "name": "script_run", "arguments": { "scriptId": "ghost" } }
        });
        let response = handle_request(&pool, call).await.expect("script_run response");
        assert!(response.contains("\"isError\":true"));
    }
}
