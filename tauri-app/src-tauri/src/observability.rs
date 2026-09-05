use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Manager, State};

use crate::execution::{run_script_core, ExecutionState, RunScriptPayload};

pub const KINDS: [&str; 4] = ["workflow", "script", "api", "remote"];

fn normalize_status(raw: &str) -> &'static str {
    match raw {
        "running" | "waiting" | "in_progress" => "running",
        "queued" | "pending" => "queued",
        "success" | "succeeded" => "succeeded",
        "failure" | "failed" => "failed",
        "cancelled" | "canceled" => "cancelled",
        "timeout" | "timed_out" => "timed_out",
        _ => "queued",
    }
}

fn parse_timestamp(raw: Option<&str>) -> Option<chrono::DateTime<chrono::Utc>> {
    let raw = raw?;
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(raw) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    chrono::NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|naive| chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(naive, chrono::Utc))
}

#[derive(Debug, Serialize, Clone)]
pub struct RunSummary {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub status: String,
    pub trigger: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    pub retry_count: i64,
}

impl RunSummary {
    fn normalized_status(&self) -> &'static str {
        normalize_status(&self.status)
    }
}

async fn script_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT b.id, COALESCE(s.name, b.script_id), b.status, b.triggered_by, b.started_at, b.finished_at
         FROM builds b LEFT JOIN scripts s ON s.id = b.script_id
         ORDER BY COALESCE(b.started_at, b.created_at) DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(4).map_err(|e| e.to_string())?;
            let finished: Option<String> = row.try_get(5).map_err(|e| e.to_string())?;
            let started_dt = parse_timestamp(started.as_deref());
            let finished_dt = parse_timestamp(finished.as_deref());
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "script".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(3).map_err(|e| e.to_string()).unwrap_or_default(),
                started_at: started,
                finished_at: finished,
                duration_ms: match (started_dt, finished_dt) {
                    (Some(a), Some(b)) => Some((b - a).num_milliseconds()),
                    _ => None,
                },
                retry_count: 0,
            })
        })
        .collect()
}

async fn workflow_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT r.id, COALESCE(w.name, r.workflow_id), r.status, r.trigger_type, r.started_at, r.finished_at
         FROM workflow_runs r LEFT JOIN workflows w ON w.id = r.workflow_id
         ORDER BY COALESCE(r.started_at, '') DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(4).map_err(|e| e.to_string())?;
            let finished: Option<String> = row.try_get(5).map_err(|e| e.to_string())?;
            let started_dt = parse_timestamp(started.as_deref());
            let finished_dt = parse_timestamp(finished.as_deref());
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "workflow".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(3).map_err(|e| e.to_string()).unwrap_or_default(),
                started_at: started,
                finished_at: finished,
                duration_ms: match (started_dt, finished_dt) {
                    (Some(a), Some(b)) => Some((b - a).num_milliseconds()),
                    _ => None,
                },
                retry_count: 0,
            })
        })
        .collect()
}

async fn api_runs(pool: &SqlitePool, limit: i64) -> Result<Vec<RunSummary>, String> {
    let rows = sqlx::query(
        "SELECT id, collection_name, status, 'manual', started_at, finished_at
         FROM api_collection_runs ORDER BY started_at DESC LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let status_raw: String = row.try_get(2).map_err(|e| e.to_string())?;
            let started: Option<String> = row.try_get(4).map_err(|e| e.to_string())?;
            let finished: Option<String> = row.try_get(5).map_err(|e| e.to_string())?;
            let started_dt = parse_timestamp(started.as_deref());
            let finished_dt = parse_timestamp(finished.as_deref());
            Ok(RunSummary {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                kind: "api".to_string(),
                name: row.try_get(1).map_err(|e| e.to_string())?,
                status: normalize_status(&status_raw).to_string(),
                trigger: row.try_get(3).map_err(|e| e.to_string()).unwrap_or_default(),
                started_at: started,
                finished_at: finished,
                duration_ms: match (started_dt, finished_dt) {
                    (Some(a), Some(b)) => Some((b - a).num_milliseconds()),
                    _ => None,
                },
                retry_count: 0,
            })
        })
        .collect()
}

