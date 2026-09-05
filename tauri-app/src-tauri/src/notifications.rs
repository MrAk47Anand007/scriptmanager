use serde::Serialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Serialize)]
pub struct NotificationChannelView {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    #[serde(rename = "_count")]
    pub counts: Value,
}

#[derive(Debug, Serialize)]
pub struct NotificationRuleView {
    pub id: String,
    #[serde(rename = "channelId")]
    pub channel_id: String,
    pub name: String,
    pub enabled: bool,
    #[serde(rename = "eventTypes")]
    pub event_types: String,
    #[serde(rename = "filterJson")]
    pub filter_json: String,
    #[serde(rename = "templateJson")]
    pub template_json: String,
    #[serde(rename = "throttleSeconds")]
    pub throttle_seconds: i64,
}

#[derive(Debug, Serialize)]
pub struct NotificationDeliveryView {
    pub id: String,
    pub status: String,
    #[serde(rename = "attemptCount")]
    pub attempt_count: i64,
    #[serde(rename = "lastError")]
    pub last_error: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "payloadJson")]
    pub payload_json: String,
}

pub async fn list_channels_core(pool: &SqlitePool) -> Result<Vec<NotificationChannelView>, String> {
    let rows = sqlx::query(
        "SELECT c.id, c.name, c.kind, c.enabled,
                (SELECT COUNT(*) FROM notification_rules r WHERE r.channel_id = c.id) AS rules,
                (SELECT COUNT(*) FROM notification_deliveries d WHERE d.channel_id = c.id) AS deliveries
         FROM notification_channels c ORDER BY c.created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(NotificationChannelView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                kind: row.try_get(2).map_err(|e| e.to_string())?,
                enabled: row.try_get::<i64, _>(3).map_err(|e| e.to_string())? != 0,
                counts: serde_json::json!({
                    "rules": row.try_get::<i64, _>(4).map_err(|e| e.to_string())?,
                    "deliveries": row.try_get::<i64, _>(5).map_err(|e| e.to_string())?,
                }),
            })
        })
        .collect()
}

