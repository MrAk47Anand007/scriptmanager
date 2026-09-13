use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

/// Plugin support decision (recorded in the migration completion plan,
/// S9.2): manifest metadata management is migrated; the plugin **execution
/// host** stays disabled until capability/RBAC/secret boundaries are ported.

#[derive(Debug, Serialize)]
pub struct PluginView {
    pub id: String,
    pub name: String,
    pub version: String,
    pub enabled: bool,
    pub manifest: Value,
    pub created_at: String,
    pub updated_at: String,
}

pub async fn list_plugins_core(pool: &SqlitePool) -> Result<Vec<PluginView>, String> {
    let rows = sqlx::query(
        "SELECT id, name, version, enabled, manifest_json, created_at, updated_at FROM plugin_installations ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    rows.into_iter()
        .map(|row| {
            let manifest_raw: String = row.try_get(4).map_err(|e| e.to_string())?;
            Ok(PluginView {
                id: row.try_get(0).map_err(|e| e.to_string())?,
                name: row.try_get(1).map_err(|e| e.to_string())?,
                version: row.try_get(2).map_err(|e| e.to_string())?,
                enabled: row.try_get::<i64, _>(3).map_err(|e| e.to_string())? != 0,
                manifest: serde_json::from_str::<Value>(&manifest_raw).unwrap_or(Value::Null),
                created_at: row.try_get(5).map_err(|e| e.to_string())?,
                updated_at: row.try_get(6).map_err(|e| e.to_string())?,
            })
        })
        .collect()
}

#[tauri::command]
pub async fn list_plugins(pool: State<'_, SqlitePool>) -> Result<Vec<PluginView>, String> {
    list_plugins_core(&pool).await
}

/// Validates a plugin manifest: requires name (string), version (string),
/// and an optional permissions array. Invalid manifests are rejected.
pub fn parse_plugin_manifest(raw: &str) -> Result<(String, String, Value), String> {
    let manifest = serde_json::from_str::<Value>(raw)
        .map_err(|e| format!("Invalid plugin manifest JSON: {e}"))?;
    let name = manifest
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .ok_or_else(|| "Plugin manifest requires a non-empty 'name'".to_string())?
        .to_string();
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "Plugin manifest requires a 'version'".to_string())?
        .to_string();
    if let Some(Value::Array(perms)) = manifest.get("permissions") {
        for perm in perms {
            if perm.as_str().is_none() {
                return Err("Plugin manifest permissions must be strings".to_string());
            }
        }
    }
    Ok((name, version, manifest))
}

pub async fn save_plugin_core(
    pool: &SqlitePool,
    manifest_raw: &str,
) -> Result<PluginView, String> {
    let (name, version, manifest) = parse_plugin_manifest(manifest_raw)?;

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO plugin_installations (id, name, version, manifest_json) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&version)
        .bind(manifest.to_string())
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    list_plugins_core(pool)
        .await?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Plugin installation failed".to_string())
}

#[derive(Debug, Deserialize)]
pub struct SavePluginPayload {
    pub manifest: String,
}

#[tauri::command]
pub async fn save_plugin(
    pool: State<'_, SqlitePool>,
    payload: SavePluginPayload,
) -> Result<PluginView, String> {
    save_plugin_core(&pool, &payload.manifest).await
}

#[derive(Debug, Deserialize)]
pub struct UpdatePluginPayload {
    pub id: String,
    pub action: String,
    #[serde(default)]
    pub settings: Option<Value>,
}

const PLUGIN_ACTIONS: [&str; 2] = ["enable", "disable"];