fn collect_runs(
    pools: Vec<Result<Vec<RunSummary>, String>>,
    kind: Option<&str>,
    status: Option<&str>,
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
        all.retain(|run| run.normalized_status() == wanted);
    }
    all.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(all)
}

fn summarize(runs: &[RunSummary]) -> Value {
    let active = runs.iter().filter(|r| r.normalized_status() == "running" || r.normalized_status() == "queued").count();
    let succeeded = runs.iter().filter(|r| r.normalized_status() == "succeeded").count();
    let failed = runs.iter().filter(|r| r.normalized_status() == "failed").count();
    let timed_out = runs.iter().filter(|r| r.normalized_status() == "timed_out").count();
    let durations: Vec<i64> = runs.iter().filter_map(|r| r.duration_ms).collect();
    let average = if durations.is_empty() {
        0
    } else {
        durations.iter().sum::<i64>() / durations.len() as i64
    };
    serde_json::json!({
        "active": active,
        "succeeded": succeeded,
        "failed": failed,
        "timedOut": timed_out,
        "retried": runs.iter().filter(|r| r.retry_count > 0).count(),
        "averageDurationMs": average,
    })
}

fn failure_trend(runs: &[RunSummary]) -> Vec<Value> {
    let mut trend = Vec::new();
    for days_ago in (0..7).rev() {
        let day = chrono::Utc::now() - chrono::Duration::days(days_ago);
        let date = day.format("%Y-%m-%d").to_string();
        let count = runs
            .iter()
            .filter(|run| {
                run.normalized_status() == "failed"
                    && run
                        .started_at
                        .as_deref()
                        .and_then(|raw| parse_timestamp(Some(raw)))
                        .map(|ts| ts.format("%Y-%m-%d").to_string() == date)
                        .unwrap_or(false)
            })
            .count();
        trend.push(serde_json::json!({ "date": date, "count": count }));
    }
    trend
}

async fn schedule_health(pool: &SqlitePool) -> Result<Value, String> {
    let row = sqlx::query(
        "SELECT
            COUNT(*) FILTER (WHERE schedule_enabled = 1),
            COUNT(*) FILTER (WHERE schedule_enabled = 0)
         FROM scripts",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    let enabled: i64 = row.try_get(0).map_err(|e| e.to_string())?;
    let disabled: i64 = row.try_get(1).map_err(|e| e.to_string())?;

    // A schedule is failing when its latest build did not succeed.
    let failing: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT s.id) FROM scripts s
         WHERE s.schedule_enabled = 1 AND EXISTS (
            SELECT 1 FROM builds b WHERE b.script_id = s.id AND b.status IN ('failure', 'timeout')
         )",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "healthy": (enabled - failing).max(0),
        "disabled": disabled,
        "failing": failing,
    }))
}

