//! Per-entity stability reports: success rate, latency percentiles, failure
//! streak, and a flake score over the last N runs of a script, workflow, or
//! API collection.

use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityReport {
    pub kind: String,
    pub entity_id: String,
    pub name: String,
    pub window_runs: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub success_rate: f64,
    pub p50_duration_ms: Option<i64>,
    pub p95_duration_ms: Option<i64>,
    pub current_failure_streak: usize,
    pub flake_score: f64,
    pub flaky: bool,
}

fn percentile(sorted: &[i64], pct: f64) -> Option<i64> {
    if sorted.is_empty() {
        return None;
    }
    let index = ((sorted.len() as f64 - 1.0) * pct).round() as usize;
    sorted.get(index).copied()
}

/// Flake score: status flips per recent run — 0.0 = perfectly stable, 1.0 =
/// alternating every run. Only meaningful with >= 4 runs.
fn compute_flake_score(statuses: &[bool]) -> f64 {
    if statuses.len() < 2 {
        return 0.0;
    }
    let flips = statuses.windows(2).filter(|pair| pair[0] != pair[1]).count();
    flips as f64 / (statuses.len() - 1) as f64
}

/// Compute a duration in ms from two timestamp strings (RFC3339 or
/// "%Y-%m-%d %H:%M:%S"), mirroring observability::compute_duration.
fn duration_between(started: &str, finished: &str) -> Option<i64> {
    let parse = |text: &str| {
        if let Ok(value) = chrono::DateTime::parse_from_rfc3339(text) {
            return Some(value.timestamp_millis());
        }
        chrono::NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M:%S")
            .ok()
            .map(|value| value.and_local_timezone(chrono::Utc).single().unwrap_or_else(|| chrono::Utc::now()).timestamp_millis())
    };
    let start = parse(started)?;
    let end = parse(finished)?;
    let delta = end - start;
    if delta < 0 {
        None
    } else {
        Some(delta)
    }
}

const REPORT_KINDS: [&str; 3] = ["script", "workflow", "api"];

