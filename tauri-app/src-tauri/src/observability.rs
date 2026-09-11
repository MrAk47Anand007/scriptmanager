use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager, State};

use crate::execution::{ExecutionState, RunScriptPayload};

pub const KINDS: [&str; 4] = ["workflow", "script", "api", "remote"];
const STATUSES: [&str; 8] = [
    "queued",
    "running",
    "waiting",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
    "interrupted",
];

// ---------- Status normalization (port of lib/observability/filters.ts) ----------

pub(crate) fn normalize_status(raw: &str) -> &'static str {
    match raw {
        "queued" | "pending" => "queued",
        "running" | "in_progress" => "running",
        "waiting_approval" | "pending_approval" => "waiting",
        "succeeded" | "completed" | "success" | "passed" => "succeeded",
        "cancelled" | "canceled" => "cancelled",
        "timed_out" | "timeout" => "timed_out",
        "interrupted" => "interrupted",
        _ => "failed",
    }
}

fn is_failure(status: &str) -> bool {
    matches!(status, "failed" | "timed_out" | "interrupted")
}

fn is_active(status: &str) -> bool {
    matches!(status, "queued" | "running" | "waiting")
}

// ---------- Redaction (port of lib/execution/events.ts) ----------

fn sensitive_key_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)^(authorization|cookie|password|passphrase|secret|token|api[-_]?key|access[-_]?key|private[-_]?key)$",
        )
        .expect("valid sensitive-key regex")
    })
}

fn credential_in_text_regex() -> &'static regex::Regex {
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    RE.get_or_init(|| {
        regex::Regex::new(r"(?i)\b(token|password|secret|api[_-]?key)=([^\s&]+)")
            .expect("valid credential regex")
    })
}

pub(crate) fn redact_string(value: &str) -> String {
    credential_in_text_regex()
        .replace_all(value, "$1=[REDACTED]")
        .into_owned()
}

pub(crate) fn redact_value(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(redact_string(s)),
        Value::Array(items) => Value::Array(items.iter().map(redact_value).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (key, item) in map {
                if sensitive_key_regex().is_match(key) {
                    out.insert(key.clone(), Value::String("[REDACTED]".to_string()));
                } else {
                    out.insert(key.clone(), redact_value(item));
                }
            }
            Value::Object(out)
        }
        other => other.clone(),
    }
}

fn parse_redacted(raw: Option<&str>) -> Option<Value> {
    let raw = raw?;
    match serde_json::from_str::<Value>(raw) {
        Ok(value) => Some(redact_value(&value)),
        Err(_) => Some(Value::String(redact_string(raw))),
    }
}

// ---------- Run summary (camelCase matched to ExecutionRunSummary) ----------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub status: String,
    pub trigger: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    pub retry_count: i64,
}

fn compute_duration(started: Option<&str>, finished: Option<&str>) -> Option<i64> {
    let (start, finish) = (started?, finished?);
    let a = chrono::DateTime::parse_from_rfc3339(start)
        .map(|d| d.timestamp_millis())
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(start, "%Y-%m-%d %H:%M:%S")
                .map(|d| d.and_utc().timestamp_millis())
        })
        .ok()?;
    let b = chrono::DateTime::parse_from_rfc3339(finish)
        .map(|d| d.timestamp_millis())
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(finish, "%Y-%m-%d %H:%M:%S")
                .map(|d| d.and_utc().timestamp_millis())
        })
        .ok()?;
    Some((b - a).max(0))
}

async fn script_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT b.id, COALESCE(s.name, b.script_id), b.status, b.triggered_by,
                b.started_at, b.finished_at, b.created_at
         FROM builds b LEFT JOIN scripts s ON s.id = b.script_id
         ORDER BY b.created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(4).ok();
            let finished: Option<String> = row.try_get(5).ok();
            let created: Option<String> = row.try_get(6).ok();
            let started_at = started.clone().or(created);
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "script".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(3).unwrap_or_default(),
                actor_id: None,
                correlation_id: None,
                duration_ms: compute_duration(started_at.as_deref(), finished.as_deref()),
                started_at,
                finished_at: finished,
                retry_count: 0,
            })
        })
        .collect()
}

