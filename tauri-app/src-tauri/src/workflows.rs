use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, Row, SqlitePool};
use std::collections::{HashMap, HashSet};

const WORKSPACE_ID: &str = "default";
const KNOWN_NODE_TYPES: [&str; 11] = [
    "script",
    "api",
    "remote",
    "condition",
    "transform",
    "delay",
    "approval",
    "parallel",
    "join",
    "notification",
    "agent",
];

// Run / node statuses mirror the web worker vocabulary.
const STATUS_SUCCEEDED: &str = "succeeded";
const STATUS_FAILED: &str = "failed";
const STATUS_CANCELLED: &str = "cancelled";
const STATUS_SKIPPED: &str = "skipped";
const STATUS_PAUSED: &str = "paused";
const STATUS_WAITING_APPROVAL: &str = "waiting_approval";

// ---------- Records (camelCase to match Prisma-shaped renderer contracts) ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub published_version: Option<i64>,
    pub project_id: Option<String>,
    pub definition: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunSummary {
    pub id: String,
    pub workflow_id: String,
    pub status: String,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowNodeRunRow {
    pub node_id: String,
    pub node_type: String,
    pub status: String,
    pub attempt: i64,
    pub input_json: Option<String>,
    pub output_json: Option<String>,
    pub error_json: Option<String>,
    pub selected_port: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunDetail {
    pub id: String,
    pub workflow_id: String,
    pub status: String,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub node_runs: Vec<WorkflowNodeRunRow>,
}

// ---------- Payloads ----------

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowPayload {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub definition: serde_json::Value,
    #[serde(rename = "projectId", default)]
    pub project_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveWorkflowPayload {
    pub id: String,
    pub definition: serde_json::Value,
    #[serde(rename = "projectId")]
    pub project_id: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RunWorkflowPayload {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "workflowId", default)]
    pub workflow_id: Option<String>,
    #[serde(default)]
    pub input: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct RetryNodePayload {
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(rename = "nodeId")]
    pub node_id: String,
}

// ---------- Definition model ----------

#[derive(Debug, Clone, Deserialize)]
struct WfNode {
    id: String,
    #[serde(rename = "type")]
    node_type: String,
    #[serde(default)]
    config: serde_json::Value,
    #[serde(rename = "timeoutMs", default)]
    timeout_ms: Option<i64>,
    #[serde(default)]
    retry: Option<RetryPolicy>,
    #[serde(rename = "failurePolicy", default)]
    failure_policy: Option<FailurePolicy>,
}

#[derive(Debug, Clone, Deserialize)]
struct RetryPolicy {
    #[serde(rename = "maxAttempts", default = "default_max_attempts")]
    max_attempts: i64,
}

fn default_max_attempts() -> i64 {
    1
}

#[derive(Debug, Clone, Deserialize)]
struct FailurePolicy {
    #[serde(default = "default_failure_action")]
    action: String,
}

fn default_failure_action() -> String {
    "stop".to_string()
}

#[derive(Debug, Clone, Deserialize)]
struct WfEdge {
    id: String,
    source: String,
    target: String,
    #[serde(rename = "sourcePort", default)]
    source_port: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct WfDefinition {
    name: String,
    description: String,
    variables: serde_json::Value,
    nodes: Vec<WfNode>,
    edges: Vec<WfEdge>,
}

fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn is_plugin_type(t: &str) -> bool {
    t.starts_with("plugin:")
}

fn node_type_known(t: &str) -> bool {
    KNOWN_NODE_TYPES.contains(&t) || is_plugin_type(t)
}

// Port of lib/workflows/schema.ts parseWorkflowDefinition (structural part).
pub(crate) fn parse_definition(value: &serde_json::Value) -> Result<WfDefinition, String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "workflow must be an object".to_string())?;
    if obj.get("schemaVersion") != Some(&serde_json::Value::from(1)) {
        return Err("schemaVersion must be 1".to_string());
    }
    let name = obj
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "name must be a non-empty string".to_string())?;
    let description = obj
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let variables = obj
        .get("variables")
        .cloned()
        .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
    let nodes_raw = obj
        .get("nodes")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "nodes must be an array".to_string())?;
    let edges_raw = obj
        .get("edges")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "edges must be an array".to_string())?;

    let mut nodes = Vec::with_capacity(nodes_raw.len());
    for (index, raw) in nodes_raw.iter().enumerate() {
        let node_obj = raw
            .as_object()
            .ok_or_else(|| format!("nodes[{}] must be an object", index))?;
        let node_type = node_obj
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("nodes[{}].type must be a non-empty string", index))?;
        if node_type.trim().is_empty() || !node_type_known(node_type) {
            return Err(format!("nodes[{}].type is unsupported", index));
        }
        let config = node_obj.get("config").cloned().unwrap_or_else(|| {
            serde_json::Value::Object(Default::default())
        });
        if !config.is_object() {
            return Err(format!("nodes[{}].config must be an object", index));
        }
        validate_node_config(node_type, &config, &format!("nodes[{}].config", index))?;
        let mut node: WfNode = serde_json::from_value(raw.clone())
            .map_err(|_| format!("nodes[{}] has an invalid shape", index))?;
        node.node_type = node_type.to_string();
        if node.id.trim().is_empty() {
            return Err(format!("nodes[{}].id must be a non-empty string", index));
        }
        nodes.push(node);
    }

    let mut edges = Vec::with_capacity(edges_raw.len());
    for (index, raw) in edges_raw.iter().enumerate() {
        let edge_obj = raw
            .as_object()
            .ok_or_else(|| format!("edges[{}] must be an object", index))?;
        for key in ["id", "source", "target"] {
            if edge_obj
                .get(key)
                .and_then(|v| v.as_str())
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
            {
                return Err(format!("edges[{}].{} must be a non-empty string", index, key));
            }
        }
        if let Some(port) = edge_obj.get("sourcePort") {
            if port != "true" && port != "false" {
                return Err(format!("edges[{}].sourcePort is invalid", index));
            }
        }
        let edge: WfEdge = serde_json::from_value(raw.clone())
            .map_err(|_| format!("edges[{}] has an invalid shape", index))?;
        edges.push(edge);
    }

    Ok(WfDefinition {
        name,
        description,
        variables,
        nodes,
        edges,
    })
}

fn validate_node_config(
    node_type: &str,
    config: &serde_json::Value,
    path: &str,
) -> Result<(), String> {
    let required: &[&str] = match node_type {
        "script" => &["scriptId"],
        "api" => &["requestId"],
        "remote" => &["scriptId", "profileId"],
        "condition" => &["left", "operator"],
        "transform" => &["mappings"],
        "approval" => &["prompt"],
        "notification" => &["channel", "message"],
        "agent" => &["profileId", "prompt"],
        _ => &[],
    };
    for key in required {
        if config.get(key).is_none() {
            return Err(format!("{}.{} is required", path, key));
        }
    }
    if node_type == "delay" {
        match config.get("durationMs").and_then(|v| v.as_i64()) {
            Some(n) if n >= 0 => {}
            _ => return Err(format!("{}.durationMs must be a non-negative integer", path)),
        }
    }
    Ok(())
}

// Port of lib/workflows/graph.ts validateWorkflowGraph (structural issues).
pub(crate) fn validate_graph(def: &WfDefinition) -> Vec<(String, String)> {
    let mut issues = Vec::new();
    let mut node_ids = HashSet::new();
    let mut nodes = HashMap::new();
    for (index, node) in def.nodes.iter().enumerate() {
        if !node_ids.insert(node.id.clone()) {
            issues.push((
                "duplicate_node_id".to_string(),
                format!("Duplicate node id: {}", node.id),
            ));
        } else {
            nodes.insert(node.id.clone(), index);
        }
    }
    let mut edge_ids = HashSet::new();
    for edge in &def.edges {
        if !edge_ids.insert(edge.id.clone()) {
            issues.push((
                "duplicate_edge_id".to_string(),
                format!("Duplicate edge id: {}", edge.id),
            ));
        }
        if !nodes.contains_key(&edge.source) {
            issues.push((
                "missing_source".to_string(),
                format!("Missing source node: {}", edge.source),
            ));
        }
        if !nodes.contains_key(&edge.target) {
            issues.push((
                "missing_target".to_string(),
                format!("Missing target node: {}", edge.target),
            ));
        }
        if let Some(port) = edge.source_port.as_ref() {
            let source_is_condition = def
                .nodes
                .iter()
                .find(|n| n.id == edge.source)
                .map(|n| n.node_type == "condition")
                .unwrap_or(false);
            if (port == "true" || port == "false") && !source_is_condition {
                issues.push((
                    "invalid_source_port".to_string(),
                    "Only condition nodes may use true/false output ports".to_string(),
                ));
            }
        }
    }
    let blocking = issues.iter().any(|(code, _)| {
        code == "duplicate_node_id" || code == "missing_source" || code == "missing_target"
    });
    if !blocking {
        // Kahn's algorithm for cycle detection.
        let mut indegree: HashMap<&str, usize> =
            def.nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
        let mut outgoing: HashMap<&str, Vec<&str>> =
            def.nodes.iter().map(|n| (n.id.as_str(), Vec::new())).collect();
        for edge in &def.edges {
            *indegree.entry(edge.target.as_str()).or_insert(0) += 1;
            outgoing
                .entry(edge.source.as_str())
                .or_default()
                .push(edge.target.as_str());
        }
        let mut queue: Vec<&str> = indegree
            .iter()
            .filter(|(_, count)| **count == 0)
            .map(|(id, _)| *id)
            .collect();
        let mut visited = 0;
        while let Some(id) = queue.pop() {
            visited += 1;
            if let Some(targets) = outgoing.get(id) {
                for target in targets.clone() {
                    if let Some(count) = indegree.get_mut(target) {
                        *count -= 1;
                        if *count == 0 {
                            queue.push(target);
                        }
                    }
                }
            }
        }
        if visited != def.nodes.len() {
            issues.push((
                "cycle".to_string(),
                "Workflow graph contains a cycle".to_string(),
            ));
        }
    }
    issues
}

// Port of lib/workflows/graph.ts planWorkflow: deterministic layered plan.
pub(crate) fn plan_layers(def: &WfDefinition) -> Result<Vec<Vec<String>>, String> {
    let issues = validate_graph(def);
    if !issues.is_empty() {
        let codes: Vec<String> = issues.into_iter().map(|(code, _)| code).collect();
        return Err(format!("Cannot plan invalid workflow: {}", codes.join(", ")));
    }
    let mut indegree: HashMap<&str, usize> =
        def.nodes.iter().map(|n| (n.id.as_str(), 0)).collect();
    let mut outgoing: HashMap<&str, Vec<&str>> =
        def.nodes.iter().map(|n| (n.id.as_str(), Vec::new())).collect();
    for edge in &def.edges {
        *indegree.entry(edge.target.as_str()).or_insert(0) += 1;
        outgoing
            .entry(edge.source.as_str())
            .or_default()
            .push(edge.target.as_str());
    }
    let mut ready: Vec<String> = indegree
        .iter()
        .filter(|(_, count)| **count == 0)
        .map(|(id, _)| id.to_string())
        .collect();
    ready.sort();
    let mut layers = Vec::new();
    while !ready.is_empty() {
        layers.push(ready.clone());
        let mut next = Vec::new();
        for id in &ready {
            if let Some(targets) = outgoing.get(id.as_str()).cloned() {
                let mut sorted = targets;
                sorted.sort_unstable();
                for target in sorted {
                    if let Some(count) = indegree.get_mut(target) {
                        *count -= 1;
                        if *count == 0 {
                            next.push(target.to_string());
                        }
                    }
                }
            }
        }
        next.sort();
        ready = next;
    }
    Ok(layers)
}

// ---------- Mapping resolution (minimal {{path}} subset of resolveMappings) ----------

fn lookup_path(context: &serde_json::Value, path: &str) -> Option<serde_json::Value> {
    let mut current = context;
    for part in path.split('.') {
        current = current.get(part)?;
    }
    Some(current.clone())
}

fn resolve_string_template(text: &str, context: &serde_json::Value) -> serde_json::Value {
    let trimmed = text.trim();
    // Whole-string placeholder preserves the raw type.
    if trimmed.starts_with("{{") && trimmed.ends_with("}}") {
        let inner = trimmed[2..trimmed.len() - 2].trim();
        if !inner.is_empty() && !inner.contains(['{', '}']) {
            if let Some(value) = lookup_path(context, inner) {
                return value;
            }
        }
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find("}}") {
            Some(end) => {
                let key = after[..end].trim();
                match lookup_path(context, key) {
                    Some(serde_json::Value::String(s)) => out.push_str(&s),
                    Some(other) => out.push_str(&serde_json::to_string(&other).unwrap_or_default()),
                    None => out.push_str(&format!("{{{{{}}}}}", key)),
                }
                rest = &after[end + 2..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    serde_json::Value::String(out)
}

pub(crate) fn resolve_mappings(
    value: &serde_json::Value,
    context: &serde_json::Value,
) -> serde_json::Value {
    match value {
        serde_json::Value::String(s) => resolve_string_template(s, context),
        serde_json::Value::Array(items) => serde_json::Value::Array(
            items.iter().map(|v| resolve_mappings(v, context)).collect(),
        ),
        serde_json::Value::Object(map) => serde_json::Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), resolve_mappings(v, context)))
                .collect(),
        ),
        other => other.clone(),
    }
}

