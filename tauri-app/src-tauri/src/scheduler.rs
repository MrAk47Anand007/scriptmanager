use chrono::{DateTime, Utc};
use cron::Schedule;
use sqlx::{Row, SqlitePool};
use std::str::FromStr;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::execution::{run_script_core, ExecutionState, RunScriptPayload};

/// How often the scheduler looks for due schedules.
const TICK_SECONDS: u64 = 30;

/// Legacy cron expressions are 5-field (minute-granularity); the `cron`
/// crate expects a seconds field first, so it is prepended here.
pub fn next_run_after(cron_expr: &str, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let normalized = format!("0 {cron_expr}");
    Schedule::from_str(&normalized)
        .ok()?
        .after(&after)
        .next()
}

#[derive(Debug, serde::Serialize)]
pub struct ScheduleView {
    #[serde(rename = "schedule_cron")]
    pub schedule_cron: Option<String>,
    #[serde(rename = "schedule_enabled")]
    pub schedule_enabled: bool,
    #[serde(rename = "next_run_time")]
    pub next_run_time: Option<String>,
}

async fn schedule_view(pool: &SqlitePool, script_id: &str) -> Result<ScheduleView, String> {
    let row = sqlx::query(
        "SELECT schedule_cron, schedule_enabled, schedule_next_run_at FROM scripts WHERE id = ?",
    )
    .bind(script_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Script not found".to_string())?;

    Ok(ScheduleView {
        schedule_cron: row.try_get(0).map_err(|e| e.to_string())?,
        schedule_enabled: row.try_get::<i64, _>(1).map_err(|e| e.to_string())? != 0,
        next_run_time: row.try_get(2).map_err(|e| e.to_string())?,
    })
}

#[derive(Debug, serde::Deserialize)]
pub struct SaveSchedulePayload {
    #[serde(rename = "scriptId", alias = "script_id")]
    pub script_id: String,
    pub cron: String,
    pub enabled: bool,
}

#[tauri::command]
pub async fn read_schedule(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<ScheduleView, String> {
    schedule_view(&pool, &script_id).await
}

#[tauri::command]
pub async fn save_schedule(
    pool: State<'_, SqlitePool>,
    payload: SaveSchedulePayload,
) -> Result<ScheduleView, String> {
    let cron = payload.cron.trim();
    if payload.enabled && next_run_after(cron, Utc::now()).is_none() {
        return Err("Invalid cron expression".to_string());
    }

    let next_run = if payload.enabled {
        next_run_after(cron, Utc::now()).map(|dt| dt.to_rfc3339())
    } else {
        None
    };

    sqlx::query(
        "UPDATE scripts SET schedule_cron = ?, schedule_enabled = ?, schedule_next_run_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(if cron.is_empty() { None } else { Some(cron.to_string()) })
    .bind(payload.enabled)
    .bind(next_run)
    .bind(&payload.script_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    schedule_view(&pool, &payload.script_id).await
}

#[tauri::command]
pub async fn delete_schedule(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<ScheduleView, String> {
    sqlx::query(
        "UPDATE scripts SET schedule_cron = NULL, schedule_enabled = 0, schedule_next_run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&script_id)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    schedule_view(&pool, &script_id).await
}

/// Scheduler tick: run every enabled schedule whose next run time has passed.
/// Missed runs execute once at the next tick (run-once policy; recorded in
/// the migration completion plan, S4.1).
pub async fn tick(app_handle: &AppHandle, pool: &SqlitePool) -> Result<usize, String> {
    let now = Utc::now();
    let rows = sqlx::query(
        "SELECT id, schedule_cron FROM scripts
         WHERE schedule_enabled = 1 AND schedule_cron IS NOT NULL
           AND (schedule_next_run_at IS NULL OR schedule_next_run_at <= ?)",
    )
    .bind(now.to_rfc3339())
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut triggered = 0usize;
    for row in rows {
        let script_id: String = row.try_get(0).map_err(|e| e.to_string())?;
        let cron_expr: String = row.try_get(1).map_err(|e| e.to_string())?;

        // Advance next-run BEFORE executing so a long run cannot re-trigger.
        let next_run = next_run_after(&cron_expr, now).map(|dt| dt.to_rfc3339());
        sqlx::query("UPDATE scripts SET schedule_next_run_at = ? WHERE id = ?")
            .bind(&next_run)
            .bind(&script_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        let exec_state = app_handle.state::<ExecutionState>();
        let payload = RunScriptPayload {
            script_id: script_id.clone(),
            param_values: None,
            build_id: Some(Uuid::new_v4().to_string()),
            triggered_by: Some("schedule".to_string()),
        };
        if let Err(e) = run_script_core(pool.clone(), app_handle.clone(), &exec_state, payload).await {
            log::error!("Scheduled run for script {script_id} failed: {e}");
        }
        triggered += 1;
    }
    Ok(triggered)
}

pub fn spawn(app_handle: AppHandle, pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = tick(&app_handle, &pool).await {
                log::error!("Scheduler tick failed: {e}");
            }
            tokio::time::sleep(std::time::Duration::from_secs(TICK_SECONDS)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_five_field_cron_and_computes_next_run() {
        let after = Utc::now();
        let next = next_run_after("* * * * *", after).expect("every-minute cron");
        assert!(next > after);
    }

    #[test]
    fn rejects_invalid_cron() {
        assert!(next_run_after("not a cron", Utc::now()).is_none());
        assert!(next_run_after("99 99 99 99 99", Utc::now()).is_none());
    }

    #[test]
    fn supports_range_and_step_expressions() {
        let after = Utc::now();
        assert!(next_run_after("*/5 * * * *", after).is_some());
        assert!(next_run_after("0 9 * * 1-5", after).is_some());
    }
}