async fn workflow_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT r.id, COALESCE(w.name, r.workflow_id), r.status, r.trigger_type, r.actor_id,
                r.correlation_id, r.started_at, r.finished_at, r.created_at,
                COALESCE((SELECT SUM(MAX(0, n.attempt - 1)) FROM workflow_node_runs n WHERE n.run_id = r.id), 0)
         FROM workflow_runs r LEFT JOIN workflows w ON w.id = r.workflow_id
         ORDER BY r.created_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(6).ok();
            let finished: Option<String> = row.try_get(7).ok();
            let created: Option<String> = row.try_get(8).ok();
            let started_at = started.clone().or(created);
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "workflow".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(3).unwrap_or_default(),
                actor_id: row.try_get(4).ok(),
                correlation_id: row.try_get(5).ok(),
                duration_ms: compute_duration(started_at.as_deref(), finished.as_deref()),
                started_at,
                finished_at: finished,
                retry_count: row.try_get(9).unwrap_or(0),
            })
        })
        .collect()
}

async fn api_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT id, collection_name, status, started_at, finished_at, duration_ms
         FROM api_collection_runs ORDER BY started_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(3).ok();
            let finished: Option<String> = row.try_get(4).ok();
            let stored_duration: Option<i64> = row.try_get(5).ok();
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "api".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: "manual".to_string(),
                actor_id: None,
                correlation_id: None,
                duration_ms: stored_duration.or_else(|| compute_duration(started.as_deref(), finished.as_deref())),
                started_at: started,
                finished_at: finished,
                retry_count: 0,
            })
        })
        .collect()
}

async fn remote_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT id, script_name, profile_name, status, triggered_by, approved_by,
                requested_at, started_at, finished_at
         FROM remote_executions ORDER BY requested_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(3).map_err(|e| e.to_string())?;
            let script_name: String = row.try_get(1).map_err(|e| e.to_string())?;
            let profile_name: String = row.try_get(2).map_err(|e| e.to_string())?;
            let requested: Option<String> = row.try_get(6).ok();
            let started: Option<String> = row.try_get(7).ok();
            let finished: Option<String> = row.try_get(8).ok();
            let started_at = started.clone().or(requested);
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "remote".to_string(),
                name: format!("{} · {}", script_name, profile_name),
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(4).unwrap_or_default(),
                actor_id: row.try_get(5).ok(),
                correlation_id: None,
                duration_ms: compute_duration(started_at.as_deref(), finished.as_deref()),
                started_at,
                finished_at: finished,
                retry_count: 0,
            })
        })
        .collect()
}

fn collect_runs(
    pools: Vec<Result<Vec<RunSummary>, String>>,
    kind: Option<&str>,
    status: Option<&str>,
    limit: i64,
) -> Result<Vec<RunSummary>, String> {
    let mut all = Vec::new();
    for part in pools {
        all.extend(part?);
    }
    if let Some(kind) = kind {
        all.retain(|run| run.kind == kind);
    }
    if let Some(status) = status {
        let wanted = normalize_status(status);
        all.retain(|run| run.status == wanted);
    }
    all.sort_by(|a, b| {
        (b.started_at.as_deref().unwrap_or(""))
            .cmp(a.started_at.as_deref().unwrap_or(""))
    });
    all.truncate(limit.max(0) as usize);
    Ok(all)
}

fn summarize(runs: &[RunSummary]) -> Value {
    let terminal: Vec<&RunSummary> = runs.iter().filter(|r| r.duration_ms.is_some()).collect();
    let failures = runs.iter().filter(|r| is_failure(&r.status)).count();
    let average = if terminal.is_empty() {
        0
    } else {
        (terminal.iter().map(|r| r.duration_ms.unwrap_or(0)).sum::<i64>() as f64
            / terminal.len() as f64)
            .round() as i64
    };
    serde_json::json!({
        "active": runs.iter().filter(|r| is_active(&r.status)).count(),
        "succeeded": runs.iter().filter(|r| r.status == "succeeded").count(),
        "failed": failures,
        "timedOut": runs.iter().filter(|r| r.status == "timed_out").count(),
        "retried": runs.iter().map(|r| r.retry_count).sum::<i64>(),
        "averageDurationMs": average,
    })
}

fn failure_trend(runs: &[RunSummary]) -> Vec<Value> {
    let mut trend: std::collections::BTreeMap<String, i64> = std::collections::BTreeMap::new();
    for run in runs.iter().filter(|r| is_failure(&r.status)) {
        let key = run
            .finished_at
            .as_deref()
            .or(run.started_at.as_deref())
            .unwrap_or("");
        if key.len() >= 10 {
            *trend.entry(key[..10].to_string()).or_insert(0) += 1;
        }
    }
    trend
        .into_iter()
        .map(|(date, count)| serde_json::json!({ "date": date, "count": count }))
        .collect()
}