// ---------- Persistence ----------

async fn get_workflow_row(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<WorkflowRow>, String> {
    sqlx::query_as::<_, WorkflowRow>(
        "SELECT id, name, description, published_version, project_id, draft_definition,
            created_at, updated_at
         FROM workflows WHERE id = ? AND workspace_id = ?",
    )
    .bind(id)
    .bind(WORKSPACE_ID)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, FromRow)]
struct WorkflowRow {
    id: String,
    name: String,
    description: String,
    published_version: Option<i64>,
    project_id: Option<String>,
    draft_definition: String,
    created_at: String,
    updated_at: String,
}

async fn to_record(_pool: &SqlitePool, row: WorkflowRow) -> Result<WorkflowRecord, String> {
    let definition: serde_json::Value =
        serde_json::from_str(&row.draft_definition).unwrap_or(serde_json::Value::Null);
    Ok(WorkflowRecord {
        id: row.id,
        name: row.name,
        description: row.description,
        published_version: row.published_version,
        project_id: row.project_id,
        definition,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub(crate) async fn list_workflow_records(pool: &SqlitePool) -> Result<Vec<WorkflowRecord>, String> {
    let rows = sqlx::query_as::<_, WorkflowRow>(
        "SELECT id, name, description, published_version, project_id, draft_definition,
            created_at, updated_at
         FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC",
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

fn validate_project_connected(
    project: &Option<crate::projects::ProjectRecord>,
) -> Result<(), String> {
    match project {
        Some(p) => {
            if p.repository_root.as_ref().map(|r| r.trim().is_empty()).unwrap_or(true) {
                return Err("Selected project is not connected to a repository".to_string());
            }
            Ok(())
        }
        None => Err("Selected project is not connected to a repository".to_string()),
    }
}

async fn create_workflow_record(
    pool: &SqlitePool,
    payload: CreateWorkflowPayload,
) -> Result<WorkflowRecord, String> {
    let definition = parse_definition(&payload.definition)?;
    let issues = validate_graph(&WfDefinition {
        name: definition.name.clone(),
        description: definition.description.clone(),
        variables: definition.variables.clone(),
        nodes: definition.nodes.clone(),
        edges: definition.edges.clone(),
    });
    if !issues.is_empty() {
        return Err(format!("Cannot plan invalid workflow: {}", issues[0].1));
    }
    let name = payload.name.trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }
    if let Some(pid) = payload.project_id.as_deref() {
        let project = crate::projects::get_project_record(pool, pid).await?;
        validate_project_connected(&project)?;
    }
    let now = now_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let draft = serde_json::to_string(&payload.definition).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(
        "INSERT INTO workflows (id, workspace_id, name, description, draft_definition,
            published_version, created_at, updated_at, project_id)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)",
    )
    .bind(&id)
    .bind(WORKSPACE_ID)
    .bind(&name)
    .bind(payload.description.unwrap_or_default())
    .bind(&draft)
    .bind(&now)
    .bind(&now)
    .bind(&payload.project_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    let row = get_workflow_row(pool, &id)
        .await?
        .ok_or_else(|| "Workflow not found".to_string())?;
    to_record(pool, row).await
}

async fn save_workflow_record(
    pool: &SqlitePool,
    payload: SaveWorkflowPayload,
) -> Result<WorkflowRecord, String> {
    let existing = get_workflow_row(pool, &payload.id)
        .await?
        .ok_or_else(|| "Workflow not found".to_string())?;
    let definition = parse_definition(&payload.definition)?;
    let parsed = WfDefinition {
        name: definition.name.clone(),
        description: definition.description.clone(),
        variables: definition.variables.clone(),
        nodes: definition.nodes.clone(),
        edges: definition.edges.clone(),
    };
    let issues = validate_graph(&parsed);
    if !issues.is_empty() {
        return Err(format!("Cannot plan invalid workflow: {}", issues[0].1));
    }
    // projectId key present (even null) updates the link; absent leaves it alone.
    let project_id: Option<Option<String>> = match payload.project_id {
        None => None,
        Some(serde_json::Value::Null) => Some(None),
        Some(serde_json::Value::String(s)) if s.trim().is_empty() => Some(None),
        Some(serde_json::Value::String(s)) => {
            let project = crate::projects::get_project_record(pool, &s).await?;
            validate_project_connected(&project)?;
            Some(Some(s))
        }
        Some(_) => return Err("projectId must be a string or null".to_string()),
    };
    let now = now_rfc3339();
    let draft = serde_json::to_string(&payload.definition).unwrap_or_else(|_| "{}".to_string());
    // Web updateDraft also renames from definition.name.
    sqlx::query(
        "UPDATE workflows SET name = ?, description = ?, draft_definition = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?",
    )
    .bind(&parsed.name)
    .bind(&parsed.description)
    .bind(&draft)
    .bind(&now)
    .bind(&existing.id)
    .bind(WORKSPACE_ID)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if let Some(pid) = project_id {
        sqlx::query("UPDATE workflows SET project_id = ? WHERE id = ?")
            .bind(&pid)
            .bind(&existing.id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    let row = get_workflow_row(pool, &existing.id)
        .await?
        .ok_or_else(|| "Workflow not found".to_string())?;
    to_record(pool, row).await
}

async fn publish_workflow_record(
    pool: &SqlitePool,
    id: &str,
) -> Result<serde_json::Value, String> {
    let existing = get_workflow_row(pool, id)
        .await?
        .ok_or_else(|| "Workflow not found".to_string())?;
    let definition = parse_definition(
        &serde_json::from_str(&existing.draft_definition)
            .map_err(|_| "Stored workflow definition is invalid".to_string())?,
    )?;
    let parsed = WfDefinition {
        name: definition.name.clone(),
        description: definition.description.clone(),
        variables: definition.variables.clone(),
        nodes: definition.nodes.clone(),
        edges: definition.edges.clone(),
    };
    if !validate_graph(&parsed).is_empty() {
        return Err("Cannot plan invalid workflow".to_string());
    }
    let version = existing.published_version.unwrap_or(0) + 1;
    let version_id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let definition_json =
        serde_json::to_string(&serde_json::from_str::<serde_json::Value>(&existing.draft_definition).unwrap())
            .unwrap();
    sqlx::query(
        "INSERT INTO workflow_versions (id, workflow_id, version, definition_json, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&version_id)
    .bind(&existing.id)
    .bind(version)
    .bind(&definition_json)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE workflows SET published_version = ?, updated_at = ? WHERE id = ?")
        .bind(version)
        .bind(&now)
        .bind(&existing.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "id": version_id, "workflowId": existing.id, "version": version }))
}

// ---------- Run state ----------

#[derive(Debug, FromRow)]
struct WorkflowRunRow {
    id: String,
    workflow_id: String,
    status: String,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
}

pub(crate) async fn get_run_detail(pool: &SqlitePool, run_id: &str) -> Result<WorkflowRunDetail, String> {
    let run = sqlx::query_as::<_, WorkflowRunRow>(
        "SELECT id, workflow_id, status, created_at, started_at, finished_at
         FROM workflow_runs WHERE id = ?",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Workflow run not found".to_string())?;
    let nodes = sqlx::query_as::<_, WorkflowNodeRunRow>(
        "SELECT node_id, node_type, status, attempt, input_json, output_json, error_json,
            selected_port, started_at, finished_at
         FROM workflow_node_runs WHERE run_id = ? ORDER BY node_id ASC",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(WorkflowRunDetail {
        id: run.id,
        workflow_id: run.workflow_id,
        status: run.status,
        created_at: run.created_at,
        started_at: run.started_at,
        finished_at: run.finished_at,
        node_runs: nodes,
    })
}

/// Workflow record lookup usable from both the UI commands and the MCP tools;
/// resolves by id, or by exact name when the id does not match.
pub(crate) async fn get_workflow_record(
    pool: &SqlitePool,
    id_or_name: &str,
) -> Option<WorkflowRecord> {
    let row = sqlx::query_as::<_, WorkflowRow>(
        "SELECT id, name, description, published_version, project_id, draft_definition,
            created_at, updated_at
         FROM workflows WHERE workspace_id = ? AND (id = ?1 OR name = ?1)
         ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(WORKSPACE_ID)
    .bind(id_or_name)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()?;
    to_record(pool, row).await.ok()
}

pub(crate) async fn list_run_summaries(
    pool: &SqlitePool,
    workflow_id: &str,
    limit: i64,
) -> Result<Vec<WorkflowRunSummary>, String> {
    // Validate workflow exists for a controlled 404 instead of an empty list.
    if get_workflow_row(pool, workflow_id).await?.is_none() {
        return Err("Workflow not found".to_string());
    }
    sqlx::query_as::<_, WorkflowRunSummary>(
        "SELECT id, workflow_id, status, created_at, started_at, finished_at
         FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .bind(workflow_id)
    .bind(limit.clamp(1, 100))
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn is_cancel_requested(pool: &SqlitePool, run_id: &str) -> bool {
    let flag: Option<String> = sqlx::query_scalar(
        "SELECT cancel_requested_at FROM workflow_runs WHERE id = ?",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    flag.map(|v| !v.is_empty()).unwrap_or(false)
}

async fn start_node(
    pool: &SqlitePool,
    run_id: &str,
    node_id: &str,
    attempt: i64,
    input: &serde_json::Value,
) -> Result<(), String> {
    let now = now_rfc3339();
    let input_json = serde_json::to_string(input).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(
        "UPDATE workflow_node_runs SET status = 'running', attempt = ?, input_json = ?,
            output_json = NULL, error_json = NULL, selected_port = NULL, started_at = ?
         WHERE run_id = ? AND node_id = ?",
    )
    .bind(attempt)
    .bind(&input_json)
    .bind(&now)
    .bind(run_id)
    .bind(node_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn finish_node(
    pool: &SqlitePool,
    run_id: &str,
    node_id: &str,
    attempt: i64,
    status: &str,
    output: Option<&serde_json::Value>,
    error: Option<&serde_json::Value>,
    selected_port: Option<&str>,
) -> Result<(), String> {
    let now = now_rfc3339();
    let output_json = output
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string()));
    let error_json = error
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string()));
    sqlx::query(
        "UPDATE workflow_node_runs SET status = ?, attempt = ?, output_json = ?,
            error_json = ?, selected_port = ?, finished_at = ?
         WHERE run_id = ? AND node_id = ?",
    )
    .bind(status)
    .bind(attempt)
    .bind(&output_json)
    .bind(&error_json)
    .bind(selected_port)
    .bind(&now)
    .bind(run_id)
    .bind(node_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn finish_run(
    pool: &SqlitePool,
    run_id: &str,
    status: &str,
    output: Option<&serde_json::Value>,
    error: Option<&serde_json::Value>,
) -> Result<(), String> {
    let now = now_rfc3339();
    let output_json = output
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string()));
    let error_json = error
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "null".to_string()));
    sqlx::query(
        "UPDATE workflow_runs SET status = ?, output_json = ?, error_json = ?, finished_at = ?
         WHERE id = ?",
    )
    .bind(status)
    .bind(&output_json)
    .bind(&error_json)
    .bind(&now)
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- Node executors ----------

fn compare_values(left: &serde_json::Value, operator: &str, right: &serde_json::Value) -> bool {
    match operator {
        "equals" => left == right,
        "not_equals" => left != right,
        "truthy" => !matches!(left, serde_json::Value::Null | serde_json::Value::Bool(false))
            && left != &serde_json::Value::from(0)
            && left != &serde_json::Value::from(""),
        "falsy" => !compare_values(left, "truthy", right),
        "greater_than" => match (left.as_f64(), right.as_f64()) {
            (Some(l), Some(r)) => l > r,
            _ => false,
        },
        "less_than" => match (left.as_f64(), right.as_f64()) {
            (Some(l), Some(r)) => l < r,
            _ => false,
        },
        _ => false,
    }
}

fn resolve_node_interpreter(language: &str) -> String {
    let is_windows = cfg!(target_os = "windows");
    match language {
        "python" => {
            if is_windows {
                "python".to_string()
            } else {
                "python3".to_string()
            }
        }
        "node" | "javascript" | "typescript" => "node".to_string(),
        "shell" | "bash" => {
            if is_windows {
                "cmd".to_string()
            } else {
                "bash".to_string()
            }
        }
        "powershell" => {
            if is_windows {
                "powershell.exe".to_string()
            } else {
                "pwsh".to_string()
            }
        }
        _ => {
            if is_windows {
                "python".to_string()
            } else {
                "python3".to_string()
            }
        }
    }
}

pub(crate) async fn run_script_node(
    pool: &SqlitePool,
    script_id: &str,
) -> Result<serde_json::Value, String> {
    // Resolve by id first; older builders stored the display name, so fall
    // back to a name lookup before failing.
    let script: Option<ScriptRef> = sqlx::query_as(
        "SELECT id, language, interpreter, content, timeout_ms FROM scripts WHERE id = ?1 OR name = ?1 ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(script_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let script = script.ok_or_else(|| format!("Script not found: {}", script_id))?;
    let language = script.language.unwrap_or_else(|| "python".to_string());
    let interpreter = script
        .interpreter
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| resolve_node_interpreter(&language));
    let content = script.content.unwrap_or_default();
    if content.trim().is_empty() {
        return Err(format!("Script {} has no content", script_id));
    }
    // Write to a temp file so multi-line scripts run reliably across shells.
    let dir = std::env::temp_dir().join("scriptmanager-workflow");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!(
        "wf-{}-{}.{}",
        script.id,
        uuid::Uuid::new_v4(),
        match language.as_str() {
            "node" | "javascript" | "typescript" => "js",
            "powershell" => "ps1",
            "shell" | "bash" => "sh",
            _ => "py",
        }
    ));
    std::fs::write(&path, &content).map_err(|e| e.to_string())?;
    let timeout_ms: u64 = script
        .timeout_ms
        .filter(|t| *t > 0)
        .map(|t| t as u64)
        .unwrap_or(30_000)
        .min(300_000);
    let output = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        tokio::process::Command::new(&interpreter)
            .arg(&path)
            .output(),
    )
    .await
    .map_err(|_| format!("Script {} timed out", script_id))?
    .map_err(|e| format!("Script {} failed to start: {}", script_id, e))?;
    let _ = std::fs::remove_file(&path);
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    let code = output.status.code().unwrap_or(-1);
    if output.status.success() {
        Ok(serde_json::json!({ "status": "succeeded", "exitCode": code, "stdout": stdout, "stderr": stderr }))
    } else {
        Err(format!("Script {} exited with code {}: {}", script_id, code, stderr.trim()))
    }
}

#[derive(Debug, FromRow)]
struct ScriptRef {
    id: String,
    language: Option<String>,
    interpreter: Option<String>,
    content: Option<String>,
    timeout_ms: Option<i64>,
}

async fn run_api_node(
    pool: &SqlitePool,
    request_id: &str,
) -> Result<serde_json::Value, String> {
    let request: Option<crate::api_client::ApiRequestRecord> = sqlx::query_as(
        "SELECT id, name, method, url, headers, query_params, variables, request_options,
            pre_request_script, test_script, response_mappings, body_type, body,
            auth_type, auth_config, collection_id, created_at, updated_at
         FROM api_requests WHERE (id = ?1 OR name = ?1) AND workspace_id = 'default'
         ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(request_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let request = request.ok_or_else(|| format!("API request not found: {}", request_id))?;
    let payload = crate::api_client::SendApiRequestPayload {
        request_id: Some(request.id.clone()),
        collection_id: request.collection_id.clone(),
        environment_id: None,
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
    let (_prepared, response) = crate::api_client::execute_api_request_full(pool, &payload).await?;
    if response.status >= 200 && response.status < 400 {
        Ok(serde_json::json!({
            "status": response.status,
            "statusText": response.status_text,
            "headers": response.headers,
            "body": response.body,
            "duration": response.duration,
            "tests": response.test_results,
        }))
    } else {
        Err(format!("API request {} returned status {}", request_id, response.status))
    }
}

fn remote_interpreter_for_language(language: &str) -> &'static str {
    match language {
        "node" | "javascript" | "typescript" => "node",
        "shell" | "bash" => "bash",
        "python" => "python3",
        _ => "python3",
    }
}

/// Quote a fragment for the remote login shell. Remote commands are built
/// only from the interpreter name and a generated temp path; user content
/// travels as a file, never as part of the command line.
fn shell_quote_single(fragment: &str) -> String {
    format!("'{}'", fragment.replace('\'', "'\\''"))
}

async fn run_remote_node(
    pool: &SqlitePool,
    config: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let script_id = config
        .get("scriptId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "nodes config.scriptId is required".to_string())?;
    let profile_id = config
        .get("profileId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "nodes config.profileId is required".to_string())?;

    let script: Option<ScriptRef> = sqlx::query_as(
        "SELECT id, language, interpreter, content, timeout_ms FROM scripts WHERE id = ?1 OR name = ?1 ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(script_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let script = script.ok_or_else(|| format!("Script not found: {}", script_id))?;
    let language = script.language.unwrap_or_else(|| "python".to_string());
    let content = script.content.unwrap_or_default();
    if content.trim().is_empty() {
        return Err(format!("Script {} has no content", script_id));
    }
    let interpreter = script
        .interpreter
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| remote_interpreter_for_language(&language).to_string());

    let connection = crate::ssh_transport::load_profile_connection(pool, profile_id).await?;
    let mut session = crate::ssh_transport::SshSession::connect(&connection).await?;

    if let Some(fingerprint) = &session.host_key_fingerprint {
        let _ = sqlx::query(
            "UPDATE server_profiles SET host_key_fingerprint = ? WHERE id = ?",
        )
        .bind(fingerprint)
        .bind(profile_id)
        .execute(pool)
        .await;
    }

    let extension = match language.as_str() {
        "node" | "javascript" | "typescript" => "js",
        "powershell" => "ps1",
        "shell" | "bash" => "sh",
        _ => "py",
    };
    let remote_path = format!(
        "/tmp/scriptmanager-wf-{}.{}",
        uuid::Uuid::new_v4(),
        extension
    );

    let upload =
        crate::ssh_transport::sftp_upload(&mut session, &remote_path, content.as_bytes(), None)
            .await;
    if let Err(error) = upload {
        session.disconnect().await;
        return Err(format!("Failed to upload workflow script: {error}"));
    }

    let timeout_secs: u64 = script
        .timeout_ms
        .filter(|t| *t > 0)
        .map(|t| t as u64)
        .unwrap_or(30_000)
        .min(300_000)
        / 1000
        + 1;

    let command = format!(
        "{} {}",
        shell_quote_single(interpreter.trim()),
        shell_quote_single(&remote_path)
    );
    let mut stdout: Vec<String> = Vec::new();
    let mut stderr: Vec<String> = Vec::new();
    let exec_result = session
        .run_command(&command, timeout_secs, |line, is_stderr| {
            if is_stderr {
                stderr.push(line.to_string());
            } else {
                stdout.push(line.to_string());
            }
        })
        .await;

    // Best-effort cleanup of the uploaded script; failures are ignored.
    let _ = session
        .run_command(&format!("rm -f {}", shell_quote_single(&remote_path)), 10, |_, _| {})
        .await;
    session.disconnect().await;

    match exec_result {
        Ok(exit_code) => {
            if exit_code == 0 {
                Ok(serde_json::json!({
                    "status": "succeeded",
                    "exitCode": exit_code,
                    "stdout": stdout.join("\n"),
                    "stderr": stderr.join("\n"),
                }))
            } else {
                Err(format!(
                    "Remote script {} exited with code {}: {}",
                    script_id,
                    exit_code,
                    stderr.join("\n").trim()
                ))
            }
        }
        Err(error) => Err(format!("Remote script {} failed: {error}", script_id)),
    }
}

async fn sleep_with_cancel(pool: &SqlitePool, run_id: &str, duration_ms: u64) -> bool {
    // Returns true when cancelled.
    let capped = duration_ms.min(300_000);
    let mut elapsed = 0u64;
    while elapsed < capped {
        if is_cancel_requested(pool, run_id).await {
            return true;
        }
        let step = 100u64.min(capped - elapsed);
        tokio::time::sleep(std::time::Duration::from_millis(step)).await;
        elapsed += step;
    }
    is_cancel_requested(pool, run_id).await
}

fn unsupported_node_error(node_type: &str) -> String {
    match node_type {
        n if n.starts_with("plugin:") => {
            "Plugin workflow nodes are not migrated yet".to_string()
        }
        "approval" => "Approval workflow nodes pause the run until a decision is recorded".to_string(),
        other => format!("Unsupported workflow node: {}", other),
    }
}

async fn run_notification_node(
    pool: &SqlitePool,
    config: &serde_json::Value,
    input: &serde_json::Value,
    context: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let channel_id = config
        .get("channelId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty());
    let channel_kind = config
        .get("channel")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("desktop");
    let title = config
        .get("title")
        .map(|v| resolve_mappings(v, context))
        .and_then(|v| v.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "Workflow notification".to_string());
    let message = config
        .get("message")
        .map(|v| resolve_mappings(v, context))
        .and_then(|v| v.as_str().map(ToOwned::to_owned))
        .ok_or_else(|| "nodes config.message is required".to_string())?;

    let rows = if let Some(channel_id) = channel_id {
        sqlx::query("SELECT id, kind FROM notification_channels WHERE id = ? AND enabled = 1")
            .bind(channel_id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, kind FROM notification_channels WHERE kind = ? AND enabled = 1")
            .bind(channel_kind)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    if rows.is_empty() {
        return Err("Notification channel not found".to_string());
    }

    let payload = serde_json::json!({
        "title": title,
        "body": message,
        "input": input,
        "source": "workflow",
    });
    let now = chrono::Utc::now().to_rfc3339();
    let mut channel_ids = Vec::new();
    for row in rows {
        let channel_id: String = row.try_get(0).map_err(|e| e.to_string())?;
        channel_ids.push(channel_id.clone());
        sqlx::query(
            "INSERT INTO notification_deliveries (id, channel_id, rule_id, status, payload_json, delivered_at)
             VALUES (?, ?, NULL, 'delivered', ?, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&channel_id)
        .bind(payload.to_string())
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(serde_json::json!({
        "status": "delivered",
        "delivered": channel_ids.len(),
        "channelIds": channel_ids,
        "payload": payload,
    }))
}

/// Run a workflow `agent` node: resolve the configured ACP profile, template
/// the prompt against the run context, drive the provider CLI to completion,
/// and expose its reply as the node output. The node's own timeout/retry
/// policy (applied by the driver) bounds a runaway provider process.
async fn run_agent_node(
    pool: &SqlitePool,
    config: &serde_json::Value,
    context: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let profile_id = config
        .get("profileId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "nodes config.profileId is required".to_string())?;
    let profile: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT provider, project_id FROM agent_profiles WHERE id = ?")
            .bind(profile_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    let (provider, project_id) =
        profile.ok_or_else(|| format!("Agent profile not found: {}", profile_id))?;

    let prompt_value = config
        .get("prompt")
        .cloned()
        .ok_or_else(|| "nodes config.prompt is required".to_string())?;
    let prompt = match resolve_mappings(&prompt_value, context) {
        v if v.is_string() => v.as_str().unwrap_or_default().to_string(),
        other => other.to_string(),
    };
    if prompt.trim().is_empty() {
        return Err("nodes config.prompt must not be empty".to_string());
    }

    let cwd = agent_node_cwd(pool, config, context, project_id).await?;
    if !std::path::Path::new(&cwd).is_dir() {
        return Err(format!("Agent node working directory does not exist: {}", cwd));
    }

    let result = crate::agents::run_provider_collect(pool, &provider, &prompt, &cwd).await?;
    Ok(serde_json::json!({
        "provider": provider,
        "reply": result.reply,
        "exitCode": result.exit_code,
        "stderr": result.stderr_tail,
    }))
}

/// Working directory for an agent node: an explicit node override wins, then
/// the profile's project repository root, then a shared scratch directory.
async fn agent_node_cwd(
    pool: &SqlitePool,
    config: &serde_json::Value,
    context: &serde_json::Value,
    project_id: Option<String>,
) -> Result<String, String> {
    if let Some(v) = config.get("cwd") {
        let resolved = resolve_mappings(v, context);
        if let Some(value) = resolved.as_str().map(str::trim).filter(|s| !s.is_empty()) {
            return Ok(value.to_string());
        }
    }
    if let Some(project_id) = project_id {
        let row: Option<sqlx::sqlite::SqliteRow> = sqlx::query(
            "SELECT repository_root FROM projects WHERE id = ?",
        )
        .bind(&project_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?;
        if let Some(row) = row {
            let root: Option<String> = row.try_get(0).map_err(|e| e.to_string())?;
            if let Some(root) = root.map(|r| r.trim().to_string()).filter(|r| !r.is_empty()) {
                return Ok(root);
            }
        }
    }
    let scratch = std::env::temp_dir().join("scriptmanager-agent-nodes");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    Ok(scratch.to_string_lossy().to_string())
}

enum NodeOutcome {
    Succeeded {
        output: serde_json::Value,
        selected_port: Option<String>,
    },
    Paused {
        output: serde_json::Value,
    },
}

async fn execute_node(
    pool: &SqlitePool,
    run_id: &str,
    node: &WfNode,
    input: &serde_json::Value,
    variables: &serde_json::Value,
    outputs: &HashMap<String, serde_json::Value>,
    trigger: &serde_json::Value,
) -> Result<NodeOutcome, String> {
    let context = serde_json::json!({ "trigger": trigger, "variables": variables, "nodes": outputs });
    match node.node_type.as_str() {
        "delay" => {
            let duration_ms = node
                .config
                .get("durationMs")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            if sleep_with_cancel(pool, run_id, duration_ms).await {
                return Err("Workflow run cancelled".to_string());
            }
            Ok(NodeOutcome::Succeeded {
                output: input.clone(),
                selected_port: None,
            })
        }
        "condition" => {
            let left = resolve_mappings(
                node.config.get("left").unwrap_or(&serde_json::Value::Null),
                &context,
            );
            let right = resolve_mappings(
                node.config.get("right").unwrap_or(&serde_json::Value::Null),
                &context,
            );
            let operator = node
                .config
                .get("operator")
                .and_then(|v| v.as_str())
                .unwrap_or("equals");
            let result = compare_values(&left, operator, &right);
            Ok(NodeOutcome::Succeeded {
                output: serde_json::json!({ "result": result }),
                selected_port: Some(if result { "true".to_string() } else { "false".to_string() }),
            })
        }
        "transform" => {
            let mappings = node
                .config
                .get("mappings")
                .cloned()
                .unwrap_or_else(|| serde_json::Value::Object(Default::default()));
            Ok(NodeOutcome::Succeeded {
                output: resolve_mappings(&mappings, &context),
                selected_port: None,
            })
        }
        "parallel" | "join" => Ok(NodeOutcome::Succeeded {
            output: input.clone(),
            selected_port: None,
        }),
        "script" => {
            let script_id = node
                .config
                .get("scriptId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "nodes config.scriptId is required".to_string())?;
            let output = run_script_node(pool, script_id).await?;
            Ok(NodeOutcome::Succeeded {
                output,
                selected_port: None,
            })
        }
        "api" => {
            let request_id = node
                .config
                .get("requestId")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "nodes config.requestId is required".to_string())?;
            let output = run_api_node(pool, request_id).await?;
            Ok(NodeOutcome::Succeeded {
                output,
                selected_port: None,
            })
        }
        "notification" => {
            let output = run_notification_node(pool, &node.config, input, &context).await?;
            Ok(NodeOutcome::Succeeded {
                output,
                selected_port: None,
            })
        }
        "remote" => {
            let output = run_remote_node(pool, &node.config).await?;
            Ok(NodeOutcome::Succeeded {
                output,
                selected_port: None,
            })
        }
        "agent" => {
            let output = run_agent_node(pool, &node.config, &context).await?;
            Ok(NodeOutcome::Succeeded {
                output,
                selected_port: None,
            })
        }
        "approval" => Ok(NodeOutcome::Paused {
            output: serde_json::json!({
                "prompt": node.config.get("prompt").cloned().unwrap_or(serde_json::Value::Null),
                "input": input,
            }),
        }),
        other => Err(unsupported_node_error(other)),
    }
}

// ---------- Run driver ----------

#[allow(clippy::too_many_arguments)]
async fn execute_layers(
    pool: &SqlitePool,
    run_id: &str,
    def: &WfDefinition,
    layers: &[Vec<String>],
    trigger: &serde_json::Value,
    from_nodes: Option<&HashSet<String>>,
) -> Result<serde_json::Value, String> {
    let node_by_id: HashMap<&str, &WfNode> =
        def.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
    let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();
    let mut selected_ports: HashMap<String, String> = HashMap::new();
    let mut statuses: HashMap<String, String> = HashMap::new();
    // Seed statuses from existing node rows (retry path resumes prior successes).
    let existing = sqlx::query_as::<_, WorkflowNodeRunRow>(
        "SELECT node_id, node_type, status, attempt, input_json, output_json, error_json,
            selected_port, started_at, finished_at
         FROM workflow_node_runs WHERE run_id = ?",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    for row in existing {
        statuses.insert(row.node_id.clone(), row.status.clone());
        if row.status == STATUS_SUCCEEDED {
            if let Some(out) = row.output_json.as_ref() {
                if let Ok(value) = serde_json::from_str(out) {
                    outputs.insert(row.node_id.clone(), value);
                }
            }
            if let Some(port) = row.selected_port.as_ref() {
                selected_ports.insert(row.node_id.clone(), port.clone());
            }
        }
    }

    let mut any_failed = false;

    for layer in layers {
        for node_id in layer {
            let run_this = match from_nodes {
                None => statuses.get(node_id).map(|s| s != STATUS_SUCCEEDED).unwrap_or(true),
                Some(set) => set.contains(node_id),
            };
            if !run_this {
                continue;
            }
            if is_cancel_requested(pool, run_id).await {
                finish_node(pool, run_id, node_id, 1, STATUS_CANCELLED, None, Some(&serde_json::json!({ "message": "Workflow run cancelled" })), None).await?;
                statuses.insert(node_id.clone(), STATUS_CANCELLED.to_string());
                finish_run(pool, run_id, STATUS_CANCELLED, None, Some(&serde_json::json!({ "message": "Workflow run cancelled" }))).await?;
                return Err("Workflow run cancelled".to_string());
            }
            let node = *node_by_id.get(node_id.as_str()).ok_or_else(|| format!("Unknown node: {}", node_id))?;
            // Gate on incoming edges (condition ports + dead sources).
            let incoming: Vec<&WfEdge> =
                def.edges.iter().filter(|e| e.target == *node_id).collect();
            let active: Vec<&&WfEdge> = incoming
                .iter()
                .filter(|e| match e.source_port.as_deref() {
                    None => true,
                    Some(port) => selected_ports.get(&e.source).map(|s| s == port).unwrap_or(false),
                })
                .collect();
            let dead = ["skipped", STATUS_FAILED];
            if (!incoming.is_empty() && active.is_empty())
                || active.iter().any(|e| dead.contains(&statuses.get(&e.source).map(|s| s.as_str()).unwrap_or("")))
            {
                finish_node(pool, run_id, node_id, 0, STATUS_SKIPPED, None, None, None).await?;
                statuses.insert(node_id.clone(), STATUS_SKIPPED.to_string());
                continue;
            }
            let mut parent_outputs = serde_json::Map::new();
            for edge in active {
                if let Some(out) = outputs.get(&edge.source) {
                    parent_outputs.insert(edge.source.clone(), out.clone());
                }
            }
            let base_input = if incoming.is_empty() {
                trigger.clone()
            } else {
                serde_json::json!({ "nodes": parent_outputs })
            };
            let context = serde_json::json!({ "trigger": trigger, "variables": def.variables, "nodes": outputs });
            let input = match node.config.get("inputs") {
                Some(inputs) => resolve_mappings(inputs, &context),
                None => base_input,
            };
            let max_attempts = node
                .retry
                .as_ref()
                .map(|r| r.max_attempts.clamp(1, 5))
                .unwrap_or(1);
            let timeout_ms: u64 = node.timeout_ms.filter(|t| *t > 0).map(|t| t as u64).unwrap_or(60_000).min(300_000);
            let continue_on_failure = node
                .failure_policy
                .as_ref()
                .map(|f| f.action == "continue")
                .unwrap_or(false);

            let mut attempt = 0;
            let outcome = loop {
                attempt += 1;
                start_node(pool, run_id, node_id, attempt, &input).await?;
                let node_owned = node.clone();
                let input_owned = input.clone();
                let variables_owned = def.variables.clone();
                let outputs_owned = outputs.clone();
                let trigger_owned = trigger.clone();
                let execution = execute_node(pool, run_id, &node_owned, &input_owned, &variables_owned, &outputs_owned, &trigger_owned);
                match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), execution).await {
                    Ok(Ok(outcome)) => break Ok(outcome),
                    Ok(Err(message)) => {
                        if attempt < max_attempts {
                            continue;
                        }
                        break Err(message);
                    }
                    Err(_) => {
                        if attempt < max_attempts {
                            continue;
                        }
                        break Err(format!("Node {} timed out", node_id));
                    }
                }
            };

            match outcome {
                Ok(NodeOutcome::Succeeded { output, selected_port }) => {
                    finish_node(pool, run_id, node_id, attempt, STATUS_SUCCEEDED, Some(&output), None, selected_port.as_deref()).await?;
                    statuses.insert(node_id.clone(), STATUS_SUCCEEDED.to_string());
                    if let Some(port) = selected_port {
                        selected_ports.insert(node_id.clone(), port);
                    }
                    outputs.insert(node_id.clone(), output);
                }
                Ok(NodeOutcome::Paused { output }) => {
                    finish_node(pool, run_id, node_id, attempt, STATUS_WAITING_APPROVAL, Some(&output), None, None).await?;
                    statuses.insert(node_id.clone(), STATUS_WAITING_APPROVAL.to_string());
                    outputs.insert(node_id.clone(), output);
                    finish_run(pool, run_id, STATUS_PAUSED, None, None).await?;
                    return Ok(serde_json::json!({ "paused": true }));
                }
                Err(message) => {
                    // A cancel request that lands while a node is executing
                    // surfaces as a node error; record it as cancelled so the
                    // user's cancel decision is not overwritten by "failed".
                    if is_cancel_requested(pool, run_id).await {
                        let error = serde_json::json!({ "message": "Workflow run cancelled" });
                        finish_node(pool, run_id, node_id, attempt, STATUS_CANCELLED, None, Some(&error), None).await?;
                        statuses.insert(node_id.clone(), STATUS_CANCELLED.to_string());
                        finish_run(pool, run_id, STATUS_CANCELLED, None, Some(&error)).await?;
                        return Err("Workflow run cancelled".to_string());
                    }
                    let error = serde_json::json!({ "message": message });
                    finish_node(pool, run_id, node_id, attempt, STATUS_FAILED, None, Some(&error), None).await?;
                    statuses.insert(node_id.clone(), STATUS_FAILED.to_string());
                    any_failed = true;
                    if !continue_on_failure {
                        finish_run(pool, run_id, STATUS_FAILED, None, Some(&error)).await?;
                        return Err(message);
                    }
                }
            }
        }
    }

    if any_failed {
        finish_run(pool, run_id, STATUS_FAILED, None, Some(&serde_json::json!({ "message": "One or more nodes failed" }))).await?;
        return Err("One or more nodes failed".to_string());
    }
    let summary = serde_json::json!({ "nodes": outputs });
    finish_run(pool, run_id, STATUS_SUCCEEDED, Some(&summary), None).await?;
    Ok(summary)
}

fn downstream_of(def: &WfDefinition, start: &str) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut stack = vec![start.to_string()];
    while let Some(current) = stack.pop() {
        if !seen.insert(current.clone()) {
            continue;
        }
        for edge in def.edges.iter().filter(|e| e.source == current) {
            stack.push(edge.target.clone());
        }
    }
    seen
}

struct PreparedRun {
    run_id: String,
    def: WfDefinition,
    layers: Vec<Vec<String>>,
    trigger: serde_json::Value,
}

/// Resolve the published definition, plan the layers, and insert the run row
/// plus its pending node rows. Shared by the synchronous driver (tests), the
/// background starter (UI/MCP), and the scheduler.
async fn prepare_workflow_run(
    pool: &SqlitePool,
    workflow_id: &str,
    input: serde_json::Value,
    trigger_type: &str,
    actor_id: &str,
) -> Result<PreparedRun, String> {
    let workflow = get_workflow_row(pool, workflow_id)
        .await?
        .ok_or_else(|| "Workflow not found".to_string())?;
    let version_number = workflow
        .published_version
        .ok_or_else(|| "Publish the workflow before running it".to_string())?;
    let version: Option<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT id, definition_json FROM workflow_versions WHERE workflow_id = ? AND version = ?",
    )
    .bind(workflow_id)
    .bind(version_number)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
    .map(|row| row.map(|(id, def)| (id, def)))?;
    let (version_id, definition_json) =
        version.ok_or_else(|| "Published workflow version not found".to_string())?;
    let definition_value: serde_json::Value = serde_json::from_str(&definition_json)
        .map_err(|_| "Published workflow definition is invalid".to_string())?;
    let raw_def = parse_definition(&definition_value)?;
    let def = WfDefinition {
        name: raw_def.name.clone(),
        description: raw_def.description.clone(),
        variables: raw_def.variables.clone(),
        nodes: raw_def.nodes.clone(),
        edges: raw_def.edges.clone(),
    };
    let layers = plan_layers(&def)?;
    let now = now_rfc3339();
    let run_id = uuid::Uuid::new_v4().to_string();
    let correlation_id = format!("corr_{}", uuid::Uuid::new_v4());
    let input_json = serde_json::to_string(&input).unwrap_or_else(|_| "{}".to_string());
    sqlx::query(
        "INSERT INTO workflow_runs (id, workflow_id, version_id, status, trigger_type, actor_id,
            correlation_id, input_json, created_at, started_at)
         VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&run_id)
    .bind(workflow_id)
    .bind(&version_id)
    .bind(trigger_type)
    .bind(actor_id)
    .bind(&correlation_id)
    .bind(&input_json)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    for node in &def.nodes {
        let node_run_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO workflow_node_runs (id, run_id, node_id, node_type, status, attempt)
             VALUES (?, ?, ?, ?, 'pending', 0)",
        )
        .bind(&node_run_id)
        .bind(&run_id)
        .bind(&node.id)
        .bind(&node.node_type)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    let trigger: serde_json::Value =
        serde_json::from_str(&input_json).unwrap_or(serde_json::Value::Null);
    Ok(PreparedRun { run_id, def, layers, trigger })
}

/// Synchronous execution used by tests and callers that want the final
/// run detail in the same call.
async fn run_workflow_record(
    pool: &SqlitePool,
    workflow_id: &str,
    input: serde_json::Value,
) -> Result<WorkflowRunDetail, String> {
    let prepared = prepare_workflow_run(pool, workflow_id, input, "manual", "local-admin").await?;
    let PreparedRun { run_id, def, layers, trigger } = prepared;
    let _ = execute_layers(pool, &run_id, &def, &layers, &trigger, None).await;
    get_run_detail(pool, &run_id).await
}

/// Start a run in the background and return its detail immediately (status
/// 'running'). Used by the Run command, MCP tools, and cron triggers so a
/// long workflow cannot block the caller; progress is observed via polling.
pub async fn start_workflow_run_record(
    pool: &SqlitePool,
    workflow_id: &str,
    input: serde_json::Value,
    trigger_type: &str,
    actor_id: &str,
) -> Result<WorkflowRunDetail, String> {
    let prepared = prepare_workflow_run(pool, workflow_id, input, trigger_type, actor_id).await?;
    let detail = get_run_detail(pool, &prepared.run_id).await?;
    let run_pool = pool.clone();
    tauri::async_runtime::spawn(async move {
        let PreparedRun { run_id, def, layers, trigger } = prepared;
        if let Err(message) = execute_layers(&run_pool, &run_id, &def, &layers, &trigger, None).await
        {
            // Safety net: a driver crash (not a node failure) would otherwise
            // leave the run row stuck in 'running' forever.
            let status: Option<String> = sqlx::query_scalar("SELECT status FROM workflow_runs WHERE id = ?")
                .bind(&run_id)
                .fetch_optional(&run_pool)
                .await
                .ok()
                .flatten();
            if status.as_deref() == Some("running") {
                let error = serde_json::json!({ "message": message });
                let _ = finish_run(&run_pool, &run_id, STATUS_FAILED, None, Some(&error)).await;
            }
            log::warn!("Workflow run {run_id} background execution ended: {message}");
        }
    });
    Ok(detail)
}

// ---------- Tauri commands ----------

#[tauri::command]
pub async fn list_workflows(
    pool: tauri::State<'_, SqlitePool>,
) -> Result<Vec<WorkflowRecord>, String> {
    list_workflow_records(&pool).await
}

#[tauri::command]
pub async fn create_workflow(
    pool: tauri::State<'_, SqlitePool>,
    payload: CreateWorkflowPayload,
) -> Result<WorkflowRecord, String> {
    create_workflow_record(&pool, payload).await
}

#[tauri::command]
pub async fn save_workflow(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveWorkflowPayload,
) -> Result<WorkflowRecord, String> {
    save_workflow_record(&pool, payload).await
}

#[tauri::command]
pub async fn publish_workflow(
    pool: tauri::State<'_, SqlitePool>,
    id: String,
) -> Result<serde_json::Value, String> {
    publish_workflow_record(&pool, &id).await
}

#[tauri::command]
pub async fn run_workflow(
    pool: tauri::State<'_, SqlitePool>,
    payload: RunWorkflowPayload,
) -> Result<WorkflowRunDetail, String> {
    let workflow_id = payload
        .id
        .or(payload.workflow_id)
        .ok_or_else(|| "Workflow id is required".to_string())?;
    // Runs execute in the background; the execution drawer polls for progress.
    start_workflow_run_record(&pool, &workflow_id, payload.input.unwrap_or(serde_json::json!({})), "manual", "local-admin").await
}

#[tauri::command]
pub async fn list_workflow_runs(
    pool: tauri::State<'_, SqlitePool>,
    workflow_id: String,
) -> Result<Vec<WorkflowRunSummary>, String> {
    list_run_summaries(&pool, &workflow_id, 100).await
}

#[tauri::command]
pub async fn read_workflow_run(
    pool: tauri::State<'_, SqlitePool>,
    run_id: String,
) -> Result<WorkflowRunDetail, String> {
    get_run_detail(&pool, &run_id).await
}

pub(crate) async fn retry_node_record(
    pool: &SqlitePool,
    run_id: &str,
    node_id: &str,
) -> Result<WorkflowRunDetail, String> {
    let detail = get_run_detail(pool, run_id).await?;
    let node = detail
        .node_runs
        .iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "Workflow node run not found".to_string())?;
    if !["failed", "cancelled", "skipped"].contains(&node.status.as_str()) {
        return Err("Only failed, cancelled, or skipped nodes can be retried".to_string());
    }
    let run_row: Option<(String, String)> = sqlx::query_as(
        "SELECT version_id, input_json FROM workflow_runs WHERE id = ?",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let (version_id, input_json) =
        run_row.ok_or_else(|| "Workflow run not found".to_string())?;
    let definition_json: String = sqlx::query_scalar(
        "SELECT definition_json FROM workflow_versions WHERE id = ?",
    )
    .bind(&version_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Workflow version not found".to_string())?;
    let definition_value: serde_json::Value = serde_json::from_str(&definition_json)
        .map_err(|_| "Workflow definition is invalid".to_string())?;
    let raw_def = parse_definition(&definition_value)?;
    let def = WfDefinition {
        name: raw_def.name.clone(),
        description: raw_def.description.clone(),
        variables: raw_def.variables.clone(),
        nodes: raw_def.nodes.clone(),
        edges: raw_def.edges.clone(),
    };
    let layers = plan_layers(&def)?;
    // Reset the retried node and everything downstream of it.
    let scope = downstream_of(&def, node_id);
    for scoped_id in &scope {
        sqlx::query(
            "UPDATE workflow_node_runs SET status = 'pending', attempt = 0, input_json = NULL,
                output_json = NULL, error_json = NULL, selected_port = NULL, started_at = NULL,
                finished_at = NULL WHERE run_id = ? AND node_id = ?",
        )
        .bind(run_id)
        .bind(scoped_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    sqlx::query(
        "UPDATE workflow_runs SET status = 'running', error_json = NULL, finished_at = NULL,
            cancel_requested_at = NULL WHERE id = ?",
    )
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    let trigger: serde_json::Value =
        serde_json::from_str(&input_json).unwrap_or(serde_json::Value::Null);
    let _ = execute_layers(pool, run_id, &def, &layers, &trigger, Some(&scope)).await;
    get_run_detail(pool, run_id).await
}

#[tauri::command]
pub async fn retry_workflow_node(
    pool: tauri::State<'_, SqlitePool>,
    payload: RetryNodePayload,
) -> Result<WorkflowRunDetail, String> {
    retry_node_record(&pool, &payload.run_id, &payload.node_id).await
}

#[tauri::command]
pub async fn cancel_workflow_run(
    pool: tauri::State<'_, SqlitePool>,
    run_id: String,
) -> Result<WorkflowRunDetail, String> {
    cancel_workflow_run_core(&pool, &run_id).await
}

pub async fn cancel_workflow_run_core(
    pool: &SqlitePool,
    run_id: &str,
) -> Result<WorkflowRunDetail, String> {
    let detail = get_run_detail(pool, run_id).await?;
    if ["succeeded", STATUS_FAILED, STATUS_CANCELLED].contains(&detail.status.as_str()) {
        return Ok(detail);
    }
    let now = now_rfc3339();
    sqlx::query(
        "UPDATE workflow_runs SET cancel_requested_at = ?, status = 'cancelled', finished_at = ?
         WHERE id = ?",
    )
    .bind(&now)
    .bind(&now)
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    // Mark in-flight pending/running nodes cancelled so the drawer is consistent
    // even when the driver already finished between poll ticks.
    sqlx::query(
        "UPDATE workflow_node_runs SET status = 'cancelled', finished_at = ?
         WHERE run_id = ? AND status IN ('pending', 'running')",
    )
    .bind(&now)
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    get_run_detail(pool, run_id).await
}

// ---------- AI authoring (natural language -> workflow) ----------

#[derive(Debug, Deserialize)]
pub struct DraftWorkflowFromPromptPayload {
    pub prompt: String,
    #[serde(rename = "profileId", default)]
    pub profile_id: Option<String>,
}

fn workflow_authoring_prompt(user_prompt: &str) -> String {
    format!(
        "You are a workflow author for ScriptManager. Convert the user's request into ONE workflow definition.

Node types and their required config:
- script: {{\"scriptId\": \"<existing script id or exact name>\"}}
- api: {{\"requestId\": \"<existing api request id or exact name>\"}}
- delay: {{\"durationMs\": <milliseconds>}}
- condition: {{\"left\": \"{{{{nodes.<id>.<field>}}}}\", \"operator\": \"equals|contains|gt|lt\", \"right\": <value>}} (has true/false output ports)
- transform: {{\"mappings\": {{\"outputField\": \"{{{{nodes.<id>.<field>}}}}\"}}}}
- approval: {{\"prompt\": \"what a human should approve\"}} (pauses the run)
- notification: {{\"channel\": \"desktop\", \"message\": \"text with {{{{placeholders}}}}\"}}
- agent: {{\"profileId\": \"<agent profile id>\", \"prompt\": \"instruction\"}}
- foreach: {{\"items\": <array or {{{{nodes.<id>.<field>}}}}>, \"maxIterations\": <1-100>}} — body must be a \"steps\" object with its own nodes/edges where each step config may use {{{{item}}}}

Rules:
- Return ONLY a JSON object, no prose, no markdown fences.
- Schema: {{\"schemaVersion\": 1, \"name\": \"...\", \"description\": \"...\", \"variables\": {{}}, \"nodes\": [{{\"id\": \"n1\", \"type\": \"...\", \"config\": {{...}}}}], \"edges\": [{{\"id\": \"e1\", \"source\": \"n1\", \"target\": \"n2\"}}]}}
- Node ids: short unique strings (n1, n2, ...). Edge ids: e1, e2, ... Edges must reference existing nodes.
- Condition nodes may add \"sourcePort\": \"true\" or \"false\" on edges leaving them.
- Do not invent script/API ids; if the user names one, use its exact name.
- If the user mentions a schedule, ignore it (triggers are configured separately).
User request:
{user_prompt}
"
    )
}

/// Extract the first balanced JSON object from an agent reply (tolerates
/// markdown fences and trailing prose).
fn extract_json_object(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (offset, ch) in text[start..].char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        match ch {
            '\\' if in_string => escaped = true,
            '"' => in_string = !in_string,
            '{' if !in_string => depth += 1,
            '}' if !in_string => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(text[start..=start + offset].to_string());
                }
            }
            _ => {}
        }
    }
    None
}

#[tauri::command]
pub async fn draft_workflow_from_prompt(
    pool: tauri::State<'_, SqlitePool>,
    payload: DraftWorkflowFromPromptPayload,
) -> Result<serde_json::Value, String> {
    let prompt = payload.prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }
    let profile: Option<(String,)> = match payload.profile_id.as_deref().filter(|p| !p.is_empty()) {
        Some(id) => sqlx::query_as("SELECT id FROM agent_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?,
        None => sqlx::query_as("SELECT id FROM agent_profiles ORDER BY created_at LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?,
    };
    let (profile_id,) = profile.ok_or_else(|| {
        "No agent profile configured. Create an agent profile in the Agents panel first.".to_string()
    })?;
    let provider: String = sqlx::query_scalar("SELECT provider FROM agent_profiles WHERE id = ?")
        .bind(&profile_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent profile not found".to_string())?;

    let scratch = std::env::temp_dir().join("scriptmanager-agent-nodes");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let result = crate::agents::run_provider_collect(
        &pool,
        &provider,
        &workflow_authoring_prompt(prompt),
        &scratch.to_string_lossy(),
    )
    .await?;

    let json_text = extract_json_object(&result.reply)
        .ok_or_else(|| format!("The agent did not return a workflow JSON object. Reply was: {}", truncate_reply(&result.reply)))?;
    let definition: serde_json::Value = serde_json::from_str(&json_text)
        .map_err(|error| format!("Agent returned invalid JSON: {error}. Raw: {}", truncate_reply(&json_text)))?;
    let raw_def = parse_definition(&definition).map_err(|error| {
        format!("The agent's workflow is structurally invalid: {error}. Ask it to fix the schema.")
    })?;
    let def = WfDefinition {
        name: raw_def.name.clone(),
        description: raw_def.description.clone(),
        variables: raw_def.variables.clone(),
        nodes: raw_def.nodes.clone(),
        edges: raw_def.edges.clone(),
    };
    let issues: Vec<serde_json::Value> = validate_graph(&def)
        .into_iter()
        .map(|(code, message)| serde_json::json!({ "code": code, "message": message }))
        .collect();

    Ok(serde_json::json!({
        "definition": definition,
        "issues": issues,
        "provider": provider,
        "profileId": profile_id,
    }))
}

fn truncate_reply(text: &str) -> String {
    if text.chars().count() <= 800 {
        return text.to_string();
    }
    let truncated: String = text.chars().take(800).collect();
    format!("{truncated}…")
}

// ---------- AI diagnosis ----------

#[derive(Debug, Deserialize)]
pub struct DiagnoseNodePayload {
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(rename = "nodeId")]
    pub node_id: String,
    #[serde(rename = "profileId", default)]
    pub profile_id: Option<String>,
}

/// Assemble a redacted, agent-ready context for a failed workflow node:
/// node error/output/input, the run input, and the script content for script
/// nodes. Diagnosis never mutates anything — the reply comes back to the UI.
#[tauri::command]
pub async fn diagnose_node_failure(
    pool: tauri::State<'_, SqlitePool>,
    payload: DiagnoseNodePayload,
) -> Result<serde_json::Value, String> {
    let detail = get_run_detail(&pool, &payload.run_id).await?;
    let node = detail
        .node_runs
        .iter()
        .find(|n| n.node_id == payload.node_id)
        .ok_or_else(|| "Workflow node run not found".to_string())?;

    // Definition for this run's version: node type + config summary.
    let version_id: String = sqlx::query_scalar("SELECT version_id FROM workflow_runs WHERE id = ?")
        .bind(&payload.run_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Workflow run not found".to_string())?;
    let definition_json: Option<String> = sqlx::query_scalar(
        "SELECT definition_json FROM workflow_versions WHERE id = ?",
    )
    .bind(&version_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    let node_config = definition_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .and_then(|def| {
            def.get("nodes")
                .and_then(Value::as_array)
                .and_then(|nodes| {
                    nodes
                        .iter()
                        .find(|node| node.get("id").and_then(Value::as_str) == Some(payload.node_id.as_str()))
                        .cloned()
                })
        });

    // Script content for script nodes (agents need the code to explain a fix).
    let mut script_section = String::new();
    if node.node_type == "script" {
        if let Some(config) = node_config.as_ref() {
            if let Some(script_ref) = config.pointer("/config/scriptId").and_then(Value::as_str) {
                let content: Option<String> = sqlx::query_scalar(
                    "SELECT content FROM scripts WHERE id = ?1 OR name = ?1 ORDER BY (id = ?1) DESC LIMIT 1",
                )
                .bind(script_ref)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                if let Some(content) = content {
                    script_section = format!("
== Script content ==
{}", truncate_reply(&content));
                }
            }
        }
    }

    let context = serde_json::json!({
        "nodeId": payload.node_id,
        "nodeType": node.node_type,
        "nodeConfig": node_config,
        "error": node.error_json.as_ref().and_then(|raw| serde_json::from_str::<Value>(raw).ok()),
        "output": node.output_json.as_ref().and_then(|raw| serde_json::from_str::<Value>(raw).ok()),
        "input": node.input_json.as_ref().and_then(|raw| serde_json::from_str::<Value>(raw).ok()),
        "runStatus": detail.status,
    });

    let prompt = format!(
        "You are diagnosing a failed workflow node in ScriptManager. Explain the likely root cause in 2-4 sentences, then give a concrete fix (numbered steps or a corrected script snippet). Be specific about the actual error values; do not invent data.
== Failure context ==
{}{}",
        serde_json::to_string_pretty(&context).unwrap_or_default(),
        script_section
    );

    let profile: Option<(String,)> = match payload.profile_id.as_deref().filter(|p| !p.is_empty()) {
        Some(id) => sqlx::query_as("SELECT id FROM agent_profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?,
        None => sqlx::query_as("SELECT id FROM agent_profiles ORDER BY created_at LIMIT 1")
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?,
    };
    let (profile_id,) = profile.ok_or_else(|| {
        "No agent profile configured. Create an agent profile in the Agents panel first.".to_string()
    })?;
    let provider: String = sqlx::query_scalar("SELECT provider FROM agent_profiles WHERE id = ?")
        .bind(&profile_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent profile not found".to_string())?;

    let scratch = std::env::temp_dir().join("scriptmanager-agent-nodes");
    std::fs::create_dir_all(&scratch).map_err(|e| e.to_string())?;
    let result = crate::agents::run_provider_collect(&pool, &provider, &prompt, &scratch.to_string_lossy()).await?;

    Ok(serde_json::json!({
        "diagnosis": result.reply,
        "provider": provider,
        "profileId": profile_id,
    }))
}

// ---------- Approval resolution ----------

#[derive(Debug, Deserialize)]
pub struct ResolveWorkflowApprovalPayload {
    #[serde(rename = "runId")]
    pub run_id: String,
    #[serde(rename = "nodeId")]
    pub node_id: String,
    pub approved: bool,
    #[serde(rename = "decidedBy", default)]
    pub decided_by: Option<String>,
}

/// Approve or reject an approval node that has paused a run. Approving
/// resumes the remaining nodes in the background; rejecting fails the run.
pub async fn resolve_workflow_approval_record(
    pool: &SqlitePool,
    run_id: &str,
    node_id: &str,
    approved: bool,
    decided_by: &str,
) -> Result<WorkflowRunDetail, String> {
    let detail = get_run_detail(pool, run_id).await?;
    let node = detail
        .node_runs
        .iter()
        .find(|n| n.node_id == node_id)
        .ok_or_else(|| "Workflow node run not found".to_string())?;
    if node.status != STATUS_WAITING_APPROVAL {
        return Err("Node is not waiting for approval".to_string());
    }
    if detail.status != STATUS_PAUSED {
        return Err("Workflow run is not paused".to_string());
    }
    let attempt = node.attempt;

    if !approved {
        let error = serde_json::json!({ "message": format!("Rejected by {}", decided_by) });
        finish_node(pool, run_id, node_id, attempt, STATUS_FAILED, None, Some(&error), None).await?;
        finish_run(pool, run_id, STATUS_FAILED, None, Some(&error)).await?;
        return get_run_detail(pool, run_id).await;
    }

    let output = serde_json::json!({ "approved": true, "decidedBy": decided_by, "decidedAt": now_rfc3339() });
    finish_node(pool, run_id, node_id, attempt, STATUS_SUCCEEDED, Some(&output), None, None).await?;

    // Reload the definition so the remaining downstream nodes can resume.
    let version_id: String = sqlx::query_scalar("SELECT version_id FROM workflow_runs WHERE id = ?")
        .bind(run_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Workflow run not found".to_string())?;
    let definition_json: String = sqlx::query_scalar(
        "SELECT definition_json FROM workflow_versions WHERE id = ?",
    )
    .bind(&version_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Workflow version not found".to_string())?;
    let definition_value: serde_json::Value = serde_json::from_str(&definition_json)
        .map_err(|_| "Workflow definition is invalid".to_string())?;
    let raw_def = parse_definition(&definition_value)?;
    let def = WfDefinition {
        name: raw_def.name.clone(),
        description: raw_def.description.clone(),
        variables: raw_def.variables.clone(),
        nodes: raw_def.nodes.clone(),
        edges: raw_def.edges.clone(),
    };
    let layers = plan_layers(&def)?;
    let mut scope = downstream_of(&def, node_id);
    scope.remove(node_id);

    sqlx::query(
        "UPDATE workflow_runs SET status = 'running', error_json = NULL, finished_at = NULL,
            cancel_requested_at = NULL WHERE id = ?",
    )
    .bind(run_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    if scope.is_empty() {
        let summary = serde_json::json!({ "nodes": { "approved": output } });
        finish_run(pool, run_id, STATUS_SUCCEEDED, Some(&summary), None).await?;
        return get_run_detail(pool, run_id).await;
    }

    let run_pool = pool.clone();
    let run_id_owned = run_id.to_string();
    let trigger_value = output.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(message) = execute_layers(&run_pool, &run_id_owned, &def, &layers, &trigger_value, Some(&scope)).await {
            log::warn!("Workflow run {run_id_owned} post-approval execution ended: {message}");
        }
    });
    get_run_detail(pool, run_id).await
}

#[tauri::command]
pub async fn resolve_workflow_approval(
    pool: tauri::State<'_, SqlitePool>,
    payload: ResolveWorkflowApprovalPayload,
) -> Result<WorkflowRunDetail, String> {
    resolve_workflow_approval_record(
        &pool,
        &payload.run_id,
        &payload.node_id,
        payload.approved,
        payload.decided_by.as_deref().unwrap_or("local-admin"),
    )
    .await
}

// ---------- Triggers (cron) ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTriggerRecord {
    pub id: String,
    pub workflow_id: String,
    pub trigger_type: String,
    pub enabled: bool,
    pub config: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

fn trigger_row_to_record(
    id: String,
    workflow_id: String,
    trigger_type: String,
    enabled: i64,
    config_json: String,
    created_at: String,
    updated_at: String,
) -> WorkflowTriggerRecord {
    WorkflowTriggerRecord {
        id,
        workflow_id,
        trigger_type,
        enabled: enabled != 0,
        config: serde_json::from_str(&config_json).unwrap_or(serde_json::Value::Null),
        created_at,
        updated_at,
    }
}

pub(crate) async fn list_workflow_triggers_record(
    pool: &SqlitePool,
    workflow_id: &str,
) -> Result<Vec<WorkflowTriggerRecord>, String> {
    let rows = sqlx::query(
        "SELECT id, workflow_id, type, enabled, config_json, created_at, updated_at, webhook_token
         FROM workflow_triggers WHERE workflow_id = ? ORDER BY created_at",
    )
    .bind(workflow_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|row| {
            let mut record = trigger_row_to_record(
                row.try_get(0).map_err(|e| e.to_string())?,
                row.try_get(1).map_err(|e| e.to_string())?,
                row.try_get(2).map_err(|e| e.to_string())?,
                row.try_get(3).map_err(|e| e.to_string())?,
                row.try_get(4).map_err(|e| e.to_string())?,
                row.try_get(5).map_err(|e| e.to_string())?,
                row.try_get(6).map_err(|e| e.to_string())?,
            );
            // Webhook triggers surface their (public) token so the UI can show
            // the URL; the HMAC secret stays encrypted and is only revealed at
            // rotation time.
            if record.trigger_type == "webhook" {
                let token: Option<String> = row.try_get(7).map_err(|e| e.to_string())?;
                let mut config = record.config.as_object().cloned().unwrap_or_default();
                if let Some(token) = token {
                    config.insert("token".to_string(), serde_json::Value::String(token));
                }
                config.insert("secret".to_string(), serde_json::Value::String("(hidden — rotate to get a new one)".to_string()));
                record.config = serde_json::Value::Object(config);
            }
            Ok(record)
        })
        .collect()
}

#[tauri::command]
pub async fn list_workflow_triggers(
    pool: tauri::State<'_, SqlitePool>,
    workflow_id: String,
) -> Result<Vec<WorkflowTriggerRecord>, String> {
    list_workflow_triggers_record(&pool, &workflow_id).await
}

#[derive(Debug, Deserialize)]
pub struct SaveWorkflowTriggerPayload {
    #[serde(rename = "workflowId")]
    pub workflow_id: String,
    #[serde(rename = "type", alias = "trigger_type", default = "default_trigger_type")]
    pub trigger_type: String,
    pub cron: Option<String>,
    pub enabled: bool,
}

fn default_trigger_type() -> String {
    "cron".to_string()
}

/// Create or update the cron trigger of a workflow. One trigger per workflow;
/// the next fire time is stored inside config_json and advanced by the
/// scheduler so a missed tick fires once, not per tick.
pub async fn save_workflow_trigger_record(
    pool: &SqlitePool,
    payload: SaveWorkflowTriggerPayload,
) -> Result<WorkflowTriggerRecord, String> {
    if payload.trigger_type != "cron" {
        return Err(format!("Unsupported workflow trigger type: {}", payload.trigger_type));
    }
    if get_workflow_row(pool, &payload.workflow_id).await?.is_none() {
        return Err("Workflow not found".to_string());
    }
    let cron = payload.cron.unwrap_or_default().trim().to_string();
    let next_run = if payload.enabled {
        let next = crate::scheduler::next_run_after(&cron, chrono::Utc::now())
            .ok_or_else(|| "Invalid cron expression".to_string())?;
        Some(next.to_rfc3339())
    } else {
        None
    };
    let config = serde_json::json!({ "cron": cron, "nextRunAt": next_run });

    let existing: Option<String> =
        sqlx::query_scalar("SELECT id FROM workflow_triggers WHERE workflow_id = ? AND type = 'cron'")
            .bind(&payload.workflow_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    let id = match existing {
        Some(id) => {
            sqlx::query(
                "UPDATE workflow_triggers SET enabled = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(payload.enabled)
            .bind(config.to_string())
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            id
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO workflow_triggers (id, workflow_id, type, enabled, config_json) VALUES (?, ?, 'cron', ?, ?)",
            )
            .bind(&id)
            .bind(&payload.workflow_id)
            .bind(payload.enabled)
            .bind(config.to_string())
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            id
        }
    };

    let (trigger_type, enabled, config_json, created_at, updated_at): (String, i64, String, String, String) =
        sqlx::query_as(
            "SELECT type, enabled, config_json, created_at, updated_at FROM workflow_triggers WHERE id = ?",
        )
        .bind(&id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(trigger_row_to_record(id, payload.workflow_id, trigger_type, enabled, config_json, created_at, updated_at))
}

#[tauri::command]
pub async fn save_workflow_trigger(
    pool: tauri::State<'_, SqlitePool>,
    payload: SaveWorkflowTriggerPayload,
) -> Result<WorkflowTriggerRecord, String> {
    save_workflow_trigger_record(&pool, payload).await
}

#[tauri::command]
pub async fn delete_workflow_trigger(
    pool: tauri::State<'_, SqlitePool>,
    trigger_id: String,
) -> Result<bool, String> {
    let result = sqlx::query("DELETE FROM workflow_triggers WHERE id = ?")
        .bind(&trigger_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result.rows_affected() > 0)
}

/// Fire every due cron trigger. Called from the scheduler tick; the next fire
/// time is advanced before starting the run (run-once policy).
pub(crate) async fn tick_workflow_triggers(pool: &SqlitePool) -> Result<usize, String> {
    let now = chrono::Utc::now();
    let rows = sqlx::query(
        "SELECT workflow_triggers.id, workflow_triggers.workflow_id, workflow_triggers.config_json
         FROM workflow_triggers
         JOIN workflows ON workflows.id = workflow_triggers.workflow_id
         WHERE workflow_triggers.type = 'cron' AND workflow_triggers.enabled = 1
           AND workflows.published_version IS NOT NULL",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut fired = 0usize;
    for row in rows {
        let trigger_id: String = row.try_get(0).map_err(|e| e.to_string())?;
        let workflow_id: String = row.try_get(1).map_err(|e| e.to_string())?;
        let config_json: String = row.try_get(2).map_err(|e| e.to_string())?;
        let config: serde_json::Value = serde_json::from_str(&config_json).unwrap_or(json_value_object());
        let cron = config.get("cron").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        if cron.is_empty() {
            continue;
        }
        let next_run_at = config.get("nextRunAt").and_then(|v| v.as_str());
        let due = match next_run_at {
            Some(stored) => stored
                .parse::<chrono::DateTime<chrono::Utc>>()
                .map(|due| due <= now)
                .unwrap_or(true),
            None => true,
        };
        if !due {
            continue;
        }
        let next = crate::scheduler::next_run_after(&cron, now).map(|dt| dt.to_rfc3339());
        let next_config = serde_json::json!({ "cron": cron, "nextRunAt": next });
        sqlx::query("UPDATE workflow_triggers SET config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(next_config.to_string())
            .bind(&trigger_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        let input = serde_json::json!({
            "trigger": "cron",
            "triggerId": trigger_id,
            "firedAt": now.to_rfc3339(),
        });
        match start_workflow_run_record(pool, &workflow_id, input, "cron", "scheduler").await {
            Ok(_) => fired += 1,
            Err(message) => log::warn!("Scheduled workflow {workflow_id} failed to start: {message}"),
        }
    }
    Ok(fired)
}

fn json_value_object() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}

// ---------- MCP-friendly API request helpers ----------

pub(crate) async fn list_api_request_summaries(
    pool: &SqlitePool,
) -> Result<Vec<serde_json::Value>, String> {
    let rows = sqlx::query(
        "SELECT id, name, method, url, collection_id FROM api_requests
         WHERE workspace_id = 'default' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "id": row.try_get::<String, _>(0).unwrap_or_default(),
                "name": row.try_get::<String, _>(1).unwrap_or_default(),
                "method": row.try_get::<String, _>(2).unwrap_or_default(),
                "url": row.try_get::<String, _>(3).unwrap_or_default(),
                "collectionId": row.try_get::<Option<String>, _>(4).unwrap_or(None),
            })
        })
        .collect())
}

/// Like run_api_node but reports the real HTTP status instead of failing on
/// >= 400 — an agent diagnosing an endpoint needs the response, not a stack
/// of "returned status 404".
pub(crate) async fn send_api_request_lenient(
    pool: &SqlitePool,
    request_id: &str,
) -> Result<serde_json::Value, String> {
    let request: Option<crate::api_client::ApiRequestRecord> = sqlx::query_as(
        "SELECT id, name, method, url, headers, query_params, variables, request_options,
            pre_request_script, test_script, response_mappings, body_type, body,
            auth_type, auth_config, collection_id, created_at, updated_at
         FROM api_requests WHERE (id = ?1 OR name = ?1) AND workspace_id = 'default'
         ORDER BY (id = ?1) DESC LIMIT 1",
    )
    .bind(request_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let request = request.ok_or_else(|| format!("API request not found: {}", request_id))?;
    let payload = crate::api_client::SendApiRequestPayload {
        request_id: Some(request.id.clone()),
        collection_id: request.collection_id.clone(),
        environment_id: None,
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
    let (_prepared, response) = crate::api_client::execute_api_request_full(pool, &payload).await?;
    Ok(serde_json::json!({
        "status": response.status,
        "statusText": response.status_text,
        "headers": response.headers,
        "body": response.body,
        "duration": response.duration,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definition_fixture() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 1,
            "name": "Demo",
            "variables": { "base": "https://x" },
            "nodes": [
                { "id": "n1", "type": "transform", "name": "T", "config": { "mappings": { "url": "{{variables.base}}/a" } } },
                { "id": "n2", "type": "delay", "name": "D", "config": { "durationMs": 0 } }
            ],
            "edges": [ { "id": "e1", "source": "n1", "target": "n2" } ]
        })
    }

    #[test]
    fn graph_validation_accepts_acyclic_definition() {
        let def = parse_definition(&definition_fixture()).unwrap();
        assert!(validate_graph(&def).is_empty());
        let layers = plan_layers(&def).unwrap();
        assert_eq!(layers, vec![vec!["n1".to_string()], vec!["n2".to_string()]]);
    }

    #[test]
    fn graph_validation_rejects_cycle() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "name": "Cycle",
            "nodes": [
                { "id": "a", "type": "delay", "name": "A", "config": { "durationMs": 0 } },
                { "id": "b", "type": "delay", "name": "B", "config": { "durationMs": 0 } }
            ],
            "edges": [
                { "id": "e1", "source": "a", "target": "b" },
                { "id": "e2", "source": "b", "target": "a" }
            ]
        });
        let def = parse_definition(&value).unwrap();
        let issues = validate_graph(&def);
        assert!(issues.iter().any(|(code, _)| code == "cycle"));
        assert!(plan_layers(&def).is_err());
    }

    #[test]
    fn graph_validation_rejects_missing_nodes() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "name": "Missing",
            "nodes": [ { "id": "a", "type": "delay", "name": "A", "config": { "durationMs": 0 } } ],
            "edges": [ { "id": "e1", "source": "a", "target": "ghost" } ]
        });
        let def = parse_definition(&value).unwrap();
        let issues = validate_graph(&def);
        assert!(issues.iter().any(|(code, _)| code == "missing_target"));
    }

    #[test]
    fn graph_validation_rejects_invalid_source_port() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "name": "Port",
            "nodes": [
                { "id": "a", "type": "delay", "name": "A", "config": { "durationMs": 0 } },
                { "id": "b", "type": "delay", "name": "B", "config": { "durationMs": 0 } }
            ],
            "edges": [ { "id": "e1", "source": "a", "target": "b", "sourcePort": "true" } ]
        });
        let def = parse_definition(&value).unwrap();
        let issues = validate_graph(&def);
        assert!(issues.iter().any(|(code, _)| code == "invalid_source_port"));
    }

    #[test]
    fn schema_validation_rejects_missing_config() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "name": "Bad",
            "nodes": [ { "id": "a", "type": "script", "name": "S", "config": {} } ],
            "edges": []
        });
        assert!(parse_definition(&value).is_err());
    }

    #[test]
    fn plan_order_is_deterministic() {
        let value = serde_json::json!({
            "schemaVersion": 1,
            "name": "Order",
            "nodes": [
                { "id": "b", "type": "delay", "name": "B", "config": { "durationMs": 0 } },
                { "id": "a", "type": "delay", "name": "A", "config": { "durationMs": 0 } },
                { "id": "c", "type": "delay", "name": "C", "config": { "durationMs": 0 } }
            ],
            "edges": [
                { "id": "e1", "source": "b", "target": "c" },
                { "id": "e2", "source": "a", "target": "c" }
            ]
        });
        let def = parse_definition(&value).unwrap();
        let layers = plan_layers(&def).unwrap();
        assert_eq!(layers[0], vec!["a".to_string(), "b".to_string()]);
        assert_eq!(layers[1], vec!["c".to_string()]);
    }

    #[test]
    fn mappings_resolve_placeholders() {
        let context = serde_json::json!({ "trigger": { "q": "hi" }, "nodes": { "n1": { "v": 2 } } });
        let mappings = serde_json::json!({ "a": "{{trigger.q}}", "b": "{{nodes.n1.v}}", "c": "x-{{trigger.q}}" });
        let resolved = resolve_mappings(&mappings, &context);
        assert_eq!(resolved["a"], serde_json::Value::from("hi"));
        assert_eq!(resolved["b"], serde_json::Value::from(2));
        assert_eq!(resolved["c"], serde_json::Value::from("x-hi"));
    }

    #[test]
    fn condition_compare_covers_operators() {
        assert!(compare_values(&serde_json::json!(1), "equals", &serde_json::json!(1)));
        assert!(compare_values(&serde_json::json!(1), "not_equals", &serde_json::json!(2)));
        assert!(compare_values(&serde_json::json!("x"), "truthy", &serde_json::json!(null)));
        assert!(compare_values(&serde_json::json!(0), "falsy", &serde_json::json!(null)));
        assert!(compare_values(&serde_json::json!(3), "greater_than", &serde_json::json!(2)));
        assert!(compare_values(&serde_json::json!(1), "less_than", &serde_json::json!(2)));
    }

    async fn test_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        crate::schema::ensure_schema(&pool).await.unwrap();
        pool
    }

    async fn create_and_publish(pool: &SqlitePool, definition: serde_json::Value) -> String {
        let created = create_workflow_record(
            pool,
            CreateWorkflowPayload {
                name: "W".to_string(),
                description: None,
                definition,
                project_id: None,
            },
        )
        .await
        .unwrap();
        publish_workflow_record(pool, &created.id).await.unwrap();
        created.id
    }

    #[tokio::test]
    async fn workflow_crud_and_publish_round_trip() {
        let pool = test_pool().await;
        let created = create_workflow_record(
            &pool,
            CreateWorkflowPayload {
                name: "W".to_string(),
                description: Some("d".to_string()),
                definition: definition_fixture(),
                project_id: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(created.published_version, None);
        let published = publish_workflow_record(&pool, &created.id).await.unwrap();
        assert_eq!(published["version"], serde_json::Value::from(1));
        let again = publish_workflow_record(&pool, &created.id).await.unwrap();
        assert_eq!(again["version"], serde_json::Value::from(2));

        assert!(create_workflow_record(
            &pool,
            CreateWorkflowPayload {
                name: "   ".to_string(),
                description: None,
                definition: definition_fixture(),
                project_id: None,
            },
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn workflow_run_requires_publish() {
        let pool = test_pool().await;
        let created = create_workflow_record(
            &pool,
            CreateWorkflowPayload {
                name: "W".to_string(),
                description: None,
                definition: definition_fixture(),
                project_id: None,
            },
        )
        .await
        .unwrap();
        assert!(run_workflow_record(&pool, &created.id, serde_json::json!({}))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn workflow_run_transform_delay_succeeds() {
        let pool = test_pool().await;
        let id = create_and_publish(&pool, definition_fixture()).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(detail.status, STATUS_SUCCEEDED);
        assert_eq!(detail.node_runs.len(), 2);
        let transform = detail.node_runs.iter().find(|n| n.node_id == "n1").unwrap();
        assert_eq!(transform.status, STATUS_SUCCEEDED);
        let output: serde_json::Value = serde_json::from_str(transform.output_json.as_ref().unwrap()).unwrap();
        assert_eq!(output["url"], serde_json::Value::from("https://x/a"));
    }

    #[tokio::test]
    async fn workflow_run_condition_routes_ports() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Cond",
            "nodes": [
                { "id": "c", "type": "condition", "name": "C", "config": { "left": 1, "operator": "equals", "right": 1 } },
                { "id": "t", "type": "delay", "name": "T", "config": { "durationMs": 0 } },
                { "id": "f", "type": "delay", "name": "F", "config": { "durationMs": 0 } }
            ],
            "edges": [
                { "id": "e1", "source": "c", "target": "t", "sourcePort": "true" },
                { "id": "e2", "source": "c", "target": "f", "sourcePort": "false" }
            ]
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(detail.status, STATUS_SUCCEEDED);
        let statuses: HashMap<&str, &str> = detail
            .node_runs
            .iter()
            .map(|n| (n.node_id.as_str(), n.status.as_str()))
            .collect();
        assert_eq!(statuses["t"], STATUS_SUCCEEDED);
        assert_eq!(statuses["f"], STATUS_SKIPPED);
    }

    #[tokio::test]
    async fn workflow_run_notification_node_persists_delivery() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-desktop', 'Desktop', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Notify",
            "nodes": [
                {
                    "id": "notify",
                    "type": "notification",
                    "name": "Notify",
                    "config": {
                        "channel": "desktop",
                        "title": "Workflow complete",
                        "message": "Hello {{trigger.name}}"
                    }
                }
            ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({ "name": "Tauri" }))
            .await
            .unwrap();

        assert_eq!(detail.status, STATUS_SUCCEEDED);
        let node = &detail.node_runs[0];
        assert_eq!(node.status, STATUS_SUCCEEDED);
        let output: serde_json::Value = serde_json::from_str(node.output_json.as_ref().unwrap()).unwrap();
        assert_eq!(output["delivered"], 1);
        assert_eq!(output["channelIds"][0], "c-desktop");

        let payload: String = sqlx::query_scalar(
            "SELECT payload_json FROM notification_deliveries WHERE channel_id = 'c-desktop'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(payload.contains("Workflow complete"));
        assert!(payload.contains("Hello Tauri"));
    }

    #[tokio::test]
    async fn workflow_run_notification_node_can_target_channel_id() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-target', 'Target', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-other', 'Other', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Notify target",
            "nodes": [
                {
                    "id": "notify",
                    "type": "notification",
                    "name": "Notify",
                    "config": {
                        "channel": "desktop",
                        "channelId": "c-target",
                        "message": "Direct channel"
                    }
                }
            ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();

        assert_eq!(detail.status, STATUS_SUCCEEDED);
        let delivered: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM notification_deliveries WHERE channel_id = 'c-target'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let other: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM notification_deliveries WHERE channel_id = 'c-other'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(delivered, 1);
        assert_eq!(other, 0);
    }

    #[tokio::test]
    async fn workflow_run_unsupported_node_fails_with_persisted_error() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "PluginPending",
            "nodes": [ { "id": "r", "type": "plugin:demo:step", "name": "R", "config": {} } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(detail.status, STATUS_FAILED);
        let node = &detail.node_runs[0];
        assert_eq!(node.status, STATUS_FAILED);
        assert!(node.error_json.as_ref().unwrap().contains("not migrated yet"));
    }

    #[tokio::test]
    async fn workflow_retry_reruns_failed_node() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Retry",
            "nodes": [ { "id": "r", "type": "plugin:demo:step", "name": "R", "config": {} } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let failed = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(failed.status, STATUS_FAILED);
        // Retry re-drives the node (and fails again deterministically for the
        // unsupported plugin type), proving state reset instead of a stale read.
        let retried = retry_node_record(&pool, &failed.id, "r").await.unwrap();
        assert_eq!(retried.status, STATUS_FAILED);
        let node = retried.node_runs.iter().find(|n| n.node_id == "r").unwrap();
        assert_eq!(node.attempt, 1);
        assert!(node.error_json.as_ref().unwrap().contains("not migrated yet"));

        // Retrying a succeeded node is rejected.
        let ok_id = create_and_publish(&pool, definition_fixture()).await;
        let ok = run_workflow_record(&pool, &ok_id, serde_json::json!({}))
            .await
            .unwrap();
        assert!(retry_node_record(&pool, &ok.id, "n1").await.is_err());
    }

    #[tokio::test]
    async fn workflow_agent_node_errors_without_profile() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "AgentNode",
            "nodes": [ { "id": "a", "type": "agent", "name": "A", "config": { "profileId": "ghost", "prompt": "hi" } } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(detail.status, STATUS_FAILED);
        let node = &detail.node_runs[0];
        assert_eq!(node.status, STATUS_FAILED);
        assert!(node.error_json.as_ref().unwrap().contains("Agent profile not found"));
    }

    #[tokio::test]
    async fn workflow_approval_pause_then_approve_resumes_and_reject_fails() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Gated",
            "nodes": [
                { "id": "gate", "type": "approval", "name": "Gate", "config": { "prompt": "Proceed?" } },
                { "id": "after", "type": "transform", "name": "After", "config": { "mappings": { "ok": true } } }
            ],
            "edges": [ { "id": "e1", "source": "gate", "target": "after" } ]
        });
        let id = create_and_publish(&pool, definition.clone()).await;

        // First run pauses at the approval gate and is resumed by approval.
        let paused = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(paused.status, STATUS_PAUSED);
        let node = paused.node_runs.iter().find(|n| n.node_id == "gate").unwrap();
        assert_eq!(node.status, STATUS_WAITING_APPROVAL);

        let resumed = resolve_workflow_approval_record(&pool, &paused.id, "gate", true, "qa-lead")
            .await
            .unwrap();
        // Resume runs in the background; wait for completion.
        let mut final_detail = resumed.clone();
        for _ in 0..50 {
            final_detail = get_run_detail(&pool, &paused.id).await.unwrap();
            if final_detail.status != "running" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        assert_eq!(final_detail.status, STATUS_SUCCEEDED);
        let after = final_detail.node_runs.iter().find(|n| n.node_id == "after").unwrap();
        assert_eq!(after.status, STATUS_SUCCEEDED);

        // Double-resolving is rejected.
        assert!(resolve_workflow_approval_record(&pool, &paused.id, "gate", true, "qa-lead")
            .await
            .is_err());

        // Second run rejected at the gate fails the run with the decision.
        let paused2 = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(paused2.status, STATUS_PAUSED);
        let rejected = resolve_workflow_approval_record(&pool, &paused2.id, "gate", false, "qa-lead")
            .await
            .unwrap();
        assert_eq!(rejected.status, STATUS_FAILED);
        let gate = rejected.node_runs.iter().find(|n| n.node_id == "gate").unwrap();
        assert_eq!(gate.status, STATUS_FAILED);
        assert!(gate.error_json.as_ref().unwrap().contains("Rejected"));
    }

    #[tokio::test]
    async fn workflow_background_start_returns_running_then_completes() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Background",
            "nodes": [ { "id": "d", "type": "delay", "name": "D", "config": { "durationMs": 0 } } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let started = start_workflow_run_record(&pool, &id, serde_json::json!({ "k": "v" }), "mcp", "ai-agent")
            .await
            .unwrap();
        assert_eq!(started.status, "running");

        let mut final_detail = started.clone();
        for _ in 0..50 {
            final_detail = get_run_detail(&pool, &started.id).await.unwrap();
            if final_detail.status != "running" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        assert_eq!(final_detail.status, STATUS_SUCCEEDED);

        let trigger_type: String = sqlx::query_scalar("SELECT trigger_type FROM workflow_runs WHERE id = ?")
            .bind(&started.id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(trigger_type, "mcp");
    }

    #[tokio::test]
    async fn workflow_cron_trigger_save_validate_and_fire() {
        let pool = test_pool().await;
        let definition = definition_fixture();
        let id = create_and_publish(&pool, definition).await;

        // Invalid cron is rejected when enabling.
        let bad = save_workflow_trigger_record(
            &pool,
            SaveWorkflowTriggerPayload {
                workflow_id: id.clone(),
                trigger_type: "cron".to_string(),
                cron: Some("not a cron".to_string()),
                enabled: true,
            },
        )
        .await;
        assert!(bad.is_err());

        let saved = save_workflow_trigger_record(
            &pool,
            SaveWorkflowTriggerPayload {
                workflow_id: id.clone(),
                trigger_type: "cron".to_string(),
                cron: Some("0 9 * * 1-5".to_string()),
                enabled: true,
            },
        )
        .await
        .unwrap();
        assert!(saved.enabled);
        assert_eq!(saved.config["cron"].as_str().unwrap(), "0 9 * * 1-5");
        assert!(saved.config["nextRunAt"].is_string());

        // Not due yet: nothing fires.
        let fired = tick_workflow_triggers(&pool).await.unwrap();
        assert_eq!(fired, 0);

        // Force the trigger due, then the scheduler starts a run.
        let config = serde_json::json!({ "cron": "0 9 * * 1-5", "nextRunAt": "2020-01-01T00:00:00Z" });
        sqlx::query("UPDATE workflow_triggers SET config_json = ? WHERE workflow_id = ?")
            .bind(config.to_string())
            .bind(&id)
            .execute(&pool)
            .await
            .unwrap();
        let fired = tick_workflow_triggers(&pool).await.unwrap();
        assert_eq!(fired, 1);

        let runs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_runs WHERE workflow_id = ? AND trigger_type = 'cron'")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(runs, 1);

        let triggers = list_workflow_triggers_record(&pool, &id).await.unwrap();
        assert_eq!(triggers.len(), 1);
        // nextRunAt advanced past the forced past date.
        assert_ne!(
            triggers[0].config["nextRunAt"].as_str().unwrap(),
            "2020-01-01T00:00:00Z"
        );
    }

    #[test]
    fn extract_json_object_handles_fences_and_prose() {
        let fenced = "Here you go:
```json
{\"schemaVersion\": 1, \"name\": \"X\", \"nodes\": [], \"edges\": []}
```
Done!";
        assert_eq!(
            extract_json_object(fenced).unwrap(),
            "{\"schemaVersion\": 1, \"name\": \"X\", \"nodes\": [], \"edges\": []}"
        );
        let nested = "prefix {\"a\": {\"b\": 1}, \"c\": \"}\"} suffix";
        assert_eq!(extract_json_object(nested).unwrap(), "{\"a\": {\"b\": 1}, \"c\": \"}\"}");
        assert_eq!(extract_json_object("no json here"), None);
    }

    #[tokio::test]
    async fn workflow_api_request_helpers_list_and_lenient_send() {
        let pool = test_pool().await;
        let summaries = list_api_request_summaries(&pool).await.unwrap();
        assert!(summaries.is_empty());
        assert!(send_api_request_lenient(&pool, "ghost").await.is_err());
    }

    #[tokio::test]
    async fn workflow_run_cancel_marks_run_and_nodes_cancelled() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Cancellable",
            "nodes": [ { "id": "wait", "type": "delay", "name": "Wait", "config": { "durationMs": 8000 } } ],
            "edges": []
        });
        let workflow_id = create_and_publish(&pool, definition).await;

        let run_pool = pool.clone();
        let run_handle = tokio::spawn(async move {
            run_workflow_record(&run_pool, &workflow_id, serde_json::json!({})).await
        });

        // Wait for the run row to appear, then cancel while the delay sleeps.
        let run_id = loop {
            let pending: Option<(String, String)> = sqlx::query_as(
                "SELECT id, status FROM workflow_runs ORDER BY created_at DESC LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap();
            if let Some((id, _)) = pending {
                break id;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        };

        let cancelled = cancel_workflow_run_core(&pool, &run_id).await.unwrap();
        assert_eq!(cancelled.status, STATUS_CANCELLED);

        let finished = run_handle.await.unwrap().unwrap();
        // The run must end cancelled, never overwritten back to failed.
        assert_eq!(finished.status, STATUS_CANCELLED);
        let node = &finished.node_runs[0];
        assert_eq!(node.status, STATUS_CANCELLED);
    }

    #[tokio::test]
    async fn workflow_remote_node_runs_script_over_ssh() {
        crate::ssh_test_server::init_master_key();
        let (port, _files, behavior) = crate::ssh_test_server::spawn().await;
        {
            let mut guard = behavior.lock().await;
            guard.exec_stdout = "remote-node-ok\n".to_string();
            guard.exec_exit_code = 0;
        }

        let pool = test_pool().await;
        sqlx::query(
            "INSERT INTO scripts (id, name, filename, content, language) VALUES (?, ?, ?, ?, ?)",
        )
        .bind("script-wf-remote")
        .bind("wf_remote.py")
        .bind("wf_remote.py")
        .bind("print('hello from remote')")
        .bind("python")
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO server_profiles (id, name, host, port, username, auth_method, has_secret, encrypted_secret)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
        )
        .bind("profile-wf-remote")
        .bind("wf-host")
        .bind("127.0.0.1")
        .bind(port as i64)
        .bind(crate::ssh_test_server::TEST_USER)
        .bind("password")
        .bind(crate::security::encrypt_value(
            &crate::security::current_master_key().unwrap(),
            crate::ssh_test_server::TEST_PASSWORD,
        )
        .unwrap())
        .execute(&pool)
        .await
        .unwrap();

        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "RemoteNode",
            "nodes": [ { "id": "r", "type": "remote", "name": "R", "config": { "scriptId": "script-wf-remote", "profileId": "profile-wf-remote" } } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let detail = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(detail.status, STATUS_SUCCEEDED);
        let node = &detail.node_runs[0];
        assert_eq!(node.status, STATUS_SUCCEEDED);
        let output: serde_json::Value =
            serde_json::from_str(node.output_json.as_deref().unwrap_or("{}")).unwrap();
        assert!(output["stdout"].as_str().unwrap().contains("remote-node-ok"));
    }
}