pub async fn update_plugin_core(
    pool: &SqlitePool,
    payload: UpdatePluginPayload,
) -> Result<PluginView, String> {
    if !PLUGIN_ACTIONS.contains(&payload.action.as_str()) {
        return Err(format!("Unknown plugin action: {}", payload.action));
    }
    let enabled = payload.action == "enable";
    let result = sqlx::query(
        "UPDATE plugin_installations SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(enabled)
    .bind(&payload.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    if result.rows_affected() == 0 {
        return Err("Plugin not found".to_string());
    }

    list_plugins_core(pool)
        .await?
        .into_iter()
        .find(|p| p.id == payload.id)
        .ok_or_else(|| "Plugin not found".to_string())
}

#[tauri::command]
pub async fn update_plugin(
    pool: State<'_, SqlitePool>,
    payload: UpdatePluginPayload,
) -> Result<PluginView, String> {
    update_plugin_core(&pool, payload).await
}

pub async fn remove_plugin_core(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM plugin_installations WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn remove_plugin(pool: State<'_, SqlitePool>, id: String) -> Result<Value, String> {
    remove_plugin_core(&pool, &id).await?;
    Ok(serde_json::json!({ "ok": true, "id": id }))
}

// ---------- Sandbox execution host ----------

/// Permissions a plugin may request in its manifest. v1 grants only
/// `storage` (a plugin-scoped key/value store); `http` and `secrets` are
/// reserved names that are recognized but not yet wired to capabilities.
const PLUGIN_PERMISSIONS: [&str; 3] = ["storage", "http", "secrets"];

fn plugin_permissions(manifest: &Value) -> Vec<String> {
    manifest
        .get("permissions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter(|p| PLUGIN_PERMISSIONS.contains(p))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, serde::Deserialize)]
pub struct RunPluginPayload {
    #[serde(rename = "pluginId")]
    pub plugin_id: String,
    #[serde(default)]
    pub input: Option<Value>,
}

/// Execute a plugin's entry point in the boa sandbox. The plugin JS runs with
/// `input` and a `storage` bag (when the manifest grants `storage`); its
/// final value flows back as JSON via `__flush()` — the same pure-JS state
/// bridge as js_engine, so nothing escapes evaluation by accident. No fs,
/// process, network, or timers exist in the sandbox.
pub async fn run_plugin_core(
    pool: &SqlitePool,
    payload: RunPluginPayload,
) -> Result<Value, String> {
    let plugin_id = payload.plugin_id;
    let row: Option<(i64, String, String)> = sqlx::query_as(
        "SELECT p.enabled, p.manifest_json, COALESCE(s.entry_point, '')
         FROM plugin_installations p
         LEFT JOIN plugin_sources s ON s.plugin_id = p.id
         WHERE p.id = ?",
    )
    .bind(&plugin_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let Some((enabled_i, manifest_json, entry_point)) = row else {
        return Err(format!("Plugin not found: {plugin_id}"));
    };
    let enabled = enabled_i != 0;
    if !enabled {
        return Err("Plugin is disabled".to_string());
    }
    if entry_point.trim().is_empty() {
        return Err(
            "Plugin has no source — open it in Settings → Plugins and add its code".to_string(),
        );
    }
    let manifest: Value = serde_json::from_str(&manifest_json).unwrap_or(Value::Null);
    let _permissions = plugin_permissions(&manifest);
    let storage_granted = _permissions.contains(&"storage".to_string());

    // Seed storage reads with the plugin's persisted KV rows.
    let stored: std::collections::HashMap<String, String> = sqlx::query(
        "SELECT key, value FROM plugin_storage WHERE plugin_id = ?",
    )
    .bind(&plugin_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|row| -> Result<(String, String), String> {
        Ok((
            row.try_get::<String, _>(0).map_err(|e| e.to_string())?,
            row.try_get::<String, _>(1).map_err(|e| e.to_string())?,
        ))
    })
    .collect::<Result<Vec<_>, String>>()?
    .into_iter()
    .collect();
    let stored_json = serde_json::to_string(&stored).unwrap_or_else(|_| "{}".to_string());
    let input_json = serde_json::to_string(&payload.input.unwrap_or_else(|| json!({})))
        .unwrap_or_else(|_| "null".to_string());
    let storage_enabled_literal = if storage_granted { "true" } else { "false" };

    // The sandbox prelude: `__flush()` carries { result, storage, logs } out.
    let prelude = r#"
var __state = { storage: {}, logs: [], result: null, flushed: false, storageEnabled: false };
var storage = {
  get: function (k) { return __state.storage[String(k)]; },
  set: function (k, v) {
    if (!__state.storageEnabled) throw new Error("storage permission not granted in manifest");
    __state.storage[String(k)] = String(v);
  }
};
function log() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    try { parts.push(typeof a === "string" ? a : JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
  }
  __state.logs.push(parts.join(" "));
}
function setResult(value) { __state.result = value; }
function __flush() {
  return JSON.stringify({ result: __state.result, storage: __state.storage, logs: __state.logs });
}
"#;

    let source = format!(
        "{prelude}\n__state.storage = {stored_json};\n__state.storageEnabled = {storage_enabled_literal};\nvar input = {input_json};\n{entry_point}\n;__flush()"
    );

    let evaluated = tokio::task::spawn_blocking(move || {
        let mut context = boa_engine::Context::default();
        context
            .runtime_limits_mut()
            .set_loop_iteration_limit(2_000_000);
        let outcome = context.eval(boa_engine::Source::from_bytes(&source));
        match outcome {
            Ok(value) => {
                if let Some(text) = value.as_string() {
                    Ok(text.to_std_string_escaped())
                } else {
                    Ok(String::new())
                }
            }
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| format!("Plugin task failed: {error}"))??;

    if evaluated.trim().is_empty() {
        return Ok(json!({ "result": null, "logs": [] }));
    }
    let parsed: Value = serde_json::from_str(&evaluated)
        .unwrap_or_else(|_| json!({ "result": evaluated, "storage": {}, "logs": [] }));

    // Persist storage writes back to the plugin-scoped KV.
    if let Some(storage) = parsed.get("storage").and_then(Value::as_object) {
        for (key, value) in storage {
            let text = match value {
                Value::String(text) => text.clone(),
                other => other.to_string(),
            };
            sqlx::query(
                "INSERT INTO plugin_storage (plugin_id, key, value) VALUES (?, ?, ?)
                 ON CONFLICT(plugin_id, key) DO UPDATE SET value = excluded.value",
            )
            .bind(&plugin_id)
            .bind(key)
            .bind(&text)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(json!({
        "result": parsed.get("result").cloned().unwrap_or(Value::Null),
        "logs": parsed.get("logs").cloned().unwrap_or(Value::Array(Vec::new())),
    }))
}

#[tauri::command]
pub async fn run_plugin(
    pool: State<'_, SqlitePool>,
    payload: RunPluginPayload,
) -> Result<Value, String> {
    run_plugin_core(&pool, payload).await
}

// ---------- Plugin source management ----------

#[tauri::command]
pub async fn get_plugin_source(
    pool: State<'_, SqlitePool>,
    plugin_id: String,
) -> Result<String, String> {
    let source: Option<String> =
        sqlx::query_scalar("SELECT entry_point FROM plugin_sources WHERE plugin_id = ?")
            .bind(&plugin_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
    Ok(source.unwrap_or_default())
}

#[tauri::command]
pub async fn save_plugin_source(
    pool: State<'_, SqlitePool>,
    plugin_id: String,
    entry_point: String,
) -> Result<Value, String> {
    sqlx::query(
        "INSERT INTO plugin_sources (plugin_id, entry_point) VALUES (?, ?)
         ON CONFLICT(plugin_id) DO UPDATE SET entry_point = excluded.entry_point, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&plugin_id)
    .bind(&entry_point)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(json!({ "saved": true }))
}

#[cfg(test)]
mod sandbox_tests {
    use super::*;
    use crate::schema::test_pool;

    async fn install_plugin(pool: &SqlitePool, id: &str, permissions: &[&str], entry_point: &str) {
        sqlx::query("INSERT INTO plugin_installations (id, name, version, enabled, manifest_json) VALUES (?, ?, '1.0.0', 1, ?)")
            .bind(id)
            .bind(id)
            .bind(serde_json::json!({ "name": id, "version": "1.0.0", "permissions": permissions }).to_string())
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO plugin_sources (plugin_id, entry_point) VALUES (?, ?)")
            .bind(id)
            .bind(entry_point)
            .execute(pool)
            .await
            .unwrap();
    }

    async fn run(pool: &SqlitePool, id: &str, input: Value) -> Result<Value, String> {
        run_plugin_core(
            pool,
            RunPluginPayload { plugin_id: id.to_string(), input: Some(input) },
        )
        .await
    }

    #[tokio::test]
    async fn plugin_sets_result_and_logs() {
        let pool = test_pool().await;
        install_plugin(
            &pool,
            "simple",
            &[],
            "log('ran with', input.count); setResult({ doubled: input.count * 2 });",
        )
        .await;
        let output = run(&pool, "simple", serde_json::json!({ "count": 21 })).await.unwrap();
        assert_eq!(output["result"]["doubled"], serde_json::json!(42));
        assert_eq!(output["logs"][0], serde_json::json!("ran with 21"));
    }

    #[tokio::test]
    async fn storage_round_trips_when_granted() {
        let pool = test_pool().await;
        install_plugin(
            &pool,
            "storer",
            &["storage"],
            "if (storage.get('hits') === undefined) { storage.set('hits', 1); } else { storage.set('hits', Number(storage.get('hits')) + 1); } setResult(storage.get('hits'));",
        )
        .await;
        let first = run(&pool, "storer", serde_json::json!({})).await.unwrap();
        assert_eq!(first["result"], serde_json::json!("1"));
        let second = run(&pool, "storer", serde_json::json!({})).await.unwrap();
        assert_eq!(second["result"], serde_json::json!("2"));
    }

    #[tokio::test]
    async fn storage_without_permission_throws() {
        let pool = test_pool().await;
        install_plugin(
            &pool,
            "nostore",
            &[],
            "storage.set('k', 'v'); setResult('should not get here');",
        )
        .await;
        let output = run(&pool, "nostore", serde_json::json!({})).await;
        // Sandbox errors surface as a failed run (entry point threw).
        assert!(output.is_err() || output.unwrap()["result"].is_null());
    }

    #[tokio::test]
    async fn infinite_loop_is_bounded() {
        let pool = test_pool().await;
        install_plugin(&pool, "loopy", &[], "while (true) { }").await;
        let outcome = run(&pool, "loopy", serde_json::json!({})).await;
        // Either the loop limit errors the run or it completes with no result;
        // it must never hang.
        match outcome {
            Err(message) => assert!(message.contains("limit") || message.contains("timed out") || message.contains("failed")),
            Ok(value) => assert!(value["result"].is_null() || value["logs"].is_array()),
        }
    }

    #[tokio::test]
    async fn disabled_plugin_refuses_to_run() {
        let pool = test_pool().await;
        install_plugin(&pool, "off", &[], "setResult(1);").await;
        sqlx::query("UPDATE plugin_installations SET enabled = 0 WHERE id = 'off'")
            .execute(&pool)
            .await
            .unwrap();
        let outcome = run(&pool, "off", serde_json::json!({})).await;
        assert!(outcome.unwrap_err().contains("disabled"));
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

    #[test]
    fn manifest_parsing_rejects_invalid() {
        assert!(parse_plugin_manifest("not json").is_err());
        assert!(parse_plugin_manifest("{}").is_err());
        assert!(parse_plugin_manifest(r#"{"name": "p", "version": "1.0", "permissions": [1]}"#).is_err());
        let (name, version, _) = parse_plugin_manifest(r#"{"name": "p", "version": "1.0", "permissions": ["fs.read"]}"#).unwrap();
        assert_eq!(name, "p");
        assert_eq!(version, "1.0");
    }

    #[tokio::test]
    async fn plugin_lifecycle_enable_disable_remove() {
        let pool = test_pool().await;
        let installed = save_plugin_core(&pool, r#"{"name": "lint", "version": "2.1"}"#)
            .await
            .unwrap();
        assert_eq!(installed.enabled, true);
        assert_eq!(installed.version, "2.1");

        let disabled = update_plugin_core(
            &pool,
            UpdatePluginPayload { id: installed.id.clone(), action: "disable".into(), settings: None },
        )
        .await
        .unwrap();
        assert!(!disabled.enabled);

        assert!(update_plugin_core(
            &pool,
            UpdatePluginPayload { id: "missing".into(), action: "enable".into(), settings: None },
        )
        .await
        .is_err());

        remove_plugin_core(&pool, &installed.id).await.unwrap();
        assert!(list_plugins_core(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn plugin_without_source_refuses_to_run() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ensure_schema(&pool).await.unwrap();
        sqlx::query("INSERT INTO plugin_installations (id, name, version, enabled, manifest_json) VALUES ('x', 'x', '1.0.0', 1, '{}')")
            .execute(&pool)
            .await
            .unwrap();
        let outcome = run_plugin_core(
            &pool,
            RunPluginPayload { plugin_id: "x".into(), input: None },
        )
        .await;
        assert!(outcome.unwrap_err().contains("no source"));
    }
}