async fn schedule_health(pool: &SqlitePool) -> Result<(i64, i64), String> {
    let healthy: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workflow_triggers WHERE type = 'cron' AND enabled = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let disabled: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM workflow_triggers WHERE type = 'cron' AND enabled = 0",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok((healthy, disabled))
}

#[derive(Debug, Deserialize, Default)]
pub struct DashboardFilters {
    pub kind: Option<String>,
    pub status: Option<String>,
}

fn validate_filters(filters: &Option<DashboardFilters>) -> Result<(Option<&str>, Option<&str>), String> {
    let (kind, status) = match filters {
        Some(f) => (f.kind.as_deref(), f.status.as_deref()),
        None => (None, None),
    };
    if let Some(kind) = kind {
        if !KINDS.contains(&kind) {
            return Err("Invalid kind".to_string());
        }
    }
    if let Some(status) = status {
        if !STATUSES.contains(&status) {
            return Err("Invalid status".to_string());
        }
    }
    Ok((kind, status))
}

async fn dashboard_record(
    pool: &SqlitePool,
    filters: &Option<DashboardFilters>,
) -> Result<Value, String> {
    let (kind, status) = validate_filters(filters)?;
    let runs = collect_runs(
        vec![
            script_runs(pool, 200).await,
            workflow_runs(pool, 200).await,
            api_runs(pool, 200).await,
            remote_runs(pool, 200).await,
        ],
        kind,
        status,
        200,
    )?;

    let active: Vec<Value> = runs
        .iter()
        .filter(|run| is_active(&run.status))
        .map(|run| serde_json::to_value(run).unwrap_or(Value::Null))
        .collect();
    let recent: Vec<Value> = runs
        .iter()
        .take(50)
        .map(|run| serde_json::to_value(run).unwrap_or(Value::Null))
        .collect();
    let (healthy, disabled) = schedule_health(pool).await?;
    let failing = runs
        .iter()
        .filter(|run| is_failure(&run.status) && run.trigger == "cron")
        .count();

    Ok(serde_json::json!({
        "metrics": summarize(&runs),
        "activeRuns": active,
        "recentRuns": recent,
        "failureTrend": failure_trend(&runs),
        "scheduleHealth": {
            "healthy": healthy,
            "disabled": disabled,
            "failing": failing,
        },
    }))
}

// ---------- Run detail (redacted, camelCase) ----------

