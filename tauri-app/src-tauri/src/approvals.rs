use serde::Serialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct ApprovalDecisionView {
    pub id: String,
    pub decision: String,
    #[serde(rename = "decidedBy")]
    pub decided_by: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ApprovalView {
    pub id: String,
    pub status: String,
    #[serde(rename = "actorId")]
    pub actor_id: String,
    #[serde(rename = "actorName")]
    pub actor_name: Option<String>,
    pub operation: String,
    pub resource: String,
    pub risk: String,
    pub reason: String,
    #[serde(rename = "previewJson")]
    pub preview_json: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
    pub decisions: Vec<ApprovalDecisionView>,
}

fn row_to_view(row: &sqlx::sqlite::SqliteRow) -> Result<ApprovalView, String> {
    Ok(ApprovalView {
        id: row.try_get(0).map_err(|e| e.to_string())?,
        status: row.try_get(1).map_err(|e| e.to_string())?,
        actor_id: row.try_get(2).map_err(|e| e.to_string())?,
        actor_name: row.try_get(3).map_err(|e| e.to_string())?,
        operation: row.try_get(4).map_err(|e| e.to_string())?,
        resource: row.try_get(5).map_err(|e| e.to_string())?,
        risk: row.try_get(6).map_err(|e| e.to_string())?,
        reason: row.try_get(7).map_err(|e| e.to_string())?,
        preview_json: row.try_get(8).map_err(|e| e.to_string())?,
        expires_at: row.try_get::<Option<String>, _>(9).map_err(|e| e.to_string())?.unwrap_or_default(),
        decisions: Vec::new(),
    })
}

async fn load_requests(pool: &SqlitePool, status: Option<&str>) -> Result<Vec<ApprovalView>, String> {
    let rows = if let Some(status) = status.filter(|s| *s != "all") {
        sqlx::query("SELECT id, status, actor_id, actor_name, operation, resource, risk, reason, preview_json, expires_at FROM approval_requests WHERE status = ? ORDER BY created_at DESC")
            .bind(status)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, status, actor_id, actor_name, operation, resource, risk, reason, preview_json, expires_at FROM approval_requests ORDER BY created_at DESC")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    let mut views: Vec<ApprovalView> = rows
        .iter()
        .map(row_to_view)
        .collect::<Result<_, _>>()?;
    let ids: Vec<String> = views.iter().map(|v| v.id.clone()).collect();
    for view in &mut views {
        let decision_rows = sqlx::query(
            "SELECT id, decision, decided_by, created_at FROM approval_decisions WHERE request_id = ? ORDER BY created_at",
        )
        .bind(&view.id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        view.decisions = decision_rows
            .into_iter()
            .map(|row| {
                Ok::<ApprovalDecisionView, String>(ApprovalDecisionView {
                    id: row.try_get(0).map_err(|e| e.to_string())?,
                    decision: row.try_get(1).map_err(|e| e.to_string())?,
                    decided_by: row.try_get(2).map_err(|e| e.to_string())?,
                    created_at: row.try_get(3).map_err(|e| e.to_string())?,
                })
            })
            .collect::<Result<_, _>>()?;
    }
    Ok(views)
}

#[tauri::command]
pub async fn list_approvals(
    pool: State<'_, SqlitePool>,
    status: Option<String>,
) -> Result<Vec<ApprovalView>, String> {
    load_requests(&pool, status.as_deref()).await
}

#[derive(Debug, serde::Deserialize)]
pub struct DecideApprovalPayload {
    pub id: String,
    pub decision: String,
    pub note: Option<String>,
}

const VALID_DECISIONS: [&str; 4] = ["allow_once", "allow_run", "allow_workspace", "reject"];

pub async fn decide_approval_core(
    pool: &SqlitePool,
    payload: DecideApprovalPayload,
) -> Result<ApprovalView, String> {
    if !VALID_DECISIONS.contains(&payload.decision.as_str()) {
        return Err(format!("Unknown decision: {}", payload.decision));
    }

    let request = sqlx::query("SELECT id, status FROM approval_requests WHERE id = ?")
        .bind(&payload.id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Approval request not found".to_string())?;
    let status: String = request.try_get(1).map_err(|e| e.to_string())?;
    if status != "pending" {
        // Decisions are immutable: a decided request can never be decided again.
        return Err("Approval request has already been decided".to_string());
    }

    sqlx::query(
        "INSERT INTO approval_decisions (id, request_id, decision, note) VALUES (?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&payload.id)
    .bind(&payload.decision)
    .bind(payload.note.as_deref().unwrap_or(""))
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let new_status = if payload.decision == "reject" { "rejected" } else { "approved" };
    sqlx::query("UPDATE approval_requests SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(new_status)
        .bind(&payload.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    load_requests(pool, Some("all"))
        .await?
        .into_iter()
        .find(|v| v.id == payload.id)
        .ok_or_else(|| "Approval request not found".to_string())
}

#[tauri::command]
pub async fn decide_approval(
    pool: State<'_, SqlitePool>,
    payload: DecideApprovalPayload,
) -> Result<ApprovalView, String> {
    decide_approval_core(&pool, payload).await
}

/// Local convenience: enqueue an approval request (used by execution paths
/// and future remote-execution approval flows).
pub async fn create_request(
    pool: &SqlitePool,
    operation: &str,
    resource: &str,
    risk: &str,
    reason: &str,
    preview: Value,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO approval_requests (id, operation, resource, risk, reason, preview_json, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(operation)
    .bind(resource)
    .bind(risk)
    .bind(reason)
    .bind(preview.to_string())
    .bind((chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(id)
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
    async fn pending_approval_can_be_allowed_once_then_is_immutable() {
        let pool = test_pool().await;
        let id = create_request(&pool, "script.run", "script-1", "medium", "manual approval", serde_json::json!({"cmd": "run"})).await.unwrap();

        let view = decide_approval_core(
            &pool,
            DecideApprovalPayload { id: id.clone(), decision: "allow_once".into(), note: Some("ok".into()) },
        )
        .await
        .unwrap();
        assert_eq!(view.status, "approved");
        assert_eq!(view.decisions.len(), 1);
        assert_eq!(view.decisions[0].decision, "allow_once");

        // Second decision attempt must fail (immutable after decision).
        assert!(decide_approval_core(
            &pool,
            DecideApprovalPayload { id, decision: "reject".into(), note: None },
        )
        .await
        .is_err());
    }

    #[tokio::test]
    async fn reject_sets_status_and_unknown_decision_rejected() {
        let pool = test_pool().await;
        let id = create_request(&pool, "ops.remote", "profile-1", "high", "remote exec", serde_json::json!({})).await.unwrap();
        let view = decide_approval_core(&pool, DecideApprovalPayload { id, decision: "reject".into(), note: None })
            .await
            .unwrap();
        assert_eq!(view.status, "rejected");

        assert!(decide_approval_core(&pool, DecideApprovalPayload { id: "x".into(), decision: "nope".into(), note: None })
            .await
            .is_err());
    }
}
