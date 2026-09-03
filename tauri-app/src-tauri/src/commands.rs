use crate::models::{BootstrapState, Collection, Script, ScriptTemplate, Tag};
use serde::Deserialize;
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateScriptPayload {
    name: String,
    description: Option<String>,
    #[serde(rename = "sync_to_gist")]
    sync_to_gist: Option<bool>,
    #[serde(rename = "syncToGist")]
    sync_to_gist_camel: Option<bool>,
    content: Option<String>,
    language: Option<String>,
    interpreter: Option<String>,
    parameters: Option<serde_json::Value>,
    #[serde(rename = "collection_id")]
    collection_id: Option<String>,
    #[serde(rename = "collectionId")]
    collection_id_camel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SaveScriptPayload {
    id: String,
    name: String,
    content: String,
    sync_to_gist: Option<bool>,
    language: Option<String>,
    interpreter: Option<String>,
    parameters: Option<serde_json::Value>,
    timeout_ms: Option<i64>,
    collection_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteScriptPayload {
    id: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionPayload {
    name: String,
    #[serde(rename = "project_id")]
    project_id: Option<String>,
    #[serde(rename = "projectId")]
    project_id_camel: Option<String>,
    #[serde(rename = "parent_id")]
    parent_id: Option<String>,
    #[serde(rename = "parentId")]
    parent_id_camel: Option<String>,
    #[serde(rename = "runtime_preset")]
    runtime_preset: Option<String>,
    #[serde(rename = "runtimePreset")]
    runtime_preset_camel: Option<String>,
    #[serde(rename = "python_toolchain_enabled")]
    python_toolchain_enabled: Option<bool>,
    #[serde(rename = "pythonToolchainEnabled")]
    python_toolchain_enabled_camel: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollectionPayload {
    id: String,
    name: Option<String>,
    #[serde(rename = "is_temporary")]
    is_temporary: Option<bool>,
    #[serde(rename = "isTemporary")]
    is_temporary_camel: Option<bool>,
    #[serde(rename = "project_id")]
    project_id: Option<String>,
    #[serde(rename = "projectId")]
    project_id_camel: Option<String>,
    #[serde(rename = "parent_id")]
    parent_id: Option<String>,
    #[serde(rename = "parentId")]
    parent_id_camel: Option<String>,
    #[serde(rename = "storage_provider_id")]
    storage_provider_id: Option<String>,
    #[serde(rename = "storageProviderId")]
    storage_provider_id_camel: Option<String>,
    #[serde(rename = "remote_prefix")]
    remote_prefix: Option<String>,
    #[serde(rename = "remotePrefix")]
    remote_prefix_camel: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteCollectionPayload {
    id: String,
    #[serde(rename = "hardDelete")]
    hard_delete: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct MoveScriptPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    #[serde(rename = "collectionId")]
    collection_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct MoveScriptResult {
    #[serde(rename = "scriptId")]
    script_id: String,
    #[serde(rename = "collectionId")]
    collection_id: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct UpdateCollectionResult {
    #[serde(rename = "updatedCollections")]
    updated_collections: Vec<Collection>,
}

#[derive(Debug, serde::Serialize)]
pub struct DeleteCollectionResult {
    id: String,
    #[serde(rename = "deletedCollectionIds")]
    deleted_collection_ids: Vec<String>,
    #[serde(rename = "deletedScriptIds")]
    deleted_script_ids: Vec<String>,
    #[serde(rename = "deletedFolderPath")]
    deleted_folder_path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddTagPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    name: String,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveTagPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    #[serde(rename = "tagId")]
    tag_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SaveTemplatePayload {
    name: String,
    description: String,
    category: String,
    language: String,
    interpreter: Option<String>,
    content: String,
    parameters: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn get_scripts(pool: State<'_, SqlitePool>) -> Result<Vec<Script>, String> {
    load_scripts(&pool).await
}

async fn load_scripts(pool: &SqlitePool) -> Result<Vec<Script>, String> {
    let mut scripts = sqlx::query_as::<_, Script>(
        "SELECT id, name, filename, description, language, interpreter, NULL AS content, parameters, created_at, updated_at, last_run, schedule_cron, schedule_enabled, collection_id, gist_id, gist_url, sync_to_gist, timeout_ms, require_webhook_signature, webhook_secret IS NOT NULL AS webhook_secret_set, source_path, source_available, json('[]') AS tags FROM scripts ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for script in &mut scripts {
        script.tags = load_script_tags(pool, &script.id).await?;
    }

    Ok(scripts)
}

#[tauri::command]
pub async fn create_script(
    pool: State<'_, SqlitePool>,
    payload: CreateScriptPayload,
) -> Result<Script, String> {
    create_script_record(&pool, payload).await
}

async fn create_script_record(
    pool: &SqlitePool,
    payload: CreateScriptPayload,
) -> Result<Script, String> {
    let id = Uuid::new_v4().to_string();
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Script name is required".to_string());
    }
    let filename = format!(
        "{}.{}",
        slugify(name),
        extension_for(payload.language.as_deref())
    );
    let language = payload.language.unwrap_or_else(|| "python".to_string());
    let content = payload
        .content
        .unwrap_or_else(|| "# New script\nprint(\"Hello World\")".to_string());
    let parameters = payload.parameters.unwrap_or_else(|| serde_json::json!([]));
    let sync_to_gist = payload
        .sync_to_gist
        .or(payload.sync_to_gist_camel)
        .unwrap_or(false);
    let collection_id = payload.collection_id.or(payload.collection_id_camel);

    sqlx::query(
        "INSERT INTO scripts (id, name, filename, description, language, interpreter, content, parameters, sync_to_gist, collection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(name)
    .bind(&filename)
    .bind(payload.description.unwrap_or_default())
    .bind(&language)
    .bind(payload.interpreter)
    .bind(content)
    .bind(parameters.to_string())
    .bind(sync_to_gist)
    .bind(collection_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    read_script_record(pool, &id).await
}

#[tauri::command]
pub async fn read_script(pool: State<'_, SqlitePool>, script_id: String) -> Result<Script, String> {
    read_script_record(&pool, &script_id).await
}

async fn read_script_record(pool: &SqlitePool, script_id: &str) -> Result<Script, String> {
    let mut script = sqlx::query_as::<_, Script>(
        "SELECT id, name, filename, description, language, interpreter, content, parameters, created_at, updated_at, last_run, schedule_cron, schedule_enabled, collection_id, gist_id, gist_url, sync_to_gist, timeout_ms, require_webhook_signature, webhook_secret IS NOT NULL AS webhook_secret_set, source_path, source_available, json('[]') AS tags FROM scripts WHERE id = ?",
    )
    .bind(script_id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    script.tags = load_script_tags(pool, &script.id).await?;
    Ok(script)
}

#[tauri::command]
pub async fn save_script(
    pool: State<'_, SqlitePool>,
    payload: SaveScriptPayload,
) -> Result<Script, String> {
    save_script_record(&pool, payload).await
}

async fn save_script_record(
    pool: &SqlitePool,
    payload: SaveScriptPayload,
) -> Result<Script, String> {
    sqlx::query(
        "UPDATE scripts SET name = ?, content = ?, sync_to_gist = ?, language = COALESCE(?, language), interpreter = ?, parameters = COALESCE(?, parameters), timeout_ms = ?, collection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&payload.name)
    .bind(&payload.content)
    .bind(payload.sync_to_gist.unwrap_or(false))
    .bind(payload.language)
    .bind(payload.interpreter)
    .bind(payload.parameters.map(|value| value.to_string()))
    .bind(payload.timeout_ms)
    .bind(payload.collection_id)
    .bind(&payload.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    create_version_snapshot(&pool, &payload.id, &payload.content).await?;

    read_script_record(pool, &payload.id).await
}

async fn create_version_snapshot(
    pool: &SqlitePool,
    script_id: &str,
    content: &str,
) -> Result<(), String> {
    let next_number: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(snapshot_number), 0) + 1 FROM script_versions WHERE script_id = ?")
            .bind(script_id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?;

    let version_id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO script_versions (id, script_id, content, snapshot_number) VALUES (?, ?, ?, ?)",
    )
    .bind(&version_id)
    .bind(script_id)
    .bind(content)
    .bind(next_number)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_script(
    pool: State<'_, SqlitePool>,
    payload: DeleteScriptPayload,
) -> Result<String, String> {
    delete_script_record(&pool, &payload.id).await
}

async fn delete_script_record(pool: &SqlitePool, id: &str) -> Result<String, String> {
    sqlx::query("DELETE FROM scripts WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(id.to_string())
}

#[tauri::command]
pub async fn duplicate_script(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Script, String> {
    let source = read_script_record(&pool, &script_id).await?;
    create_script_record(
        &pool,
        CreateScriptPayload {
            name: format!("{} Copy", source.name),
            description: Some(source.description),
            sync_to_gist: Some(false),
            sync_to_gist_camel: None,
            content: source.content,
            language: Some(source.language),
            interpreter: source.interpreter,
            parameters: serde_json::from_str(&source.parameters).ok(),
            collection_id: source.collection_id,
            collection_id_camel: None,
        },
    )
    .await
}

#[tauri::command]
pub async fn get_collections(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<crate::models::Collection>, String> {
    load_collections(&pool).await
}

async fn load_collections(pool: &SqlitePool) -> Result<Vec<Collection>, String> {
    sqlx::query_as::<_, Collection>(
        "SELECT c.id, c.name, c.description, COUNT(s.id) AS script_count, c.project_id, c.parent_id, c.folder_path, c.is_temporary, c.runtime_preset, c.python_toolchain_enabled, c.python_venv_path, c.python_interpreter_path, c.storage_provider_id, c.remote_prefix, c.created_at FROM collections c LEFT JOIN scripts s ON s.collection_id = c.id GROUP BY c.id ORDER BY c.name",
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_collection(
    pool: State<'_, SqlitePool>,
    payload: CreateCollectionPayload,
) -> Result<Collection, String> {
    create_collection_record(&pool, payload).await
}

async fn create_collection_record(
    pool: &SqlitePool,
    payload: CreateCollectionPayload,
) -> Result<Collection, String> {
    let id = Uuid::new_v4().to_string();
    let runtime_preset = payload
        .runtime_preset
        .or(payload.runtime_preset_camel)
        .unwrap_or_else(|| "general".to_string());
    let python_toolchain_enabled = payload
        .python_toolchain_enabled
        .or(payload.python_toolchain_enabled_camel)
        .unwrap_or(false);

    sqlx::query(
        "INSERT INTO collections (id, name, project_id, parent_id, runtime_preset, python_toolchain_enabled) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(payload.name)
    .bind(payload.project_id.or(payload.project_id_camel))
    .bind(payload.parent_id.or(payload.parent_id_camel))
    .bind(runtime_preset)
    .bind(python_toolchain_enabled)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    read_collection_record(pool, &id).await
}

async fn read_collection_record(pool: &SqlitePool, id: &str) -> Result<Collection, String> {
    sqlx::query_as::<_, Collection>(
        "SELECT c.id, c.name, c.description, COUNT(s.id) AS script_count, c.project_id, c.parent_id, c.folder_path, c.is_temporary, c.runtime_preset, c.python_toolchain_enabled, c.python_venv_path, c.python_interpreter_path, c.storage_provider_id, c.remote_prefix, c.created_at FROM collections c LEFT JOIN scripts s ON s.collection_id = c.id WHERE c.id = ? GROUP BY c.id",
    )
    .bind(id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_collection(
    pool: State<'_, SqlitePool>,
    payload: UpdateCollectionPayload,
) -> Result<UpdateCollectionResult, String> {
    update_collection_record(&pool, payload).await
}

async fn update_collection_record(
    pool: &SqlitePool,
    payload: UpdateCollectionPayload,
) -> Result<UpdateCollectionResult, String> {
    let current = read_collection_record(pool, &payload.id).await?;
    sqlx::query(
        "UPDATE collections SET name = ?, is_temporary = ?, project_id = ?, parent_id = ?, storage_provider_id = ?, remote_prefix = ? WHERE id = ?",
    )
    .bind(payload.name.unwrap_or(current.name))
    .bind(payload.is_temporary.or(payload.is_temporary_camel).unwrap_or(current.is_temporary))
    .bind(payload.project_id.or(payload.project_id_camel).or(current.project_id))
    .bind(payload.parent_id.or(payload.parent_id_camel).or(current.parent_id))
    .bind(payload.storage_provider_id.or(payload.storage_provider_id_camel).or(current.storage_provider_id))
    .bind(payload.remote_prefix.or(payload.remote_prefix_camel).or(current.remote_prefix))
    .bind(&payload.id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(UpdateCollectionResult {
        updated_collections: vec![read_collection_record(pool, &payload.id).await?],
    })
}

#[tauri::command]
pub async fn delete_collection(
    pool: State<'_, SqlitePool>,
    payload: DeleteCollectionPayload,
) -> Result<DeleteCollectionResult, String> {
    delete_collection_record(&pool, &payload.id, payload.hard_delete.unwrap_or(false)).await
}

async fn delete_collection_record(
    pool: &SqlitePool,
    id: &str,
    hard_delete: bool,
) -> Result<DeleteCollectionResult, String> {
    let deleted_script_ids = if hard_delete {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT id FROM scripts WHERE collection_id = ?")
            .bind(id)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
        let ids = rows.into_iter().map(|row| row.0).collect::<Vec<_>>();
        sqlx::query("DELETE FROM scripts WHERE collection_id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        ids
    } else {
        sqlx::query("UPDATE scripts SET collection_id = NULL WHERE collection_id = ?")
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        Vec::new()
    };

    let folder_path: Option<String> =
        sqlx::query_scalar("SELECT folder_path FROM collections WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();

    sqlx::query("DELETE FROM collections WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DeleteCollectionResult {
        id: id.to_string(),
        deleted_collection_ids: vec![id.to_string()],
        deleted_script_ids,
        deleted_folder_path: folder_path,
    })
}

#[tauri::command]
pub async fn move_script(
    pool: State<'_, SqlitePool>,
    payload: MoveScriptPayload,
) -> Result<MoveScriptResult, String> {
    move_script_record(&pool, &payload.script_id, payload.collection_id).await
}

async fn move_script_record(
    pool: &SqlitePool,
    script_id: &str,
    collection_id: Option<String>,
) -> Result<MoveScriptResult, String> {
    sqlx::query(
        "UPDATE scripts SET collection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&collection_id)
    .bind(script_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(MoveScriptResult {
        script_id: script_id.to_string(),
        collection_id,
    })
}

#[tauri::command]
pub async fn get_settings() -> Result<serde_json::Value, String> {
    Ok(default_settings())
}

fn default_settings() -> serde_json::Value {
    serde_json::json!({
        "theme": "dark",
        "notifications": true
    })
}

#[tauri::command]
pub async fn get_bootstrap_state(pool: State<'_, SqlitePool>) -> Result<BootstrapState, String> {
    load_bootstrap_state(&pool).await
}

async fn load_bootstrap_state(pool: &SqlitePool) -> Result<BootstrapState, String> {
    Ok(BootstrapState {
        scripts: load_scripts(pool).await?,
        collections: load_collections(pool).await?,
        settings: default_settings(),
    })
}

#[tauri::command]
pub async fn list_tags(pool: State<'_, SqlitePool>) -> Result<Vec<Tag>, String> {
    load_tags(&pool).await
}

async fn load_tags(pool: &SqlitePool) -> Result<Vec<Tag>, String> {
    sqlx::query_as::<_, Tag>("SELECT id, name, color FROM tags ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn load_script_tags(pool: &SqlitePool, script_id: &str) -> Result<Vec<Tag>, String> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.id, t.name, t.color FROM tags t INNER JOIN script_tags st ON st.tag_id = t.id WHERE st.script_id = ? ORDER BY t.name",
    )
    .bind(script_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag(pool: State<'_, SqlitePool>, payload: AddTagPayload) -> Result<Tag, String> {
    add_tag_record(&pool, &payload.script_id, &payload.name, payload.color).await
}

async fn add_tag_record(
    pool: &SqlitePool,
    script_id: &str,
    name: &str,
    color: Option<String>,
) -> Result<Tag, String> {
    let existing: Option<Tag> = sqlx::query_as(
        "SELECT id, name, color FROM tags WHERE workspace_id = 'default' AND name = ?",
    )
    .bind(name)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;
    let tag = if let Some(tag) = existing {
        tag
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
            .bind(&id)
            .bind(name)
            .bind(color.unwrap_or_else(|| "#6366f1".to_string()))
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query_as("SELECT id, name, color FROM tags WHERE id = ?")
            .bind(&id)
            .fetch_one(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    sqlx::query("INSERT OR IGNORE INTO script_tags (script_id, tag_id) VALUES (?, ?)")
        .bind(script_id)
        .bind(&tag.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(tag)
}

#[tauri::command]
pub async fn remove_tag(
    pool: State<'_, SqlitePool>,
    payload: RemoveTagPayload,
) -> Result<(), String> {
    remove_tag_record(&pool, &payload.script_id, &payload.tag_id).await
}

async fn remove_tag_record(pool: &SqlitePool, script_id: &str, tag_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM script_tags WHERE script_id = ? AND tag_id = ?")
        .bind(script_id)
        .bind(tag_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_templates(pool: State<'_, SqlitePool>) -> Result<Vec<ScriptTemplate>, String> {
    load_templates(&pool).await
}

async fn load_templates(pool: &SqlitePool) -> Result<Vec<ScriptTemplate>, String> {
    sqlx::query_as::<_, ScriptTemplate>(
        "SELECT id, name, description, category, language, interpreter, content, parameters, is_built_in, created_at FROM script_templates ORDER BY is_built_in DESC, name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_template(
    pool: State<'_, SqlitePool>,
    payload: SaveTemplatePayload,
) -> Result<ScriptTemplate, String> {
    save_template_record(&pool, payload).await
}

async fn save_template_record(
    pool: &SqlitePool,
    payload: SaveTemplatePayload,
) -> Result<ScriptTemplate, String> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO script_templates (id, name, description, category, language, interpreter, content, parameters, is_built_in) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(payload.name)
    .bind(payload.description)
    .bind(payload.category)
    .bind(payload.language)
    .bind(payload.interpreter)
    .bind(payload.content)
    .bind(payload.parameters.unwrap_or_else(|| serde_json::json!([])).to_string())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ScriptTemplate>(
        "SELECT id, name, description, category, language, interpreter, content, parameters, is_built_in, created_at FROM script_templates WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_template(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    delete_template_record(&pool, &id).await
}

async fn delete_template_record(pool: &SqlitePool, id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM script_templates WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Env Vars ---

#[derive(Debug, Deserialize)]
pub struct SaveEnvPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    key: String,
    value: String,
    #[serde(rename = "isSecret")]
    is_secret: bool,
}

#[derive(Debug, Deserialize)]
pub struct DeleteEnvPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    key: String,
}

#[derive(Debug, serde::Serialize)]
pub struct EnvVarRecord {
    pub id: String,
    pub key: String,
    pub value: String,
    pub is_secret: bool,
}

#[tauri::command]
pub async fn list_env(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Vec<EnvVarRecord>, String> {
    list_env_records(&pool, &script_id).await
}

async fn list_env_records(pool: &SqlitePool, script_id: &str) -> Result<Vec<EnvVarRecord>, String> {
    let rows: Vec<(String, String, Option<String>, i64)> =
        sqlx::query_as(
            "SELECT id, key, value, is_secret FROM script_env_vars WHERE script_id = ? ORDER BY key",
        )
        .bind(script_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(id, key, value, is_secret)| EnvVarRecord {
            id,
            key,
            value: if is_secret == 1 { String::new() } else { value.unwrap_or_default() },
            is_secret: is_secret == 1,
        })
        .collect())
}

#[tauri::command]
pub async fn save_env(
    pool: State<'_, SqlitePool>,
    payload: SaveEnvPayload,
) -> Result<EnvVarRecord, String> {
    save_env_record(&pool, &payload.script_id, &payload.key, &payload.value, payload.is_secret).await
}

async fn save_env_record(
    pool: &SqlitePool,
    script_id: &str,
    key: &str,
    value: &str,
    is_secret: bool,
) -> Result<EnvVarRecord, String> {
    let key = key.trim().to_uppercase().replace(|c: char| !c.is_ascii_alphanumeric() && c != '_', "_");
    if key.is_empty() {
        return Err("Env var key is required".to_string());
    }

    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO script_env_vars (id, script_id, key, value, is_secret) VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT(script_id, key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret",
    )
    .bind(&id)
    .bind(script_id)
    .bind(&key)
    .bind(value)
    .bind(if is_secret { 1 } else { 0 })
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Retrieve the actual row id (may have been replaced by conflict resolution)
    let result: (String, String, String, i64) =
        sqlx::query_as(
            "SELECT id, key, value, is_secret FROM script_env_vars WHERE script_id = ? AND key = ?",
        )
        .bind(script_id)
        .bind(&key)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(EnvVarRecord {
        id: result.0,
        key: result.1,
        value: if result.3 == 1 { String::new() } else { result.2 },
        is_secret: result.3 == 1,
    })
}

#[tauri::command]
pub async fn delete_env(
    pool: State<'_, SqlitePool>,
    payload: DeleteEnvPayload,
) -> Result<(), String> {
    delete_env_record(&pool, &payload.script_id, &payload.key).await
}

async fn delete_env_record(pool: &SqlitePool, script_id: &str, key: &str) -> Result<(), String> {
    let key = key.trim().to_uppercase().replace(|c: char| !c.is_ascii_alphanumeric() && c != '_', "_");
    sqlx::query("DELETE FROM script_env_vars WHERE script_id = ? AND key = ?")
        .bind(script_id)
        .bind(key)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Versions ---

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ScriptVersionMeta {
    pub id: String,
    pub script_id: String,
    pub snapshot_number: i64,
    pub saved_at: String,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct ScriptVersionContent {
    pub id: String,
    pub script_id: String,
    pub content: String,
    pub snapshot_number: i64,
    pub saved_at: String,
}

#[tauri::command]
pub async fn list_versions(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Vec<ScriptVersionMeta>, String> {
    sqlx::query_as::<_, ScriptVersionMeta>(
        "SELECT id, script_id, snapshot_number, saved_at FROM script_versions WHERE script_id = ? ORDER BY snapshot_number DESC",
    )
    .bind(&script_id)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct ReadVersionPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    #[serde(rename = "versionId")]
    version_id: String,
}

#[tauri::command]
pub async fn read_version(
    pool: State<'_, SqlitePool>,
    payload: ReadVersionPayload,
) -> Result<ScriptVersionContent, String> {
    sqlx::query_as::<_, ScriptVersionContent>(
        "SELECT id, script_id, content, snapshot_number, saved_at FROM script_versions WHERE script_id = ? AND id = ?",
    )
    .bind(&payload.script_id)
    .bind(&payload.version_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())
}

// --- Builds ---

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct BuildRecord {
    pub id: String,
    pub script_id: String,
    pub status: String,
    pub triggered_by: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub exit_code: Option<i64>,
    pub log_file: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_builds(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Vec<BuildRecord>, String> {
    list_builds_records(&pool, &script_id).await
}

async fn list_builds_records(pool: &SqlitePool, script_id: &str) -> Result<Vec<BuildRecord>, String> {
    sqlx::query_as::<_, BuildRecord>(
        "SELECT id, script_id, status, triggered_by, started_at, finished_at AS completed_at, exit_code, log_file, created_at FROM builds WHERE script_id = ? ORDER BY started_at DESC NULLS LAST, created_at DESC",
    )
    .bind(script_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct ReadBuildOutputPayload {
    #[serde(rename = "scriptId")]
    script_id: String,
    #[serde(rename = "buildId")]
    build_id: String,
}

#[tauri::command]
pub async fn read_build_output(
    pool: State<'_, SqlitePool>,
    payload: ReadBuildOutputPayload,
) -> Result<String, String> {
    read_build_output_record(&pool, &payload.script_id, &payload.build_id).await
}

async fn read_build_output_record(pool: &SqlitePool, script_id: &str, build_id: &str) -> Result<String, String> {
    let log_file: Option<String> =
        sqlx::query_scalar("SELECT log_file FROM builds WHERE id = ? AND script_id = ?")
            .bind(build_id)
            .bind(script_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    match log_file {
        Some(path) => {
            let contents = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read build log: {e}"))?;
            Ok(contents)
        }
        None => Ok(String::new()),
    }
}

#[allow(dead_code)]
async fn create_build_record(
    pool: &SqlitePool,
    build_id: &str,
    script_id: &str,
    triggered_by: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO builds (id, script_id, status, triggered_by, started_at) VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP)",
    )
    .bind(build_id)
    .bind(script_id)
    .bind(triggered_by)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(dead_code)]
async fn finalize_build(
    pool: &SqlitePool,
    build_id: &str,
    status: &str,
    exit_code: Option<i64>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE builds SET status = ?, exit_code = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(status)
    .bind(exit_code)
    .bind(build_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[allow(dead_code)]
fn write_build_output(log_path: &str, content: &str) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(log_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(log_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

fn slugify(value: &str) -> String {
    let slug = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    if slug.is_empty() {
        "script".to_string()
    } else {
        slug
    }
}

fn extension_for(language: Option<&str>) -> &'static str {
    match language.unwrap_or("python") {
        "javascript" | "node" => "js",
        "typescript" => "ts",
        "powershell" => "ps1",
        "shell" | "bash" => "sh",
        _ => "py",
    }
}

#[tauri::command]
pub fn subscribe_noop() -> Result<(), String> {
    Ok(())
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
    async fn bootstrap_state_returns_empty_startup_payload() {
        let pool = test_pool().await;
        let state = load_bootstrap_state(&pool)
            .await
            .expect("load bootstrap state");

        assert!(state.scripts.is_empty());
        assert!(state.collections.is_empty());
        assert_eq!(state.settings["theme"], "dark");
        assert_eq!(state.settings["notifications"], true);
    }

    #[tokio::test]
    async fn startup_catalog_commands_return_empty_lists() {
        let pool = test_pool().await;

        assert!(load_tags(&pool).await.expect("load tags").is_empty());
        assert!(load_templates(&pool)
            .await
            .expect("load templates")
            .is_empty());
    }

    #[tokio::test]
    async fn script_crud_round_trips_content_and_metadata() {
        let pool = test_pool().await;

        let created = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Daily Report".to_string(),
                description: Some("Generate daily report".to_string()),
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('ok')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        assert_eq!(created.name, "Daily Report");
        assert_eq!(created.content.as_deref(), Some("print('ok')"));

        let saved = save_script_record(
            &pool,
            SaveScriptPayload {
                id: created.id.clone(),
                name: "Daily Report Updated".to_string(),
                content: "print('updated')".to_string(),
                sync_to_gist: Some(false),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                timeout_ms: Some(30000),
                collection_id: None,
            },
        )
        .await
        .expect("save script");

        assert_eq!(saved.name, "Daily Report Updated");
        assert_eq!(saved.content.as_deref(), Some("print('updated')"));
        assert_eq!(saved.timeout_ms, Some(30000));

        let read_back = read_script_record(&pool, &created.id)
            .await
            .expect("read script");
        assert_eq!(read_back.content.as_deref(), Some("print('updated')"));

        let deleted_id = delete_script_record(&pool, &created.id)
            .await
            .expect("delete script");
        assert_eq!(deleted_id, created.id);
        assert!(read_script_record(&pool, &deleted_id).await.is_err());
    }

    #[tokio::test]
    async fn collection_crud_and_move_script_round_trip() {
        let pool = test_pool().await;

        let collection = create_collection_record(
            &pool,
            CreateCollectionPayload {
                name: "Ops".to_string(),
                project_id: None,
                project_id_camel: None,
                parent_id: None,
                parent_id_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(true),
                python_toolchain_enabled_camel: None,
            },
        )
        .await
        .expect("create collection");

        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Mover".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('move')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        let moved = move_script_record(&pool, &script.id, Some(collection.id.clone()))
            .await
            .expect("move script");
        assert_eq!(moved.collection_id, Some(collection.id.clone()));

        let updated = update_collection_record(
            &pool,
            UpdateCollectionPayload {
                id: collection.id.clone(),
                name: Some("Ops Updated".to_string()),
                is_temporary: Some(false),
                is_temporary_camel: None,
                project_id: None,
                project_id_camel: None,
                parent_id: None,
                parent_id_camel: None,
                storage_provider_id: None,
                storage_provider_id_camel: None,
                remote_prefix: None,
                remote_prefix_camel: None,
            },
        )
        .await
        .expect("update collection");
        assert_eq!(updated.updated_collections[0].name, "Ops Updated");

        let deleted = delete_collection_record(&pool, &collection.id, false)
            .await
            .expect("delete collection");
        assert_eq!(deleted.deleted_collection_ids, vec![collection.id]);

        let moved_back = read_script_record(&pool, &script.id)
            .await
            .expect("script remains after collection delete");
        assert_eq!(moved_back.collection_id, None);
    }

    #[tokio::test]
    async fn tags_and_templates_can_be_saved_and_removed() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Tagged".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('tag')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        let tag = add_tag_record(&pool, &script.id, "ops", Some("#22c55e".to_string()))
            .await
            .expect("add tag");
        assert_eq!(tag.name, "ops");
        assert_eq!(
            read_script_record(&pool, &script.id)
                .await
                .unwrap()
                .tags
                .len(),
            1
        );

        remove_tag_record(&pool, &script.id, &tag.id)
            .await
            .expect("remove tag");
        assert!(read_script_record(&pool, &script.id)
            .await
            .unwrap()
            .tags
            .is_empty());

        let template = save_template_record(
            &pool,
            SaveTemplatePayload {
                name: "Python starter".to_string(),
                description: "Starter".to_string(),
                category: "general".to_string(),
                language: "python".to_string(),
                interpreter: None,
                content: "print('hello')".to_string(),
                parameters: Some(serde_json::json!([])),
            },
        )
        .await
        .expect("save template");
        assert_eq!(template.name, "Python starter");

        delete_template_record(&pool, &template.id)
            .await
            .expect("delete template");
        assert!(load_templates(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn task3_crud_smoke_matches_visible_flow() {
        let pool = test_pool().await;

        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Smoke Script".to_string(),
                description: Some("Smoke flow".to_string()),
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('smoke')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        let renamed = save_script_record(
            &pool,
            SaveScriptPayload {
                id: script.id.clone(),
                name: "Smoke Script Renamed".to_string(),
                content: "print('renamed')".to_string(),
                sync_to_gist: Some(false),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                timeout_ms: None,
                collection_id: None,
            },
        )
        .await
        .expect("rename/update script");
        assert_eq!(renamed.name, "Smoke Script Renamed");

        let collection = create_collection_record(
            &pool,
            CreateCollectionPayload {
                name: "Smoke Collection".to_string(),
                project_id: None,
                project_id_camel: None,
                parent_id: None,
                parent_id_camel: None,
                runtime_preset: None,
                runtime_preset_camel: None,
                python_toolchain_enabled: None,
                python_toolchain_enabled_camel: None,
            },
        )
        .await
        .expect("create collection");

        move_script_record(&pool, &script.id, Some(collection.id.clone()))
            .await
            .expect("move script");
        assert_eq!(
            read_script_record(&pool, &script.id)
                .await
                .unwrap()
                .collection_id,
            Some(collection.id.clone())
        );

        let tag = add_tag_record(&pool, &script.id, "smoke", None)
            .await
            .expect("tag script");
        let script_tags = read_script_record(&pool, &script.id).await.unwrap().tags;
        assert_eq!(script_tags.len(), 1);
        assert_eq!(script_tags[0].id, tag.id);
        assert_eq!(script_tags[0].name, "smoke");

        let template = save_template_record(
            &pool,
            SaveTemplatePayload {
                name: "Smoke Template".to_string(),
                description: "Smoke".to_string(),
                category: "general".to_string(),
                language: "python".to_string(),
                interpreter: None,
                content: "print('template')".to_string(),
                parameters: Some(serde_json::json!([])),
            },
        )
        .await
        .expect("create template");
        assert_eq!(load_templates(&pool).await.unwrap().len(), 1);

        delete_template_record(&pool, &template.id)
            .await
            .expect("delete template");
        assert!(load_templates(&pool).await.unwrap().is_empty());

        let refreshed = load_bootstrap_state(&pool).await.expect("refresh app data");
        assert_eq!(refreshed.scripts.len(), 1);
        assert_eq!(refreshed.collections.len(), 1);
        assert_eq!(refreshed.scripts[0].name, "Smoke Script Renamed");
    }

    #[tokio::test]
    async fn env_vars_can_be_listed_saved_and_deleted_with_secret_masking() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Env Script".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('env')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        // Save a secret env var
        let secret = save_env_record(
            &pool,
            &script.id,
            "API_KEY",
            "super-secret-value",
            true,
        )
        .await
        .expect("save secret env");
        assert_eq!(secret.key, "API_KEY");
        assert!(secret.is_secret);

        // Save a non-secret env var
        let _public = save_env_record(
            &pool,
            &script.id,
            "DEBUG",
            "true",
            false,
        )
        .await
        .expect("save public env");

        // List: secret value must not be leaked
        let listed = list_env_records(&pool, &script.id).await.expect("list env");
        assert_eq!(listed.len(), 2);
        let secret_row = listed.iter().find(|e| e.key == "API_KEY").unwrap();
        assert!(secret_row.is_secret);
        assert!(secret_row.value.is_empty(), "secret value must be empty in list output");
        let public_row = listed.iter().find(|e| e.key == "DEBUG").unwrap();
        assert!(!public_row.is_secret);
        assert_eq!(public_row.value, "true");

        // Delete the secret env var
        delete_env_record(&pool, &script.id, "API_KEY")
            .await
            .expect("delete env");
        let after_delete = list_env_records(&pool, &script.id).await.expect("list env after delete");
        assert_eq!(after_delete.len(), 1);
        assert_eq!(after_delete[0].key, "DEBUG");
    }

    #[tokio::test]
    async fn save_env_upserts_existing_key() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Upsert Env".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('upsert')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        save_env_record(&pool, &script.id, "TOKEN", "old-value", false)
            .await
            .expect("save env first");

        save_env_record(&pool, &script.id, "TOKEN", "new-value", false)
            .await
            .expect("save env upsert");

        let listed = list_env_records(&pool, &script.id).await.expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].value, "new-value");
    }

    #[tokio::test]
    async fn save_script_creates_version_snapshot() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Versioned".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('v1')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        // Save with updated content
        save_script_record(
            &pool,
            SaveScriptPayload {
                id: script.id.clone(),
                name: "Versioned".to_string(),
                content: "print('v2')".to_string(),
                sync_to_gist: Some(false),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                timeout_ms: None,
                collection_id: None,
            },
        )
        .await
        .expect("save script");

        // List versions: should have 1 snapshot
        let versions: Vec<(String, i64, String)> =
            sqlx::query_as("SELECT id, snapshot_number, saved_at FROM script_versions WHERE script_id = ? ORDER BY snapshot_number")
                .bind(&script.id)
                .fetch_all(&pool)
                .await
                .expect("query versions");
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].1, 1);

        // Save again with different content
        save_script_record(
            &pool,
            SaveScriptPayload {
                id: script.id.clone(),
                name: "Versioned".to_string(),
                content: "print('v3')".to_string(),
                sync_to_gist: Some(false),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: Some(serde_json::json!([])),
                timeout_ms: None,
                collection_id: None,
            },
        )
        .await
        .expect("save script again");

        let versions: Vec<(String, i64, String, String)> =
            sqlx::query_as("SELECT id, snapshot_number, saved_at, content FROM script_versions WHERE script_id = ? ORDER BY snapshot_number")
                .bind(&script.id)
                .fetch_all(&pool)
                .await
                .expect("query versions 2");
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].1, 1);
        assert_eq!(versions[1].1, 2);
        assert_eq!(versions[1].3, "print('v3')");
    }

    #[tokio::test]
    async fn build_records_track_status_and_output() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Build Test".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('build test')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        let build_id = Uuid::new_v4().to_string();
        let log_path = std::env::temp_dir().join(format!("sm-test-{}.log", &build_id[..8]));
        let log_path_str = log_path.to_string_lossy().to_string();

        // Simulate start
        create_build_record(&pool, &build_id, &script.id, "manual").await.expect("create build");

        // Set log file path on the build record
        sqlx::query("UPDATE builds SET log_file = ? WHERE id = ?")
            .bind(&log_path_str)
            .bind(&build_id)
            .execute(&pool)
            .await
            .expect("set log file");

        // Simulate writing output and finalizing as success
        write_build_output(&log_path_str, "Hello world\n").expect("write output");
        finalize_build(&pool, &build_id, "success", Some(0)).await.expect("finalize");

        // List builds
        let builds: Vec<BuildRecord> = list_builds_records(&pool, &script.id).await.expect("list builds");
        assert_eq!(builds.len(), 1);
        assert_eq!(builds[0].id, build_id);
        assert_eq!(builds[0].status, "success");
        assert_eq!(builds[0].exit_code, Some(0));

        // Read build output
        let output = read_build_output_record(&pool, &script.id, &build_id).await.expect("read output");
        assert_eq!(output, "Hello world\n");

        // Simulate failure finalization
        finalize_build(&pool, &build_id, "failure", Some(1)).await.expect("finalize failure");
        let builds: Vec<BuildRecord> = list_builds_records(&pool, &script.id).await.expect("list builds 2");
        assert_eq!(builds[0].status, "failure");
        assert_eq!(builds[0].exit_code, Some(1));
    }
}