async fn workflow_detail(pool: &SqlitePool, id: &str) -> Result<Option<Value>, String> {
    let run = sqlx::query(
        "SELECT r.id, r.workflow_id, COALESCE(w.name, r.workflow_id), r.status, r.trigger_type,
                r.actor_id, r.correlation_id, r.input_json, r.output_json, r.error_json,
                r.started_at, r.finished_at, r.created_at
         FROM workflow_runs r LEFT JOIN workflows w ON w.id = r.workflow_id WHERE r.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = run else { return Ok(None) };

    let correlation_id: String = row.try_get(6).map_err(|e| e.to_string())?;
    let node_rows = sqlx::query(
        "SELECT id, node_id, node_type, status, attempt, input_json, output_json, error_json,
                selected_port, started_at, finished_at
         FROM workflow_node_runs WHERE run_id = ? ORDER BY node_id ASC",
    )
    .bind(id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let node_runs: Vec<Value> = node_rows
        .iter()
        .map(|n| {
            Ok::<Value, String>(serde_json::json!({
                "id": n.try_get::<String, _>(0).map_err(|e| e.to_string())?,
                "nodeId": n.try_get::<String, _>(1).map_err(|e| e.to_string())?,
                "nodeType": n.try_get::<String, _>(2).map_err(|e| e.to_string())?,
                "status": n.try_get::<String, _>(3).map_err(|e| e.to_string())?,
                "attempt": n.try_get::<i64, _>(4).map_err(|e| e.to_string())?,
                "input": parse_redacted(n.try_get::<Option<String>, _>(5).ok().flatten().as_deref()),
                "output": parse_redacted(n.try_get::<Option<String>, _>(6).ok().flatten().as_deref()),
                "error": parse_redacted(n.try_get::<Option<String>, _>(7).ok().flatten().as_deref()),
                "selectedPort": n.try_get::<Option<String>, _>(8).ok().flatten(),
                "startedAt": n.try_get::<Option<String>, _>(9).ok().flatten(),
                "finishedAt": n.try_get::<Option<String>, _>(10).ok().flatten(),
            }))
        })
        .collect::<Result<_, _>>()?;

    let event_rows = sqlx::query(
        "SELECT id, type, occurred_at, actor_type, actor_id, actor_name, target_type,
                target_id, target_name, data_json
         FROM execution_events WHERE correlation_id = ? ORDER BY occurred_at ASC",
    )
    .bind(&correlation_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let events: Vec<Value> = event_rows
        .iter()
        .map(|e| {
            Ok::<Value, String>(serde_json::json!({
                "id": e.try_get::<String, _>(0).map_err(|x| x.to_string())?,
                "type": e.try_get::<String, _>(1).map_err(|x| x.to_string())?,
                "occurredAt": e.try_get::<String, _>(2).map_err(|x| x.to_string())?,
                "actorType": e.try_get::<String, _>(3).map_err(|x| x.to_string())?,
                "actorId": e.try_get::<String, _>(4).map_err(|x| x.to_string())?,
                "actorName": e.try_get::<Option<String>, _>(5).ok().flatten(),
                "targetType": e.try_get::<String, _>(6).map_err(|x| x.to_string())?,
                "targetId": e.try_get::<String, _>(7).map_err(|x| x.to_string())?,
                "targetName": e.try_get::<Option<String>, _>(8).ok().flatten(),
                "data": parse_redacted(e.try_get::<Option<String>, _>(9).ok().flatten().as_deref()),
            }))
        })
        .collect::<Result<_, _>>()?;

    let status_raw: String = row.try_get(3).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::json!({
        "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
        "workflowId": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        "name": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
        "status": normalize_status(&status_raw),
        "trigger": row.try_get::<String, _>(4).unwrap_or_default(),
        "actorId": row.try_get::<Option<String>, _>(5).ok().flatten(),
        "correlationId": correlation_id,
        "input": parse_redacted(row.try_get::<Option<String>, _>(7).ok().flatten().as_deref()),
        "output": parse_redacted(row.try_get::<Option<String>, _>(8).ok().flatten().as_deref()),
        "error": parse_redacted(row.try_get::<Option<String>, _>(9).ok().flatten().as_deref()),
        "startedAt": row.try_get::<Option<String>, _>(10).ok().flatten(),
        "finishedAt": row.try_get::<Option<String>, _>(11).ok().flatten(),
        "createdAt": row.try_get::<Option<String>, _>(12).ok().flatten(),
        "nodeRuns": node_runs,
        "events": events,
    })))
}

async fn script_detail(pool: &SqlitePool, id: &str) -> Result<Option<Value>, String> {
    let row = sqlx::query(
        "SELECT b.id, b.script_id, COALESCE(s.name, b.script_id), b.status, b.triggered_by,
                b.started_at, b.finished_at, b.exit_code, b.log_file, b.webhook_payload, b.created_at
         FROM builds b LEFT JOIN scripts s ON s.id = b.script_id WHERE b.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else { return Ok(None) };
    let status_raw: String = row.try_get(3).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::json!({
        "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
        "kind": "script",
        "scriptId": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        "name": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
        "status": normalize_status(&status_raw),
        "trigger": row.try_get::<String, _>(4).unwrap_or_default(),
        "startedAt": row.try_get::<Option<String>, _>(5).ok().flatten(),
        "finishedAt": row.try_get::<Option<String>, _>(6).ok().flatten(),
        "exitCode": row.try_get::<Option<i64>, _>(7).ok().flatten(),
        "logFile": row.try_get::<Option<String>, _>(8).ok().flatten(),
        "webhookPayload": parse_redacted(row.try_get::<Option<String>, _>(9).ok().flatten().as_deref()),
        "createdAt": row.try_get::<Option<String>, _>(10).ok().flatten(),
    })))
}

async fn api_detail(pool: &SqlitePool, id: &str) -> Result<Option<Value>, String> {
    let row = sqlx::query(
        "SELECT id, collection_id, collection_name, status, total_requests, passed_requests,
                failed_requests, results, started_at, finished_at, duration_ms
         FROM api_collection_runs WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else { return Ok(None) };
    let status_raw: String = row.try_get(3).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::json!({
        "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
        "kind": "api",
        "collectionId": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        "collectionName": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
        "name": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
        "status": normalize_status(&status_raw),
        "totalRequests": row.try_get::<i64, _>(4).unwrap_or_default(),
        "passedRequests": row.try_get::<i64, _>(5).unwrap_or_default(),
        "failedRequests": row.try_get::<i64, _>(6).unwrap_or_default(),
        "results": parse_redacted(row.try_get::<Option<String>, _>(7).ok().flatten().as_deref()),
        "startedAt": row.try_get::<Option<String>, _>(8).ok().flatten(),
        "finishedAt": row.try_get::<Option<String>, _>(9).ok().flatten(),
        "durationMs": row.try_get::<Option<i64>, _>(10).ok().flatten(),
    })))
}