#[derive(Debug, Deserialize, Default)]
pub struct DashboardFilters {
    pub kind: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub async fn get_observability_dashboard(
    pool: State<'_, SqlitePool>,
    filters: Option<DashboardFilters>,
) -> Result<Value, String> {
    let (kind, status) = match &filters {
        Some(filters) => (filters.kind.as_deref(), filters.status.as_deref()),
        None => (None, None),
    };
    if let Some(kind) = kind {
        if !KINDS.contains(&kind) {
            return Err(format!("Unknown execution kind: {kind}"));
        }
    }

    let runs = collect_runs(
        vec![
            script_runs(&pool, 200).await,
            workflow_runs(&pool, 200).await,
            api_runs(&pool, 200).await,
        ],
        kind,
        status,
    )?;

    let recent: Vec<Value> = runs
        .iter()
        .take(25)
        .map(|run| serde_json::to_value(run).unwrap_or(Value::Null))
        .collect();
    let active: Vec<Value> = runs
        .iter()
        .filter(|run| matches!(run.normalized_status(), "running" | "queued"))
        .take(25)
        .map(|run| serde_json::to_value(run).unwrap_or(Value::Null))
        .collect();

    Ok(serde_json::json!({
        "metrics": summarize(&runs),
        "activeRuns": active,
        "recentRuns": recent,
        "failureTrend": failure_trend(&runs),
        "scheduleHealth": schedule_health(&pool).await?,
    }))
}

#[tauri::command]
pub async fn get_observability_run_detail(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<Option<Value>, String> {
    match kind.as_str() {
        "script" => {
            let row = sqlx::query(
                "SELECT b.id, b.script_id, COALESCE(s.name, b.script_id), b.status, b.triggered_by, b.started_at, b.finished_at, b.exit_code, b.log_file
                 FROM builds b LEFT JOIN scripts s ON s.id = b.script_id WHERE b.id = ?",
            )
            .bind(&id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(row.map(|row| {
                serde_json::json!({
                    "id": row.try_get::<String, _>(0).unwrap_or_default(),
                    "kind": "script",
                    "scriptId": row.try_get::<String, _>(1).unwrap_or_default(),
                    "name": row.try_get::<String, _>(2).unwrap_or_default(),
                    "status": normalize_status(&row.try_get::<String, _>(3).unwrap_or_default()),
                    "trigger": row.try_get::<String, _>(4).unwrap_or_default(),
                    "startedAt": row.try_get::<Option<String>, _>(5).unwrap_or(None),
                    "finishedAt": row.try_get::<Option<String>, _>(6).unwrap_or(None),
                    "exitCode": row.try_get::<Option<i64>, _>(7).unwrap_or(None),
                    "logFile": row.try_get::<Option<String>, _>(8).unwrap_or(None),
                })
            }))
        }
        "workflow" => {
            let exists: Option<String> =
                sqlx::query_scalar("SELECT id FROM workflow_runs WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
            match exists {
                None => Ok(None),
                Some(_) => {
                    let nodes = sqlx::query(
                        "SELECT node_id, status, attempts, started_at, finished_at, error_json
                         FROM workflow_node_runs WHERE run_id = ? ORDER BY started_at",
                    )
                    .bind(&id)
                    .fetch_all(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
                    let nodes_json: Vec<Value> = nodes
                        .iter()
                        .map(|row| {
                            Ok::<Value, String>(serde_json::json!({
                                "nodeId": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
                                "status": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
                                "attempts": row.try_get::<i64, _>(2).map_err(|e| e.to_string())?,
                                "startedAt": row.try_get::<Option<String>, _>(3).map_err(|e| e.to_string())?,
                                "finishedAt": row.try_get::<Option<String>, _>(4).map_err(|e| e.to_string())?,
                                "error": row
                                    .try_get::<Option<String>, _>(5)
                                    .ok()
                                    .flatten()
                                    .and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
                            }))
                        })
                        .collect::<Result<_, _>>()?;
                    Ok(Some(serde_json::json!({ "id": id, "kind": "workflow", "nodes": nodes_json })))
                }
            }
        }
        "api" => {
            let row = sqlx::query("SELECT id, collection_name, status, total_requests, passed_requests, failed_requests, results, started_at, finished_at FROM api_collection_runs WHERE id = ?")
                .bind(&id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(row.map(|row| {
                serde_json::json!({
                    "id": row.try_get::<String, _>(0).unwrap_or_default(),
                    "kind": "api",
                    "name": row.try_get::<String, _>(1).unwrap_or_default(),
                    "status": normalize_status(&row.try_get::<String, _>(2).unwrap_or_default()),
                    "totalRequests": row.try_get::<i64, _>(3).unwrap_or_default(),
                    "passedRequests": row.try_get::<i64, _>(4).unwrap_or_default(),
                    "failedRequests": row.try_get::<i64, _>(5).unwrap_or_default(),
                    "results": row.try_get::<String, _>(6).ok()
                        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
                        .unwrap_or(Value::Null),
                    "startedAt": row.try_get::<Option<String>, _>(7).unwrap_or(None),
                    "finishedAt": row.try_get::<Option<String>, _>(8).unwrap_or(None),
                })
            }))
        }
        _ => Err(format!("Unknown execution kind: {kind}")),
    }
}

#[tauri::command]
pub async fn read_observability_log(
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<String, String> {
    match kind.as_str() {
        "script" => {
            let log_file: Option<String> =
                sqlx::query_scalar("SELECT log_file FROM builds WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .flatten();
            match log_file {
                Some(path) if std::path::Path::new(&path).exists() => {
                    std::fs::read_to_string(&path).map_err(|e| e.to_string())
                }
                _ => Ok(String::new()),
            }
        }
        "workflow" => {
            let rows = sqlx::query(
                "SELECT node_id, error_json FROM workflow_node_runs WHERE run_id = ? AND error_json IS NOT NULL ORDER BY started_at",
            )
            .bind(&id)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            let mut out = String::new();
            for row in rows {
                let node: String = row.try_get(0).map_err(|e| e.to_string())?;
                let error: Option<String> = row.try_get(1).map_err(|e| e.to_string())?;
                if let Some(error) = error {
                    out.push_str(&format!("[{node}] {error}\n"));
                }
            }
            Ok(out)
        }
        "api" => {
            let results: Option<String> =
                sqlx::query_scalar("SELECT results FROM api_collection_runs WHERE id = ?")
                    .bind(&id)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .flatten();
            Ok(results.unwrap_or_default())
        }
        _ => Err(format!("Unknown execution kind: {kind}")),
    }
}

#[tauri::command]
pub async fn cancel_observability_run(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
) -> Result<Value, String> {
    match kind.as_str() {
        "script" => {
            let exec_state = app_handle.state::<ExecutionState>();
            crate::execution::cancel_run(exec_state, id.clone()).await?;
            Ok(serde_json::json!({ "ok": true, "id": id }))
        }
        "workflow" => {
            let now = chrono::Utc::now().to_rfc3339();
            sqlx::query(
                "UPDATE workflow_runs SET cancel_requested_at = ?, status = 'cancelled', finished_at = ? WHERE id = ? AND status IN ('queued', 'running', 'waiting')",
            )
            .bind(&now)
            .bind(&now)
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "ok": true, "id": id }))
        }
        other => Err(format!("Cancellation is not supported for {other} runs")),
    }
}

#[tauri::command]
pub async fn retry_observability_run(
    app_handle: AppHandle,
    pool: State<'_, SqlitePool>,
    kind: String,
    id: String,
    node_id: Option<String>,
) -> Result<Value, String> {
    match kind.as_str() {
        "workflow" => {
            let node_id = node_id.ok_or_else(|| "Node id is required to retry a workflow node".to_string())?;
            crate::workflows::retry_node_record(&pool, &id, &node_id).await?;
            Ok(serde_json::json!({ "ok": true, "id": id }))
        }
        "script" => {
            let script_id: String = sqlx::query_scalar("SELECT script_id FROM builds WHERE id = ?")
                .bind(&id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Build not found".to_string())?;
            let exec_state = app_handle.state::<ExecutionState>();
            let result = run_script_core(
                (*pool).clone(),
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
        other => Err(format!("Retry is not supported for {other} runs")),
    }
}

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

    #[tokio::test]
    async fn dashboard_counts_script_and_api_runs() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename) VALUES ('s-1', 'Backup', 'backup.py')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO builds (id, script_id, status, started_at, finished_at) VALUES ('b-1', 's-1', 'success', '2026-09-05 10:00:00', '2026-09-05 10:01:00')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO builds (id, script_id, status, started_at) VALUES ('b-2', 's-1', 'failure', '2026-09-05 11:00:00')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO api_collections (id, name) VALUES ('c-1', 'Smoke')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO api_collection_runs (id, collection_id, collection_name, status) VALUES ('r-1', 'c-1', 'Smoke', 'success')")
            .execute(&pool)
            .await
            .unwrap();

        let pool_state = pool.clone();
        let dashboard = dashboard_core(&pool_state, None).await.unwrap();
        let metrics = &dashboard["metrics"];
        assert_eq!(metrics["succeeded"], 2);
        assert_eq!(metrics["failed"], 1);
        assert_eq!(dashboard["recentRuns"].as_array().unwrap().len(), 3);

        let filtered = dashboard_core(&pool_state, Some(DashboardFilters { kind: Some("script".into()), status: Some("failed".into()) }))
            .await
            .unwrap();
        let recent = filtered["recentRuns"].as_array().unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0]["id"], "b-2");
    }

    #[tokio::test]
    async fn schedule_health_counts_enabled_and_failing() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, schedule_enabled) VALUES ('s-1', 'A', 'a.py', 1)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO builds (id, script_id, status) VALUES ('b-1', 's-1', 'failure')")
            .execute(&pool)
            .await
            .unwrap();
        let health = schedule_health(&pool).await.unwrap();
        assert_eq!(health["failing"], 1);
        assert_eq!(health["healthy"], 0);
    }

    #[tokio::test]
    async fn run_detail_and_log_for_script_builds() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename) VALUES ('s-1', 'Backup', 'backup.py')")
            .execute(&pool)
            .await
            .unwrap();
        let log_path = std::env::temp_dir().join(format!("obs-log-{}.txt", uuid::Uuid::new_v4()));
        std::fs::write(&log_path, "line-1\nline-2").unwrap();
        sqlx::query("INSERT INTO builds (id, script_id, status, log_file) VALUES ('b-1', 's-1', 'success', ?)")
            .bind(log_path.to_string_lossy().to_string())
            .execute(&pool)
            .await
            .unwrap();