/// Aggregate the last `window` runs of one entity into a stability + latency
/// report. Statuses are newest-first (desc) exactly as stored.
pub(crate) async fn entity_report_record(
    pool: &SqlitePool,
    kind: &str,
    entity_id: &str,
    window: i64,
) -> Result<EntityReport, String> {
    if !REPORT_KINDS.contains(&kind) {
        return Err(format!("Unknown report kind: {kind}"));
    }
    let window = window.clamp(5, 200);
    let (statuses, durations, name): (Vec<bool>, Vec<i64>, String) = match kind {
        "script" => {
            let name: Option<String> = sqlx::query_scalar("SELECT name FROM scripts WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?
                .flatten();
            let statuses = sqlx::query_as::<_, (bool,)>(
                "SELECT COALESCE(status = 'success', false) FROM builds
                 WHERE script_id = ? ORDER BY created_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|(ok,)| ok)
            .collect();
            let durations = sqlx::query(
                "SELECT started_at, finished_at FROM builds WHERE script_id = ? AND finished_at IS NOT NULL
                 ORDER BY created_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .iter()
            .filter_map(|row| {
                let started: String = row.try_get(0).ok()?;
                let finished: String = row.try_get(1).ok()?;
                duration_between(&started, &finished)
            })
            .collect();
            (statuses, durations, name.unwrap_or_else(|| entity_id.to_string()))
        }
        "workflow" => {
            let name: Option<String> = sqlx::query_scalar("SELECT name FROM workflows WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?
                .flatten();
            let statuses = sqlx::query_as::<_, (bool,)>(
                "SELECT COALESCE(status = 'succeeded', false) FROM workflow_runs
                 WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|(ok,)| ok)
            .collect();
            let durations = sqlx::query(
                "SELECT started_at, finished_at FROM workflow_runs WHERE workflow_id = ? AND started_at IS NOT NULL AND finished_at IS NOT NULL
                 ORDER BY created_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .iter()
            .filter_map(|row| {
                let started: Option<String> = row.try_get(0).ok()?;
                let finished: Option<String> = row.try_get(1).ok()?;
                duration_between(&started?, &finished?)
            })
            .collect();
            (statuses, durations, name.unwrap_or_else(|| entity_id.to_string()))
        }
        _ => {
            let name: Option<String> =
                sqlx::query_scalar("SELECT collection_name FROM api_collection_runs WHERE collection_id = ? LIMIT 1")
                    .bind(entity_id)
                    .fetch_optional(pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .flatten();
            let statuses = sqlx::query_as::<_, (bool,)>(
                "SELECT COALESCE(status = 'completed', false) FROM api_collection_runs
                 WHERE collection_id = ? ORDER BY started_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|(ok,)| ok)
            .collect();
            let durations = sqlx::query(
                "SELECT duration_ms FROM api_collection_runs WHERE collection_id = ? AND duration_ms > 0
                 ORDER BY started_at DESC LIMIT ?",
            )
            .bind(entity_id)
            .bind(window)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
            .iter()
            .filter_map(|row| row.try_get::<i64, _>(0).ok())
            .collect();
            (statuses, durations, name.unwrap_or_else(|| entity_id.to_string()))
        }
    };

    let succeeded = statuses.iter().filter(|ok| **ok).count();
    let failed = statuses.len() - succeeded;
    let success_rate = if statuses.is_empty() {
        0.0
    } else {
        succeeded as f64 / statuses.len() as f64 * 100.0
    };
    let current_failure_streak = statuses.iter().take_while(|ok| !**ok).count();
    let flake_score = compute_flake_score(&statuses);

    Ok(EntityReport {
        kind: kind.to_string(),
        entity_id: entity_id.to_string(),
        name,
        window_runs: statuses.len(),
        succeeded,
        failed,
        success_rate: (success_rate * 10.0).round() / 10.0,
        p50_duration_ms: percentile(&durations, 0.5),
        p95_duration_ms: percentile(&durations, 0.95),
        current_failure_streak,
        flake_score: (flake_score * 100.0).round() / 100.0,
        flaky: statuses.len() >= 4 && flake_score >= 0.5,
    })
}

#[tauri::command]
pub async fn get_entity_report(
    pool: State<'_, SqlitePool>,
    kind: String,
    entity_id: String,
    window: Option<i64>,
) -> Result<EntityReport, String> {
    entity_report_record(&pool, &kind, &entity_id, window.unwrap_or(30)).await
}

#[tauri::command]
pub async fn list_report_entities(
    pool: State<'_, SqlitePool>,
    kind: String,
) -> Result<Vec<Value>, String> {
    let sql = match kind.as_str() {
        "script" => "SELECT id, name FROM scripts ORDER BY name",
        "workflow" => "SELECT id, name FROM workflows ORDER BY name",
        "api" => "SELECT id, name FROM api_collections ORDER BY name",
        other => return Err(format!("Unknown report kind: {other}")),
    };
    let rows = sqlx::query(sql)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(json!({
            "id": row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
            "name": row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        }));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::test_pool;

    #[test]
    fn flake_score_matches_expectations() {
        assert_eq!(compute_flake_score(&[]), 0.0);
        assert_eq!(compute_flake_score(&[true]), 0.0);
        assert_eq!(compute_flake_score(&[true, true, true]), 0.0);
        assert_eq!(compute_flake_score(&[true, false, true, false]), 1.0);
        assert!((compute_flake_score(&[true, false, false, true]) - (2.0 / 3.0)).abs() < 1e-9);
    }

    #[tokio::test]
    async fn script_report_aggregates_stability_and_flakiness() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, language) VALUES ('s-r', 'Flaky script', 'f.py', 'python')")
            .execute(&pool)
            .await
            .unwrap();
        // Newest-first insertion pattern: alternate outcomes, 6 runs.
        let outcomes = ["failure", "success", "failure", "success", "success", "failure"];
        for (index, status) in outcomes.iter().enumerate() {
            sqlx::query(
                "INSERT INTO builds (id, script_id, status, started_at, finished_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(format!("b-{index}"))
            .bind("s-r")
            .bind(status)
            .bind(format!("2026-09-13 10:0{index}:00"))
            .bind(format!("2026-09-13 10:0{index}:30"))
            .execute(&pool)
            .await
            .unwrap();
        }
        let report = entity_report_record(&pool, "script", "s-r", 30).await.unwrap();
        assert_eq!(report.name, "Flaky script");
        assert_eq!(report.window_runs, 6);
        assert_eq!(report.succeeded, 3);
        assert_eq!(report.failed, 3);
        assert_eq!(report.success_rate, 50.0);
        // Newest-first statuses: [f, s, f, s, s, f] -> 4 flips / 5 = 0.8.
        assert_eq!(report.flake_score, 0.8);
        assert!(report.flaky);
        assert_eq!(report.current_failure_streak, 1);
        assert_eq!(report.p50_duration_ms, Some(30_000));
    }

    #[tokio::test]
    async fn report_handles_unknown_entity_and_kind() {
        let pool = test_pool().await;
        let missing = entity_report_record(&pool, "script", "ghost", 30).await.unwrap();
        assert_eq!(missing.window_runs, 0);
        assert_eq!(missing.flaky, false);
        assert!(entity_report_record(&pool, "nope", "x", 30).await.is_err());
    }
}