async fn remote_detail(pool: &SqlitePool, id: &str) -> Result<Option<Value>, String> {
    let row = sqlx::query(
        "SELECT id, script_name, profile_name, status, triggered_by, approved_by, remote_path,
                exit_code, log_output, param_values, requested_at, started_at, finished_at
         FROM remote_executions WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some(row) = row else { return Ok(None) };
    let status_raw: String = row.try_get(3).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::json!({
        "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
        "kind": "remote",
        "scriptName": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        "profileName": row.try_get::<String, _>(2).map_err(|e| e.to_string())?,
        "name": format!(
            "{} · {}",
            row.try_get::<String, _>(1).unwrap_or_default(),
            row.try_get::<String, _>(2).unwrap_or_default()
        ),
        "status": normalize_status(&status_raw),
        "trigger": row.try_get::<String, _>(4).unwrap_or_default(),
        "approvedBy": row.try_get::<Option<String>, _>(5).ok().flatten(),
        "remotePath": row.try_get::<Option<String>, _>(6).ok().flatten(),
        "exitCode": row.try_get::<Option<i64>, _>(7).ok().flatten(),
        "logOutput": row
            .try_get::<Option<String>, _>(8)
            .ok()
            .flatten()
            .map(|v| Value::String(redact_string(&v))),
        "paramValues": parse_redacted(row.try_get::<Option<String>, _>(9).ok().flatten().as_deref()),
        "requestedAt": row.try_get::<Option<String>, _>(10).ok().flatten(),
        "startedAt": row.try_get::<Option<String>, _>(11).ok().flatten(),
        "finishedAt": row.try_get::<Option<String>, _>(12).ok().flatten(),
    })))
}

async fn run_detail_record(pool: &SqlitePool, kind: &str, id: &str) -> Result<Option<Value>, String> {
    match kind {
        "workflow" => workflow_detail(pool, id).await,
        "script" => script_detail(pool, id).await,
        "api" => api_detail(pool, id).await,
        "remote" => remote_detail(pool, id).await,
        other => Err(format!("Invalid kind: {other}")),
    }
}

async fn log_record(pool: &SqlitePool, kind: &str, id: &str) -> Result<String, String> {
    match run_detail_record(pool, kind, id).await? {
        Some(detail) => Ok(serde_json::to_string_pretty(&detail).unwrap_or_else(|_| "{}".to_string())),
        None => Err("Run not found".to_string()),
    }
}

async fn cancel_record(pool: &SqlitePool, kind: &str, id: &str) -> Result<Value, String> {
    if kind != "workflow" {
        return Err("Cancellation is not supported for this execution type".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let res = sqlx::query("UPDATE workflow_runs SET cancel_requested_at = ? WHERE id = ?")
        .bind(&now)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    if res.rows_affected() == 0 {
        return Err("Run not found".to_string());
    }
    Ok(serde_json::json!({ "ok": true, "id": id }))
}

async fn retry_record(pool: &SqlitePool, kind: &str, id: &str, node_id: Option<&str>) -> Result<Value, String> {
    if kind != "workflow" {
        return Err("Retry is not supported for this execution type".to_string());
    }
    let selected = match node_id {
        Some(node) if !node.trim().is_empty() => node.to_string(),
        _ => {
            let candidate: Option<String> = sqlx::query_scalar(
                "SELECT node_id FROM workflow_node_runs
                 WHERE run_id = ? AND status IN ('failed', 'interrupted', 'cancelled', 'skipped')
                 ORDER BY node_id ASC LIMIT 1",
            )
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
            candidate.ok_or_else(|| "No failed node is eligible for retry".to_string())?
        }
    };
    crate::workflows::retry_node_record(pool, id, &selected).await?;
    Ok(serde_json::json!({ "ok": true, "id": id, "nodeId": selected }))
}

async fn cleanup_events_record(pool: &SqlitePool, event_days: i64) -> Result<Value, String> {
    let days = event_days.clamp(1, 3650);
    let before = chrono::Utc::now() - chrono::Duration::days(days);
    let before_str = before.to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let res = sqlx::query("DELETE FROM execution_events WHERE occurred_at < ?")
        .bind(&before_str)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "deletedEvents": res.rows_affected(),
        "eventDays": days,
        "before": before_str,
    }))
}

// ---------- Tauri commands ----------