        let detail = run_detail_core(&pool, "script", "b-1").await.unwrap().unwrap();
        assert_eq!(detail["name"], "Backup");
        let log = log_core(&pool, "script", "b-1").await.unwrap();
        assert!(log.contains("line-2"));
        assert!(run_detail_core(&pool, "script", "missing").await.unwrap().is_none());
        let _ = std::fs::remove_file(&log_path);
    }

    async fn dashboard_core(pool: &SqlitePool, filters: Option<DashboardFilters>) -> Result<Value, String> {
        let (kind, status) = match &filters {
            Some(f) => (f.kind.as_deref(), f.status.as_deref()),
            None => (None, None),
        };
        let runs = collect_runs(
            vec![script_runs(pool, 200).await, workflow_runs(pool, 200).await, api_runs(pool, 200).await],
            kind,
            status,
        )?;
        let recent: Vec<Value> = runs
            .iter()
            .take(25)
            .map(|run| serde_json::to_value(run).unwrap_or(Value::Null))
            .collect();
        Ok(serde_json::json!({
            "metrics": summarize(&runs),
            "recentRuns": recent,
            "failureTrend": failure_trend(&runs),
            "scheduleHealth": schedule_health(pool).await?,
        }))
    }

    async fn run_detail_core(pool: &SqlitePool, kind: &str, id: &str) -> Result<Option<Value>, String> {
        match kind {
            "script" => {
                let row = sqlx::query(
                    "SELECT b.id, b.script_id, COALESCE(s.name, b.script_id), b.status, b.triggered_by, b.started_at, b.finished_at, b.exit_code, b.log_file
                     FROM builds b LEFT JOIN scripts s ON s.id = b.script_id WHERE b.id = ?",
                )
                .bind(id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
                Ok(row.map(|row| {
                    serde_json::json!({
                        "id": row.try_get::<String, _>(0).unwrap_or_default(),
                        "scriptId": row.try_get::<String, _>(1).unwrap_or_default(),
                        "name": row.try_get::<String, _>(2).unwrap_or_default(),
                        "status": normalize_status(&row.try_get::<String, _>(3).unwrap_or_default()),
                    })
                }))
            }
            _ => Ok(None),
        }
    }

    async fn log_core(pool: &SqlitePool, kind: &str, id: &str) -> Result<String, String> {
        match kind {
            "script" => {
                let log_file: Option<String> =
                    sqlx::query_scalar("SELECT log_file FROM builds WHERE id = ?")
                        .bind(id)
                        .fetch_optional(pool)
                        .await
                        .map_err(|e| e.to_string())?
                        .flatten();
                match log_file {
                    Some(path) if std::path::Path::new(&path).exists() => {
                        std::fs::read_to_string(&path).map_err(|e| e.to_string())
                    }
                    _ => Ok(String::new()),
                }
            }
            _ => Ok(String::new()),
        }
    }
}
