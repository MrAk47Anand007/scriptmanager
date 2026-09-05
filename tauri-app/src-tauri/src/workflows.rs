use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
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

async fn list_workflow_records(pool: &SqlitePool) -> Result<Vec<WorkflowRecord>, String> {
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

async fn list_run_summaries(
    pool: &SqlitePool,
    workflow_id: &str,
) -> Result<Vec<WorkflowRunSummary>, String> {
    // Validate workflow exists for a controlled 404 instead of an empty list.
    if get_workflow_row(pool, workflow_id).await?.is_none() {
        return Err("Workflow not found".to_string());
    }
    sqlx::query_as::<_, WorkflowRunSummary>(
        "SELECT id, workflow_id, status, created_at, started_at, finished_at
         FROM workflow_runs WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .bind(workflow_id)
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

async fn run_script_node(
    pool: &SqlitePool,
    script_id: &str,
) -> Result<serde_json::Value, String> {
    let row: Option<ScriptRef> = sqlx::query_as(
        "SELECT id, language, interpreter, content, timeout_ms FROM scripts WHERE id = ?",
    )
    .bind(script_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let script = row.ok_or_else(|| format!("Script not found: {}", script_id))?;
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
         FROM api_requests WHERE id = ? AND workspace_id = 'default'",
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
    let prepared = crate::api_client::prepare_request(pool, &payload).await?;
    let response = crate::api_client::execute_prepared(&prepared).await?;
    if response.status >= 200 && response.status < 400 {
        Ok(serde_json::json!({
            "status": response.status,
            "statusText": response.status_text,
            "headers": response.headers,
            "body": response.body,
            "duration": response.duration,
        }))
    } else {
        Err(format!("API request {} returned status {}", request_id, response.status))
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
        "remote" => "Remote workflow nodes are not migrated yet".to_string(),
        "notification" => "Notification workflow nodes are not migrated yet".to_string(),
        "agent" => "Agent workflow nodes are not migrated yet".to_string(),
        "approval" => "Approval workflow nodes pause here until the approvals inbox is migrated".to_string(),
        other => format!("Unsupported workflow node: {}", other),
    }
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

async fn run_workflow_record(
    pool: &SqlitePool,
    workflow_id: &str,
    input: serde_json::Value,
) -> Result<WorkflowRunDetail, String> {
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
         VALUES (?, ?, ?, 'running', 'manual', 'local-admin', ?, ?, ?, ?)",
    )
    .bind(&run_id)
    .bind(workflow_id)
    .bind(&version_id)
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
    let _ = execute_layers(pool, &run_id, &def, &layers, &trigger, None).await;
    get_run_detail(pool, &run_id).await
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
    run_workflow_record(&pool, &workflow_id, payload.input.unwrap_or(serde_json::json!({}))).await
}

#[tauri::command]
pub async fn list_workflow_runs(
    pool: tauri::State<'_, SqlitePool>,
    workflow_id: String,
) -> Result<Vec<WorkflowRunSummary>, String> {
    list_run_summaries(&pool, &workflow_id).await
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
    let detail = get_run_detail(&pool, &run_id).await?;
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
    .bind(&run_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    // Mark in-flight pending/running nodes cancelled so the drawer is consistent
    // even when the driver already finished between poll ticks.
    sqlx::query(
        "UPDATE workflow_node_runs SET status = 'cancelled', finished_at = ?
         WHERE run_id = ? AND status IN ('pending', 'running')",
    )
    .bind(&now)
    .bind(&run_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    get_run_detail(&pool, &run_id).await
}

// ---------- Tests ----------

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
    async fn workflow_run_unsupported_node_fails_with_persisted_error() {
        let pool = test_pool().await;
        let definition = serde_json::json!({
            "schemaVersion": 1,
            "name": "Remote",
            "nodes": [ { "id": "r", "type": "remote", "name": "R", "config": { "scriptId": "s", "profileId": "p" } } ],
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
            "nodes": [ { "id": "r", "type": "remote", "name": "R", "config": { "scriptId": "s", "profileId": "p" } } ],
            "edges": []
        });
        let id = create_and_publish(&pool, definition).await;
        let failed = run_workflow_record(&pool, &id, serde_json::json!({}))
            .await
            .unwrap();
        assert_eq!(failed.status, STATUS_FAILED);
        // Retry re-drives the node (and fails again deterministically for the
        // unmigrated remote type), proving state reset instead of a stale read.
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
}