#[tauri::command]
pub async fn get_observability_dashboard(
    pool: State<'_, SqlitePool>,
    filters: Option<DashboardFilters>,
) -> Result<Value, String> {
    dashboard_record(&pool, &filters).await
}

#[tauri::command]
pub async fn get_observability_run_detail(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<Option<Value>, String> {
    run_detail_record(&pool, &kind, &id).await
}

#[tauri::command]
pub async fn read_observability_log(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<String, String> {
    log_record(&pool, &kind, &id).await
}

#[tauri::command]
pub async fn cancel_observability_run(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<Value, String> {
    cancel_record(&pool, &kind, &id).await
}

#[tauri::command]
pub async fn retry_observability_run(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
    node_id: Option<String>,
) -> Result<Value, String> {
    retry_record(&pool, &kind, &id, node_id.as_deref()).await
}

#[tauri::command]
pub async fn cleanup_observability_events(
    pool: State<'_, SqlitePool>,
    event_days: Option<i64>,
) -> Result<Value, String> {
    cleanup_events_record(&pool, event_days.unwrap_or(30)).await
}

// Keep the script-retry path reachable for future callers without dead-code noise.
#[allow(dead_code)]
pub async fn retry_script_run(
    app_handle: &AppHandle,
    pool: &SqlitePool,
    build_id: &str,
) -> Result<Value, String> {
    let script_id: String = sqlx::query_scalar("SELECT script_id FROM builds WHERE id = ?")
        .bind(build_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Build not found".to_string())?;
    let exec_state = app_handle.state::<ExecutionState>();
    let result = crate::execution::run_script_core(
        pool.clone(),
        app_handle.clone(),
        &exec_state,
        RunScriptPayload {
            script_id,
            param_values: None,
            build_id: None,
            triggered_by: Some("retry".to_string()),
        },
    )
    .await?;
    Ok(serde_json::json!({ "ok": true, "buildId": result.build_id }))
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::ensure_schema;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create in-memory sqlite pool");
        ensure_schema(&pool).await.expect("ensure schema");
        pool
    }

    #[test]
    fn normalize_status_matches_web() {
        assert_eq!(normalize_status("pending"), "queued");
        assert_eq!(normalize_status("in_progress"), "running");
        assert_eq!(normalize_status("pending_approval"), "waiting");
        assert_eq!(normalize_status("waiting_approval"), "waiting");
        assert_eq!(normalize_status("completed"), "succeeded");
        assert_eq!(normalize_status("passed"), "succeeded");
        assert_eq!(normalize_status("canceled"), "cancelled");
        assert_eq!(normalize_status("timeout"), "timed_out");
        assert_eq!(normalize_status("interrupted"), "interrupted");
        assert_eq!(normalize_status("mystery"), "failed");
    }

    #[test]
    fn redaction_masks_sensitive_keys_and_credential_text() {
        let value = serde_json::json!({
            "authorization": "Bearer abc",
            "nested": { "apiKey": "xyz", "note": "token=sekret&x=1" },
            "list": ["password=hunter2"],
        });
        let redacted = redact_value(&value);
        assert_eq!(redacted["authorization"], Value::String("[REDACTED]".to_string()));
        assert_eq!(redacted["nested"]["apiKey"], Value::String("[REDACTED]".to_string()));
        assert_eq!(
            redacted["nested"]["note"],
            Value::String("token=[REDACTED]&x=1".to_string())
        );
        assert_eq!(
            redacted["list"][0],
            Value::String("password=[REDACTED]".to_string())
        );
    }

    async fn seed_script_build(pool: &SqlitePool, id: &str, status: &str, started: &str, finished: Option<&str>) {
        sqlx::query("INSERT OR IGNORE INTO scripts (id, name, filename) VALUES ('s-1', 'Backup', 'backup.py')")
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO builds (id, script_id, status, triggered_by, started_at, finished_at) VALUES (?, 's-1', ?, 'manual', ?, ?)")
            .bind(id)
            .bind(status)
            .bind(started)
            .bind(finished)
            .execute(pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn dashboard_matches_contract_shape_and_metrics() {
        let pool = test_pool().await;
        seed_script_build(&pool, "b-1", "success", "2026-09-05 10:00:00", Some("2026-09-05 10:01:00")).await;
        seed_script_build(&pool, "b-2", "failure", "2026-09-05 11:00:00", Some("2026-09-05 11:02:00")).await;

        let dashboard = dashboard_record(&pool, &None).await.unwrap();
        assert_eq!(dashboard["metrics"]["succeeded"], 1);
        assert_eq!(dashboard["metrics"]["failed"], 1);
        assert_eq!(dashboard["metrics"]["averageDurationMs"], 90_000);
        let recent = dashboard["recentRuns"].as_array().unwrap();
        assert_eq!(recent.len(), 2);
        // camelCase keys required by the renderer
        assert!(recent[0].get("startedAt").is_some());
        assert!(recent[0].get("durationMs").is_some());
        assert!(recent[0].get("retryCount").is_some());
        assert_eq!(dashboard["scheduleHealth"]["healthy"], 0);
        assert!(dashboard["activeRuns"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn dashboard_filters_by_kind_and_status() {
        let pool = test_pool().await;
        seed_script_build(&pool, "b-1", "success", "2026-09-05 10:00:00", Some("2026-09-05 10:01:00")).await;
        seed_script_build(&pool, "b-2", "failure", "2026-09-05 11:00:00", Some("2026-09-05 11:02:00")).await;

        let filtered = dashboard_record(
            &pool,
            &Some(DashboardFilters { kind: Some("script".into()), status: Some("failed".into()) }),
        )
        .await
        .unwrap();
        let recent = filtered["recentRuns"].as_array().unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0]["id"], "b-2");

        assert!(dashboard_record(&pool, &Some(DashboardFilters { kind: Some("nope".into()), status: None }))
            .await
            .is_err());
        assert!(dashboard_record(&pool, &Some(DashboardFilters { kind: None, status: Some("nope".into()) }))
            .await
            .is_err());
    }

    #[tokio::test]
    async fn schedule_health_reads_cron_triggers() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO workflows (id, name, draft_definition) VALUES ('w-1', 'W', '{}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_triggers (id, workflow_id, type, enabled) VALUES ('t-1', 'w-1', 'cron', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_triggers (id, workflow_id, type, enabled) VALUES ('t-2', 'w-1', 'cron', 0)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_triggers (id, workflow_id, type, enabled) VALUES ('t-3', 'w-1', 'webhook', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let dashboard = dashboard_record(&pool, &None).await.unwrap();
        assert_eq!(dashboard["scheduleHealth"]["healthy"], 1);
        assert_eq!(dashboard["scheduleHealth"]["disabled"], 1);
    }

    #[tokio::test]
    async fn workflow_detail_exposes_node_runs_and_events() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO workflows (id, name, draft_definition) VALUES ('w-1', 'Flow', '{}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO workflow_runs (id, workflow_id, version_id, status, trigger_type, actor_id, correlation_id, input_json, started_at)
             VALUES ('r-1', 'w-1', 'v-1', 'failed', 'manual', 'local-admin', 'corr_1', '{\"token\":\"secret\"}', '2026-09-05 10:00:00')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO workflow_node_runs (id, run_id, node_id, node_type, status, attempt, error_json)
             VALUES ('nr-1', 'r-1', 'n1', 'remote', 'failed', 2, '{\"message\":\"boom\"}')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO execution_events (id, type, execution_kind, correlation_id, occurred_at, actor_type, actor_id, target_type, target_id, data_json)
             VALUES ('e-1', 'execution.started', 'workflow', 'corr_1', '2026-09-05 10:00:00', 'user', 'u1', 'workflow', 'r-1', '{\"authorization\":\"Bearer x\"}')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let detail = run_detail_record(&pool, "workflow", "r-1").await.unwrap().unwrap();
        assert_eq!(detail["status"], "failed");
        let node = &detail["nodeRuns"][0];
        assert_eq!(node["nodeId"], "n1");
        assert_eq!(node["attempt"], 2);
        assert_eq!(node["error"]["message"], "boom");
        let event = &detail["events"][0];
        assert_eq!(event["type"], "execution.started");
        assert_eq!(event["data"]["authorization"], Value::String("[REDACTED]".to_string()));
        // inputJson secret-key redaction
        assert_eq!(detail["input"]["token"], Value::String("[REDACTED]".to_string()));

        // log is pretty-printed redacted JSON
        let log = log_record(&pool, "workflow", "r-1").await.unwrap();
        assert!(log.contains("\"nodeRuns\""));
        assert!(log.contains("[REDACTED]"));
    }

    #[tokio::test]
    async fn run_detail_and_log_for_script_builds() {
        let pool = test_pool().await;
        seed_script_build(&pool, "b-1", "success", "2026-09-05 10:00:00", Some("2026-09-05 10:01:00")).await;
        let detail = run_detail_record(&pool, "script", "b-1").await.unwrap().unwrap();
        assert_eq!(detail["name"], "Backup");
        assert_eq!(detail["status"], "succeeded");
        assert!(run_detail_record(&pool, "script", "missing").await.unwrap().is_none());
        assert!(log_record(&pool, "script", "missing").await.is_err());
    }

    #[tokio::test]
    async fn remote_runs_and_detail_are_redacted() {
        let pool = test_pool().await;
        sqlx::query(
            "INSERT INTO scripts (id, name, filename, content) VALUES ('s-1', 'Deploy', 'deploy.ps1', 'echo deploy')",
        )
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO server_profiles (id, name, host, username) VALUES ('p-1', 'Prod', 'prod.example.com', 'admin')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO remote_executions (id, script_id, profile_id, script_name, profile_name, status, triggered_by, approved_by, approved_at, log_output, param_values, requested_at)
             VALUES ('rx-1', 's-1', 'p-1', 'Deploy', 'Prod', 'success', 'manual', 'admin', '2026-09-05 10:00:00', 'token=abc', '{\"password\":\"x\"}', '2026-09-05 09:59:00')",
        )
        .execute(&pool)
        .await
        .unwrap();

        let dashboard = dashboard_record(&pool, &None).await.unwrap();
        let remote = dashboard["recentRuns"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["kind"] == "remote")
            .unwrap()
            .clone();
        assert_eq!(remote["name"], "Deploy · Prod");
        assert_eq!(remote["actorId"], "admin");

        let detail = run_detail_record(&pool, "remote", "rx-1").await.unwrap().unwrap();
        assert_eq!(detail["logOutput"], Value::String("token=[REDACTED]".to_string()));
        assert_eq!(detail["paramValues"]["password"], Value::String("[REDACTED]".to_string()));
    }

    #[tokio::test]
    async fn cancel_sets_only_cancel_requested_at() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO workflows (id, name, draft_definition) VALUES ('w-1', 'W', '{}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO workflow_runs (id, workflow_id, version_id, status, correlation_id) VALUES ('r-1', 'w-1', 'v-1', 'running', 'corr_1')",
        )
        .execute(&pool)
        .await
        .unwrap();
        cancel_record(&pool, "workflow", "r-1").await.unwrap();
        let (status, cancel_flag): (String, Option<String>) =
            sqlx::query_as("SELECT status, cancel_requested_at FROM workflow_runs WHERE id = 'r-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(status, "running");
        assert!(cancel_flag.is_some());
        assert!(cancel_record(&pool, "script", "r-1").await.is_err());
        assert!(cancel_record(&pool, "workflow", "missing").await.is_err());
    }

    #[tokio::test]
    async fn retry_picks_first_eligible_node() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO workflows (id, name, draft_definition) VALUES ('w-1', 'W', '{}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_versions (id, workflow_id, version, definition_json) VALUES ('v-1', 'w-1', 1, '{\"schemaVersion\":1,\"name\":\"W\",\"nodes\":[{\"id\":\"n1\",\"type\":\"delay\",\"name\":\"D\",\"config\":{\"durationMs\":0}}],\"edges\":[]}')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_runs (id, workflow_id, version_id, status, correlation_id) VALUES ('r-1', 'w-1', 'v-1', 'failed', 'corr_1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO workflow_node_runs (id, run_id, node_id, node_type, status, attempt) VALUES ('nr-1', 'r-1', 'n1', 'delay', 'failed', 1)")
            .execute(&pool)
            .await
            .unwrap();

        let result = retry_record(&pool, "workflow", "r-1", None).await.unwrap();
        assert_eq!(result["nodeId"], "n1");
        assert!(retry_record(&pool, "workflow", "r-1", None).await.is_err());
        assert!(retry_record(&pool, "api", "r-1", None).await.is_err());
    }

    #[tokio::test]
    async fn cleanup_deletes_old_events_only() {
        let pool = test_pool().await;
        sqlx::query(
            "INSERT INTO execution_events (id, type, execution_kind, correlation_id, occurred_at, actor_type, actor_id, target_type, target_id)
             VALUES ('old', 'execution.started', 'workflow', 'c1', '2000-01-01T00:00:00Z', 'user', 'u', 'workflow', 'r')",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO execution_events (id, type, execution_kind, correlation_id, occurred_at, actor_type, actor_id, target_type, target_id)
             VALUES ('new', 'execution.started', 'workflow', 'c2', ?, 'user', 'u', 'workflow', 'r')",
        )
        .bind(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .execute(&pool)
        .await
        .unwrap();

        let result = cleanup_events_record(&pool, 30).await.unwrap();
        assert_eq!(result["deletedEvents"], 1);
        let remaining: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM execution_events")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 1);
    }
}
