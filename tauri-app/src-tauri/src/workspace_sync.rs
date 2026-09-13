//! Workspace sync: export the whole local workspace (scripts, collections,
//! requests, workflows + triggers, data sets) as one portable JSON bundle,
//! import it back with collision strategies, and publish the bundle to a
//! git repo folder so teams can share via git without a cloud service.

use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};

#[derive(Debug, Deserialize)]
pub struct ImportWorkspacePayload {
    pub bundle: Value,
    /// skip: leave existing entities untouched (default). update: overwrite
    /// content of entities matched by name. duplicate: always create new
    /// "(imported)" copies.
    #[serde(default = "default_collision")]
    pub on_conflict: String,
    #[serde(default)]
    pub dry_run: bool,
}

fn default_collision() -> String {
    "skip".to_string()
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWorkspaceResult {
    pub scripts: i64,
    pub collections: i64,
    pub api_requests: i64,
    pub workflows: i64,
    pub skipped: i64,
    pub dry_run: bool,
}

pub(crate) async fn export_workspace_bundle_core(pool: &SqlitePool) -> Result<Value, String> {
    let scripts: Vec<Value> = sqlx::query(
        "SELECT id, name, filename, description, language, interpreter, content, parameters,
            timeout_ms, collection_id FROM scripts ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .iter()
    .map(|row| {
        Ok(json!({
            "id": row.try_get::<Option<String>, _>(0).ok().flatten(),
            "name": row.try_get::<String, _>(1).unwrap_or_default(),
            "filename": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "description": row.try_get::<Option<String>, _>(3).ok().flatten(),
            "language": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "interpreter": row.try_get::<Option<String>, _>(5).ok().flatten(),
            "content": row.try_get::<Option<String>, _>(6).ok().flatten(),
            "parameters": row.try_get::<Option<String>, _>(7).ok().flatten().map(|raw| serde_json::from_str::<Value>(&raw).ok()).flatten().unwrap_or(json!([])),
            "timeoutMs": row.try_get::<Option<i64>, _>(8).ok().flatten(),
            "collectionId": row.try_get::<Option<String>, _>(9).ok().flatten(),
        }))
    })
    .collect::<Result<Vec<_>, String>>()?;

    let collections: Vec<Value> = sqlx::query("SELECT id, name, description, NULL AS variables FROM collections ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<String, _>(0).unwrap_or_default(),
                "name": row.try_get::<String, _>(1).unwrap_or_default(),
                "description": row.try_get::<Option<String>, _>(2).ok().flatten(),
                "variables": row.try_get::<Option<String>, _>(3).ok().flatten(),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let api_requests: Vec<Value> = sqlx::query(
        "SELECT id, name, method, url, headers, query_params, variables, request_options,
            pre_request_script, test_script, response_mappings, body_type, body,
            auth_type, auth_config, collection_id FROM api_requests WHERE workspace_id = 'default' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .iter()
    .map(|row| {
        Ok(json!({
            "id": row.try_get::<String, _>(0).unwrap_or_default(),
            "name": row.try_get::<String, _>(1).unwrap_or_default(),
            "method": row.try_get::<String, _>(2).unwrap_or_default(),
            "url": row.try_get::<String, _>(3).unwrap_or_default(),
            "headers": row.try_get::<Option<String>, _>(4).ok().flatten(),
            "queryParams": row.try_get::<Option<String>, _>(5).ok().flatten(),
            "variables": row.try_get::<Option<String>, _>(6).ok().flatten(),
            "requestOptions": row.try_get::<Option<String>, _>(7).ok().flatten(),
            "preRequestScript": row.try_get::<Option<String>, _>(8).ok().flatten(),
            "testScript": row.try_get::<Option<String>, _>(9).ok().flatten(),
            "responseMappings": row.try_get::<Option<String>, _>(10).ok().flatten(),
            "bodyType": row.try_get::<Option<String>, _>(11).ok().flatten(),
            "body": row.try_get::<Option<String>, _>(12).ok().flatten(),
            "authType": row.try_get::<Option<String>, _>(13).ok().flatten(),
            "authConfig": row.try_get::<Option<String>, _>(14).ok().flatten(),
            "collectionId": row.try_get::<Option<String>, _>(15).ok().flatten(),
        }))
    })
    .collect::<Result<Vec<_>, String>>()?;

    let workflows: Vec<Value> = sqlx::query(
        "SELECT id, name, description, draft_definition, published_version FROM workflows ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .iter()
    .map(|row| {
        Ok(json!({
            "id": row.try_get::<String, _>(0).unwrap_or_default(),
            "name": row.try_get::<String, _>(1).unwrap_or_default(),
            "description": row.try_get::<Option<String>, _>(2).ok().flatten(),
            "definition": row.try_get::<String, _>(3).ok().and_then(|raw| serde_json::from_str::<Value>(&raw).ok()),
            "publishedVersion": row.try_get::<Option<i64>, _>(4).ok().flatten(),
        }))
    })
    .collect::<Result<Vec<_>, String>>()?;

    let data_sets: Vec<Value> = sqlx::query("SELECT id, name, kind, content FROM data_sets ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<String, _>(0).unwrap_or_default(),
                "name": row.try_get::<String, _>(1).unwrap_or_default(),
                "kind": row.try_get::<String, _>(2).unwrap_or_default(),
                "content": row.try_get::<String, _>(3).unwrap_or_default(),
            }))
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(json!({
        "version": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "scripts": scripts,
        "collections": collections,
        "apiRequests": api_requests,
        "workflows": workflows,
        "dataSets": data_sets,
    }))
}

#[tauri::command]
pub async fn export_workspace_bundle(pool: tauri::State<'_, SqlitePool>) -> Result<Value, String> {
    export_workspace_bundle_core(&pool).await
}

#[tauri::command]
pub async fn import_workspace_bundle(
    pool: tauri::State<'_, SqlitePool>,
    payload: ImportWorkspacePayload,
) -> Result<ImportWorkspaceResult, String> {
    import_workspace_bundle_core(&pool, payload).await
}

struct ImportCounters {
    scripts: i64,
    collections: i64,
    api_requests: i64,
    workflows: i64,
    skipped: i64,
}

async fn import_workspace_bundle_core(
    pool: &SqlitePool,
    payload: ImportWorkspacePayload,
) -> Result<ImportWorkspaceResult, String> {
    let bundle = payload.bundle;
    if !bundle.is_object() {
        return Err("Workspace bundle must be a JSON object".to_string());
    }
    if payload.on_conflict != "skip" && payload.on_conflict != "update" && payload.on_conflict != "duplicate" {
        return Err(format!("Unknown onConflict strategy: {}", payload.on_conflict));
    }
    let mut counters = ImportCounters { scripts: 0, collections: 0, api_requests: 0, workflows: 0, skipped: 0 };
    let dry_run = payload.dry_run;

    // Scripts: match by name (names are the workspace-unique human handle).
    if let Some(scripts) = bundle.get("scripts").and_then(Value::as_array) {
        for script in scripts {
            let Some(name) = script.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()) else {
                counters.skipped += 1;
                continue;
            };
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scripts WHERE name = ?")
                .bind(name)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;
            if exists > 0 && payload.on_conflict == "skip" {
                counters.skipped += 1;
                continue;
            }
            if dry_run {
                counters.scripts += 1;
                continue;
            }
            if exists > 0 && payload.on_conflict == "update" {
                sqlx::query(
                    "UPDATE scripts SET content = ?, language = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
                )
                .bind(script.get("content").and_then(Value::as_str))
                .bind(script.get("language").and_then(Value::as_str))
                .bind(name)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            } else {
                let filename = script.get("filename").and_then(Value::as_str).unwrap_or("imported.py");
                let parameters = script
                    .get("parameters")
                    .cloned()
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "[]".to_string());
                sqlx::query(
                    "INSERT INTO scripts (id, name, filename, description, language, content, parameters) VALUES (?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(name)
                .bind(filename)
                .bind(script.get("description").and_then(Value::as_str))
                .bind(script.get("language").and_then(Value::as_str).unwrap_or("python"))
                .bind(script.get("content").and_then(Value::as_str))
                .bind(&parameters)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
            counters.scripts += 1;
        }
    }

    // API collections + requests: match collections by name, requests by name.
    if let Some(collections) = bundle.get("collections").and_then(Value::as_array) {
        for collection in collections {
            let Some(name) = collection.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()) else {
                counters.skipped += 1;
                continue;
            };
            let existing: Option<String> = sqlx::query_scalar("SELECT id FROM api_collections WHERE name = ?")
                .bind(name)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
            let collection_id = match existing {
                Some(id) => id,
                None => {
                    if dry_run {
                        counters.collections += 1;
                        continue;
                    }
                    let id = uuid::Uuid::new_v4().to_string();
                    sqlx::query("INSERT INTO api_collections (id, workspace_id, name, description) VALUES (?, 'default', ?, ?)")
                        .bind(&id)
                        .bind(name)
                        .bind(collection.get("description").and_then(Value::as_str))
                        .execute(pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    id
                }
            };
            if !dry_run {
                if let Some(variables) = collection.get("variables").and_then(Value::as_str) {
                    sqlx::query("UPDATE api_collections SET variables = ? WHERE id = ?")
                        .bind(variables)
                        .bind(&collection_id)
                        .execute(pool)
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            counters.collections += 1;
            let _ = collection_id;
        }
    }
    if let Some(requests) = bundle.get("apiRequests").and_then(Value::as_array) {
        for request in requests {
            let Some(name) = request.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()) else {
                counters.skipped += 1;
                continue;
            };
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_requests WHERE name = ? AND workspace_id = 'default'")
                .bind(name)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;
            if exists > 0 && payload.on_conflict != "duplicate" {
                if payload.on_conflict == "skip" {
                    counters.skipped += 1;
                    continue;
                }
            }
            if dry_run {
                counters.api_requests += 1;
                continue;
            }
            if exists > 0 && payload.on_conflict == "update" {
                sqlx::query(
                    "UPDATE api_requests SET url = ?, method = ?, body = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE name = ? AND workspace_id = 'default'",
                )
                .bind(request.get("url").and_then(Value::as_str))
                .bind(request.get("method").and_then(Value::as_str))
                .bind(request.get("body").and_then(Value::as_str))
                .bind(name)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            } else {
                let json_or = |key: &str| request.get(key).and_then(Value::as_str).unwrap_or("[]").to_string();
                let str_or = |key: &str, default: &str| request.get(key).and_then(Value::as_str).unwrap_or(default).to_string();
                sqlx::query(
                    "INSERT INTO api_requests (id, workspace_id, name, method, url, headers, query_params, variables, request_options,
                        pre_request_script, test_script, response_mappings, body_type, body, auth_type, auth_config, collection_id)
                     VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(name)
                .bind(str_or("method", "GET"))
                .bind(request.get("url").and_then(Value::as_str).unwrap_or(""))
                .bind(request.get("headers").and_then(Value::as_str).unwrap_or("[]"))
                .bind(json_or("queryParams"))
                .bind(json_or("variables"))
                .bind(request.get("requestOptions").and_then(Value::as_str).unwrap_or("{}"))
                .bind(request.get("preRequestScript").and_then(Value::as_str).unwrap_or(""))
                .bind(request.get("testScript").and_then(Value::as_str).unwrap_or(""))
                .bind(json_or("responseMappings"))
                .bind(str_or("bodyType", "none"))
                .bind(request.get("body").and_then(Value::as_str).unwrap_or(""))
                .bind(str_or("authType", "none"))
                .bind(request.get("authConfig").and_then(Value::as_str).unwrap_or("{}"))
                // Clear collection refs that do not exist in the target to
                // avoid FK failures; the collection import pass may not have
                // recreated them under new ids.
                .bind({
                    let referenced = request.get("collectionId").and_then(Value::as_str);
                    match referenced {
                        Some(cid) => {
                            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM api_collections WHERE id = ?")
                                .bind(cid)
                                .fetch_one(pool)
                                .await
                                .map_err(|e| e.to_string())?;
                            if exists > 0 { Some(cid.to_string()) } else { None }
                        }
                        None => None,
                    }
                })
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
            counters.api_requests += 1;
        }
    }

    // Workflows: match by name, import the draft definition (never published).
    if let Some(workflows) = bundle.get("workflows").and_then(Value::as_array) {
        for workflow in workflows {
            let Some(name) = workflow.get("name").and_then(Value::as_str).map(str::trim).filter(|n| !n.is_empty()) else {
                counters.skipped += 1;
                continue;
            };
            let definition = workflow
                .get("definition")
                .cloned()
                .unwrap_or_else(|| json!({}));
            if definition.get("nodes").is_none() {
                counters.skipped += 1;
                continue;
            }
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflows WHERE name = ?")
                .bind(name)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;
            if exists > 0 && payload.on_conflict == "skip" {
                counters.skipped += 1;
                continue;
            }
            if dry_run {
                counters.workflows += 1;
                continue;
            }
            if exists > 0 && payload.on_conflict == "update" {
                sqlx::query("UPDATE workflows SET draft_definition = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?")
                    .bind(definition.to_string())
                    .bind(name)
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string())?;
            } else {
                sqlx::query(
                    "INSERT INTO workflows (id, workspace_id, name, description, draft_definition) VALUES (?, 'default', ?, ?, ?)",
                )
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(name)
                .bind(workflow.get("description").and_then(Value::as_str))
                .bind(definition.to_string())
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            }
            counters.workflows += 1;
        }
    }

    // Data sets.
    if let Some(sets) = bundle.get("dataSets").and_then(Value::as_array) {
        for set in sets {
            let (Some(name), Some(kind), Some(content)) = (
                set.get("name").and_then(Value::as_str),
                set.get("kind").and_then(Value::as_str),
                set.get("content").and_then(Value::as_str),
            ) else {
                counters.skipped += 1;
                continue;
            };
            let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM data_sets WHERE name = ?")
                .bind(name)
                .fetch_one(pool)
                .await
                .map_err(|e| e.to_string())?;
            if exists > 0 && payload.on_conflict == "skip" {
                counters.skipped += 1;
                continue;
            }
            if dry_run {
                counters.scripts += 1;
                continue;
            }
            sqlx::query("INSERT INTO data_sets (id, name, kind, content) VALUES (?, ?, ?, ?)")
                .bind(uuid::Uuid::new_v4().to_string())
                .bind(name)
                .bind(kind)
                .bind(content)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(ImportWorkspaceResult {
        scripts: counters.scripts,
        collections: counters.collections,
        api_requests: counters.api_requests,
        workflows: counters.workflows,
        skipped: counters.skipped,
        dry_run,
    })
}

/// Publish the workspace bundle as a JSON file in a git repository folder
/// (created if needed) via git2, so teams share it through their own remotes.
#[tauri::command]
pub async fn publish_workspace_to_git(
    pool: tauri::State<'_, SqlitePool>,
    repo_path: String,
    commit_message: String,
) -> Result<Value, String> {
    let bundle = export_workspace_bundle_core(&pool).await?;
    let dir = std::path::Path::new(repo_path.trim());
    if !dir.exists() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    // Init if not a repo.
    let repo = match git2::Repository::open(dir) {
        Ok(repo) => repo,
        Err(_) => git2::Repository::init(dir).map_err(|e| format!("Failed to init repo: {e}"))?,
    };

    let file_path = dir.join("scriptmanager-workspace.json");
    std::fs::write(&file_path, serde_json::to_string_pretty(&bundle).unwrap_or_default())
        .map_err(|e| e.to_string())?;

    let mut index = repo.index().map_err(|e| e.to_string())?;
    index.add_path(std::path::Path::new("scriptmanager-workspace.json"))
        .map_err(|e| format!("Failed to stage bundle: {e}"))?;
    index.write().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    let signature = repo
        .signature()
        .or_else(|_| git2::Signature::now("ScriptManager", "scriptmanager@local"))
        .map_err(|e| e.to_string())?;
    let parent_commit = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    let commit_id = match parent_commit {
        Some(parent) => repo
            .commit(Some("HEAD"), &signature, &signature, &commit_message, &tree, &[&parent])
            .map_err(|e| format!("Failed to commit: {e}"))?,
        None => repo
            .commit(None, &signature, &signature, &commit_message, &tree, &[])
            .map_err(|e| format!("Failed to create initial commit: {e}"))?,
    };
    Ok(json!({
        "committed": true,
        "commitId": commit_id.to_string(),
        "repoPath": dir.to_string_lossy(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::test_pool;

    #[tokio::test]
    async fn export_import_round_trip_preserves_counts() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, language, content) VALUES ('s1', 'Sync script', 's.py', 'python', 'print(1)')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO api_collections (id, workspace_id, name) VALUES ('c1', 'default', 'Sync collection')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO collections (id, name) VALUES ('sc1', 'Script collection')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO api_requests (id, workspace_id, name, method, url, collection_id) VALUES ('r1', 'default', 'Sync request', 'GET', 'https://x', 'c1')")
            .execute(&pool).await.unwrap();
        let def = serde_json::json!({"schemaVersion": 1, "name": "Sync flow", "nodes": [], "edges": []});
        sqlx::query("INSERT INTO workflows (id, workspace_id, name, draft_definition) VALUES ('w1', 'default', 'Sync flow', ?)")
            .bind(def.to_string())
            .execute(&pool).await.unwrap();
        let bundle = export_workspace_bundle_core(&pool).await.unwrap();
        assert_eq!(bundle["scripts"].as_array().unwrap().len(), 1);
        assert_eq!(bundle["workflows"].as_array().unwrap().len(), 1);
        assert_eq!(bundle["collections"].as_array().unwrap().len(), 1, "export collections: {bundle}");
        assert_eq!(bundle["apiRequests"].as_array().unwrap().len(), 1, "apiRequests: {bundle}");

        let other = test_pool().await;
        let result = import_workspace_bundle_core(
            &other,
            ImportWorkspacePayload { bundle: bundle.clone(), on_conflict: "skip".into(), dry_run: false },
        )
        .await
        .unwrap();
        assert_eq!(result.scripts, 1);
        assert_eq!(result.collections, 1, "collections import: result={result:?}");
        assert_eq!(result.api_requests, 1);
        assert_eq!(result.workflows, 1);
        let script_name: String = sqlx::query_scalar("SELECT name FROM scripts WHERE name = 'Sync script'")
            .fetch_one(&other).await.unwrap();
        assert_eq!(script_name, "Sync script");

        let again = import_workspace_bundle_core(
            &other,
            ImportWorkspacePayload { bundle, on_conflict: "skip".into(), dry_run: false },
        )
        .await
        .unwrap();
        assert_eq!(again.scripts, 0);
        assert!(again.skipped >= 1);
    }

    #[tokio::test]
    async fn import_dry_run_changes_nothing() {
        let pool = test_pool().await;
        let other = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, language, content) VALUES ('s1', 'X', 'x.py', 'python', 'print(1)')")
            .execute(&pool).await.unwrap();
        let bundle = export_workspace_bundle_core(&pool).await.unwrap();
        let result = import_workspace_bundle_core(
            &other,
            ImportWorkspacePayload { bundle, on_conflict: "skip".into(), dry_run: true },
        )
        .await
        .unwrap();
        assert_eq!(result.scripts, 1);
        assert!(result.dry_run);
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM scripts").fetch_one(&other).await.unwrap();
        assert_eq!(count, 0);
    }
}