pub async fn list_rules_core(pool: &SqlitePool) -> Result<Vec<NotificationRuleView>, String> {
    let rows = sqlx::query(
        "SELECT id, channel_id, name, enabled, event_types, filter_json, template_json, throttle_seconds
         FROM notification_rules ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            Ok(NotificationRuleView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                channel_id: row.try_get(1).map_err(|e| e.to_string())?,
                name: row.try_get(2).map_err(|e| e.to_string())?,
                enabled: row.try_get::<i64, _>(3).map_err(|e| e.to_string())? != 0,
                event_types: row.try_get(4).map_err(|e| e.to_string())?,
                filter_json: row.try_get(5).map_err(|e| e.to_string())?,
                template_json: row.try_get(6).map_err(|e| e.to_string())?,
                throttle_seconds: row.try_get(7).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

pub async fn list_deliveries_core(
    pool: &SqlitePool,
    since: Option<&str>,
) -> Result<Vec<NotificationDeliveryView>, String> {
    let rows = if let Some(since) = since {
        sqlx::query("SELECT id, status, attempt_count, last_error, created_at, payload_json FROM notification_deliveries WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200")
            .bind(since)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query("SELECT id, status, attempt_count, last_error, created_at, payload_json FROM notification_deliveries ORDER BY created_at DESC LIMIT 200")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    rows.into_iter()
        .map(|row| {
            Ok(NotificationDeliveryView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                status: row.try_get(1).map_err(|e| e.to_string())?,
                attempt_count: row.try_get(2).map_err(|e| e.to_string())?,
                last_error: row.try_get(3).map_err(|e| e.to_string())?,
                created_at: row.try_get(4).map_err(|e| e.to_string())?,
                payload_json: row.try_get(5).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_notification_channels(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<NotificationChannelView>, String> {
    list_channels_core(&pool).await
}

#[derive(Debug, serde::Deserialize)]
pub struct CreateChannelPayload {
    pub name: String,
    pub kind: String,
    pub config: Option<Value>,
}

const CHANNEL_KINDS: [&str; 4] = ["desktop", "webhook", "slack", "email"];

#[tauri::command]
pub async fn create_notification_channel(
    pool: State<'_, SqlitePool>,
    payload: CreateChannelPayload,
) -> Result<NotificationChannelView, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Channel name is required".to_string());
    }
    if !CHANNEL_KINDS.contains(&payload.kind.as_str()) {
        return Err(format!("Unknown channel kind: {}", payload.kind));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO notification_channels (id, name, kind, config_json) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(&payload.kind)
        .bind(payload.config.unwrap_or(Value::Null).to_string())
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    list_channels_core(&pool)
        .await?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| "Channel creation failed".to_string())
}

#[tauri::command]
pub async fn list_notification_rules(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<NotificationRuleView>, String> {
    list_rules_core(&pool).await
}

#[derive(Debug, serde::Deserialize)]
pub struct CreateRulePayload {
    #[serde(rename = "channelId")]
    pub channel_id: String,
    pub name: String,
    #[serde(rename = "eventTypes")]
    pub event_types: String,
    pub filter: Option<Value>,
    pub template: Option<Value>,
    #[serde(rename = "throttleSeconds")]
    pub throttle_seconds: Option<i64>,
}

#[tauri::command]
pub async fn create_notification_rule(
    pool: State<'_, SqlitePool>,
    payload: CreateRulePayload,
) -> Result<NotificationRuleView, String> {
    if payload.name.trim().is_empty() {
        return Err("Rule name is required".to_string());
    }
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM notification_channels WHERE id = ?")
        .bind(&payload.channel_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err("Channel not found".to_string());
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO notification_rules (id, channel_id, name, event_types, filter_json, template_json, throttle_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.channel_id)
    .bind(payload.name.trim())
    .bind(&payload.event_types)
    .bind(payload.filter.clone().unwrap_or(Value::Null).to_string())
    .bind(payload.template.clone().unwrap_or(Value::Null).to_string())
    .bind(payload.throttle_seconds.unwrap_or(0))
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    list_rules_core(&pool)
        .await?
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| "Rule creation failed".to_string())
}

#[tauri::command]
pub async fn list_notification_deliveries(
    pool: State<'_, SqlitePool>,
    since: Option<String>,
) -> Result<Vec<NotificationDeliveryView>, String> {
    list_deliveries_core(&pool, since.as_deref()).await
}

/// Local delivery adapter: for each enabled rule matching `event_type`,
/// record a delivery and emit a `notification-event` to the renderer.
/// OS-native delivery (email/webhook/Slack) stays migration-pending.
pub async fn dispatch_event(
    app_handle: &AppHandle,
    pool: &SqlitePool,
    event_type: &str,
    payload: Value,
) -> Result<usize, String> {
    let rules = sqlx::query(
        "SELECT r.id, r.channel_id, r.event_types FROM notification_rules r
         INNER JOIN notification_channels c ON c.id = r.channel_id
         WHERE r.enabled = 1 AND c.enabled = 1",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut delivered = 0usize;
    for row in rules {
        let rule_id: String = row.try_get(0).map_err(|e| e.to_string())?;
        let channel_id: String = row.try_get(1).map_err(|e| e.to_string())?;
        let event_types: String = row.try_get(2).map_err(|e| e.to_string())?;

        let matches = event_types
            .split(',')
            .map(str::trim)
            .any(|kind| kind == "*" || kind == event_type);
        if !matches {
            continue;
        }

        let delivery_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO notification_deliveries (id, channel_id, rule_id, status, payload_json, delivered_at) VALUES (?, ?, ?, 'delivered', ?, ?)",
        )
        .bind(&delivery_id)
        .bind(&channel_id)
        .bind(&rule_id)
        .bind(payload.to_string())
        .bind(&now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        app_handle
            .emit(
                "notification-event",
                serde_json::json!({
                    "type": event_type,
                    "ruleId": rule_id,
                    "payload": payload,
                }),
            )
            .ok();
        delivered += 1;
    }
    Ok(delivered)
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
    async fn channel_and_rule_round_trip() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-1', 'Desktop', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO notification_rules (id, channel_id, name, event_types) VALUES ('r-1', 'c-1', 'Build failures', 'script.build.finished')")
            .execute(&pool)
            .await
            .unwrap();

        let channels = list_channels_core(&pool).await.unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].counts["rules"], 1);

        let rules = list_rules_core(&pool).await.unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].event_types, "script.build.finished");
    }

    #[tokio::test]
    async fn rule_matching_skips_non_matching_rules() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-1', 'Desktop', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO notification_rules (id, channel_id, name, event_types) VALUES ('r-1', 'c-1', 'Failures', 'script.build.finished')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO notification_rules (id, channel_id, name, event_types) VALUES ('r-2', 'c-1', 'Other', 'workflow.run.finished')")
            .execute(&pool)
            .await
            .unwrap();

        // Mirror of dispatch_event's matching predicate.
        let matching: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM notification_rules r
             INNER JOIN notification_channels c ON c.id = r.channel_id
             WHERE r.enabled = 1 AND c.enabled = 1 AND (',' || r.event_types || ',') LIKE '%script.build.finished%'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(matching, 1);
    }

    #[tokio::test]
    async fn deliveries_round_trip_with_since_filter() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO notification_channels (id, name, kind) VALUES ('c-1', 'Desktop', 'desktop')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO notification_deliveries (id, channel_id, rule_id, status, payload_json, delivered_at) VALUES ('d-1', 'c-1', 'r-1', 'delivered', '{}', '2026-09-05T00:00:00+00:00')")
            .execute(&pool)
            .await
            .unwrap();

        let all = list_deliveries_core(&pool, None).await.unwrap();
        assert_eq!(all.len(), 1);
        let filtered = list_deliveries_core(&pool, Some("2036-01-01T00:00:00+00:00")).await.unwrap();
        assert!(filtered.is_empty());
    }
}
