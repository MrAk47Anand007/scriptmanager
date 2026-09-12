use crate::models::{BootstrapState, Collection, Script, ScriptTemplate, Tag};
use serde::Deserialize;
use sqlx::{Row, SqlitePool};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    process::Command,
};
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
pub struct OpenFolderPayload {
    #[serde(rename = "folder_path")]
    folder_path: Option<String>,
    #[serde(rename = "folderPath")]
    folder_path_camel: Option<String>,
    mode: Option<String>,
    #[serde(rename = "collection_name")]
    collection_name: Option<String>,
    #[serde(rename = "collectionName")]
    collection_name_camel: Option<String>,
    #[serde(rename = "runtime_preset")]
    runtime_preset: Option<String>,
    #[serde(rename = "runtimePreset")]
    runtime_preset_camel: Option<String>,
    #[serde(rename = "python_toolchain_enabled")]
    python_toolchain_enabled: Option<bool>,
    #[serde(rename = "pythonToolchainEnabled")]
    python_toolchain_enabled_camel: Option<bool>,
    #[allow(dead_code)]
    #[serde(rename = "create_venv_if_missing")]
    create_venv_if_missing: Option<bool>,
    #[allow(dead_code)]
    #[serde(rename = "createVenvIfMissing")]
    create_venv_if_missing_camel: Option<bool>,
}

#[derive(Debug, serde::Serialize)]
pub struct LinkedScriptSummary {
    id: String,
    name: String,
}

#[derive(Debug, serde::Serialize)]
pub struct OpenFolderResult {
    collection: Collection,
    scripts: Vec<LinkedScriptSummary>,
    imported_count: usize,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInspection {
    has_venv: bool,
    venv_path: Option<String>,
    interpreter_path: Option<String>,
    manifests: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManageCollectionPythonEnvPayload {
    collection_id: String,
    recreate: Option<bool>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionWorkspaceStatus {
    collection: Collection,
    workspace_path: Option<String>,
    has_venv: bool,
    venv_path: Option<String>,
    interpreter_path: Option<String>,
    manifests: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleWebhookSignaturePayload {
    script_id: String,
    require_signature: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct RegenerateWebhookResult {
    webhook_token: String,
}

#[derive(Debug, serde::Serialize)]
pub struct RegenerateWebhookSecretResult {
    webhook_secret: String,
}

#[derive(Debug, serde::Serialize)]
pub struct ToggleWebhookSignatureResult {
    require_webhook_signature: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    webhook_secret: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCanonicalRecoveryDraftPayload {
    script_id: String,
    source_path: String,
    source_revision: String,
    content: String,
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalRecoveryDraft {
    id: String,
    script_id: String,
    source_path: String,
    source_revision: String,
    content: String,
    created_at: String,
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
    if script.source_path.is_some() {
        script.content = resolve_script_source_content(pool, &script).await?;
    }
    Ok(script)
}

#[tauri::command]
pub async fn regenerate_webhook(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<RegenerateWebhookResult, String> {
    regenerate_webhook_record(&pool, &script_id).await
}

async fn regenerate_webhook_record(
    pool: &SqlitePool,
    script_id: &str,
) -> Result<RegenerateWebhookResult, String> {
    read_script_record(pool, script_id).await?;
    let token = Uuid::new_v4().simple().to_string();
    sqlx::query("UPDATE scripts SET webhook_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&token)
        .bind(script_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(RegenerateWebhookResult {
        webhook_token: token,
    })
}

#[tauri::command]
pub async fn regenerate_webhook_secret(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<RegenerateWebhookSecretResult, String> {
    regenerate_webhook_secret_record(&pool, &script_id).await
}

async fn regenerate_webhook_secret_record(
    pool: &SqlitePool,
    script_id: &str,
) -> Result<RegenerateWebhookSecretResult, String> {
    read_script_record(pool, script_id).await?;
    let secret = Uuid::new_v4().simple().to_string();
    sqlx::query("UPDATE scripts SET webhook_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&secret)
        .bind(script_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(RegenerateWebhookSecretResult {
        webhook_secret: secret,
    })
}

#[tauri::command]
pub async fn toggle_webhook_signature(
    pool: State<'_, SqlitePool>,
    payload: ToggleWebhookSignaturePayload,
) -> Result<ToggleWebhookSignatureResult, String> {
    toggle_webhook_signature_record(&pool, payload).await
}

async fn toggle_webhook_signature_record(
    pool: &SqlitePool,
    payload: ToggleWebhookSignaturePayload,
) -> Result<ToggleWebhookSignatureResult, String> {
    read_script_record(pool, &payload.script_id).await?;
    let existing_secret: Option<String> =
        sqlx::query_scalar("SELECT webhook_secret FROM scripts WHERE id = ?")
            .bind(&payload.script_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
    let generated_secret = if payload.require_signature && existing_secret.is_none() {
        Some(Uuid::new_v4().simple().to_string())
    } else {
        None
    };
    let stored_secret = generated_secret.as_ref().or(existing_secret.as_ref());

    sqlx::query(
        "UPDATE scripts SET require_webhook_signature = ?, webhook_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(payload.require_signature)
    .bind(stored_secret)
    .bind(&payload.script_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ToggleWebhookSignatureResult {
        require_webhook_signature: payload.require_signature,
        webhook_secret: generated_secret,
    })
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
    let existing = sqlx::query_as::<_, Script>(
        "SELECT id, name, filename, description, language, interpreter, content, parameters, created_at, updated_at, last_run, schedule_cron, schedule_enabled, collection_id, gist_id, gist_url, sync_to_gist, timeout_ms, require_webhook_signature, webhook_secret IS NOT NULL AS webhook_secret_set, source_path, source_available, json('[]') AS tags FROM scripts WHERE id = ?",
    )
    .bind(&payload.id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    if existing.source_path.is_some() {
        // Linked-folder scripts persist canonical content to the source file;
        // the DB content column stays NULL so the file remains the source of truth.
        if !existing.source_available {
            return Err("Canonical script source is unavailable".to_string());
        }
        let source_path = PathBuf::from(existing.source_path.as_deref().unwrap_or_default());
        if let Some(folder) =
            load_script_collection_folder(pool, existing.collection_id.as_deref()).await?
        {
            assert_canonical_source_inside(Path::new(&folder), &source_path)?;
        }
        if let Some(parent) = source_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&source_path, &payload.content).map_err(|e| e.to_string())?;

        sqlx::query(
            "UPDATE scripts SET name = ?, sync_to_gist = ?, language = COALESCE(?, language), interpreter = ?, parameters = COALESCE(?, parameters), timeout_ms = ?, collection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(&payload.name)
        .bind(payload.sync_to_gist.unwrap_or(false))
        .bind(&payload.language)
        .bind(&payload.interpreter)
        .bind(payload.parameters.map(|value| value.to_string()))
        .bind(payload.timeout_ms)
        .bind(&payload.collection_id)
        .bind(&payload.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "UPDATE scripts SET name = ?, content = ?, sync_to_gist = ?, language = COALESCE(?, language), interpreter = ?, parameters = COALESCE(?, parameters), timeout_ms = ?, collection_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(&payload.name)
        .bind(&payload.content)
        .bind(payload.sync_to_gist.unwrap_or(false))
        .bind(&payload.language)
        .bind(&payload.interpreter)
        .bind(payload.parameters.map(|value| value.to_string()))
        .bind(payload.timeout_ms)
        .bind(&payload.collection_id)
        .bind(&payload.id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

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
pub async fn open_folder(
    pool: State<'_, SqlitePool>,
    payload: OpenFolderPayload,
) -> Result<OpenFolderResult, String> {
    open_folder_record(&pool, payload).await
}

#[tauri::command]
pub async fn inspect_folder(folder_path: String) -> Result<FolderInspection, String> {
    inspect_folder_record(&folder_path)
}

#[tauri::command]
pub async fn inspect_collection_workspace(
    pool: State<'_, SqlitePool>,
    collection_id: String,
) -> Result<CollectionWorkspaceStatus, String> {
    inspect_collection_workspace_record(&pool, &collection_id).await
}

#[tauri::command]
pub async fn manage_collection_python_env(
    pool: State<'_, SqlitePool>,
    payload: ManageCollectionPythonEnvPayload,
) -> Result<CollectionWorkspaceStatus, String> {
    manage_collection_python_env_record(&pool, payload).await
}

#[tauri::command]
pub async fn rescan_canonical_folder(
    pool: State<'_, SqlitePool>,
    collection_id: String,
) -> Result<OpenFolderResult, String> {
    rescan_canonical_folder_record(&pool, &collection_id).await
}

#[tauri::command]
pub async fn list_canonical_recovery_drafts(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<Vec<CanonicalRecoveryDraft>, String> {
    list_canonical_recovery_drafts_record(&pool, &script_id).await
}

#[tauri::command]
pub async fn save_canonical_recovery_draft(
    pool: State<'_, SqlitePool>,
    payload: SaveCanonicalRecoveryDraftPayload,
) -> Result<CanonicalRecoveryDraft, String> {
    save_canonical_recovery_draft_record(&pool, payload).await
}

#[tauri::command]
pub async fn discard_canonical_recovery_draft(
    pool: State<'_, SqlitePool>,
    draft_id: String,
) -> Result<(), String> {
    discard_canonical_recovery_draft_record(&pool, &draft_id).await
}

fn inspect_folder_record(folder_path: &str) -> Result<FolderInspection, String> {
    let resolved_folder = fs::canonicalize(folder_path)
        .map_err(|_| "Selected folder does not exist".to_string())?;
    if !resolved_folder.is_dir() {
        return Err("Selected folder does not exist".to_string());
    }

    let venv_path = resolved_folder.join(".venv");
    let has_venv = venv_path.is_dir();
    let interpreter_path = if has_venv {
        let windows_python = venv_path.join("Scripts").join("python.exe");
        let unix_python = venv_path.join("bin").join("python");
        if windows_python.exists() {
            Some(path_to_display_string(&windows_python))
        } else if unix_python.exists() {
            Some(path_to_display_string(&unix_python))
        } else {
            None
        }
    } else {
        None
    };

    let manifests = [
        "package.json",
        "pyproject.toml",
        "requirements.txt",
        "Cargo.toml",
        "deno.json",
    ]
    .iter()
    .filter(|name| resolved_folder.join(name).exists())
    .map(|name| (*name).to_string())
    .collect();

    Ok(FolderInspection {
        has_venv,
        venv_path: has_venv.then(|| path_to_display_string(&venv_path)),
        interpreter_path,
        manifests,
    })
}

async fn inspect_collection_workspace_record(
    pool: &SqlitePool,
    collection_id: &str,
) -> Result<CollectionWorkspaceStatus, String> {
    let collection = read_collection_record(pool, collection_id).await?;
    let Some(folder_path) = collection.folder_path.clone() else {
        return Ok(CollectionWorkspaceStatus {
            collection,
            workspace_path: None,
            has_venv: false,
            venv_path: None,
            interpreter_path: None,
            manifests: Vec::new(),
        });
    };

    let inspection = inspect_folder_record(&folder_path)?;
    Ok(CollectionWorkspaceStatus {
        collection,
        workspace_path: Some(folder_path),
        has_venv: inspection.has_venv,
        venv_path: inspection.venv_path,
        interpreter_path: inspection.interpreter_path,
        manifests: inspection.manifests,
    })
}

async fn manage_collection_python_env_record(
    pool: &SqlitePool,
    payload: ManageCollectionPythonEnvPayload,
) -> Result<CollectionWorkspaceStatus, String> {
    let collection = read_collection_record(pool, &payload.collection_id).await?;
    let folder_path = collection
        .folder_path
        .clone()
        .ok_or_else(|| "Collection is not linked to a local workspace".to_string())?;
    let resolved_folder = fs::canonicalize(&folder_path)
        .map_err(|_| "Collection workspace folder does not exist".to_string())?;
    if !resolved_folder.is_dir() {
        return Err("Collection workspace folder does not exist".to_string());
    }

    let venv_path = resolved_folder.join(".venv");
    if payload.recreate.unwrap_or(false) && venv_path.exists() {
        fs::remove_dir_all(&venv_path)
            .map_err(|e| format!("Failed to remove existing .venv: {e}"))?;
    }

    if !venv_path.exists() {
        create_python_venv(&resolved_folder, &venv_path)?;
    }

    let inspection = inspect_folder_record(&folder_path)?;
    sqlx::query(
        "UPDATE collections SET python_toolchain_enabled = 1, python_venv_path = ?, python_interpreter_path = ? WHERE id = ?",
    )
    .bind(&inspection.venv_path)
    .bind(&inspection.interpreter_path)
    .bind(&payload.collection_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    inspect_collection_workspace_record(pool, &payload.collection_id).await
}

async fn rescan_canonical_folder_record(
    pool: &SqlitePool,
    collection_id: &str,
) -> Result<OpenFolderResult, String> {
    let collection = read_collection_record(pool, collection_id).await?;
    let folder_path = collection
        .folder_path
        .clone()
        .ok_or_else(|| "Collection is not linked to a canonical folder".to_string())?;

    open_folder_record(
        pool,
        OpenFolderPayload {
            folder_path: Some(folder_path),
            folder_path_camel: None,
            mode: Some("collection".to_string()),
            collection_name: Some(collection.name),
            collection_name_camel: None,
            runtime_preset: Some(collection.runtime_preset),
            runtime_preset_camel: None,
            python_toolchain_enabled: Some(collection.python_toolchain_enabled),
            python_toolchain_enabled_camel: None,
            create_venv_if_missing: None,
            create_venv_if_missing_camel: None,
        },
    )
    .await
}

async fn list_canonical_recovery_drafts_record(
    pool: &SqlitePool,
    script_id: &str,
) -> Result<Vec<CanonicalRecoveryDraft>, String> {
    sqlx::query_as::<_, CanonicalRecoveryDraft>(
        "SELECT id, script_id, source_path, source_revision, content, created_at FROM canonical_recovery_drafts WHERE script_id = ? ORDER BY created_at DESC",
    )
    .bind(script_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn save_canonical_recovery_draft_record(
    pool: &SqlitePool,
    payload: SaveCanonicalRecoveryDraftPayload,
) -> Result<CanonicalRecoveryDraft, String> {
    let script = read_script_record(pool, &payload.script_id).await?;
    let Some(source_path) = script.source_path else {
        return Err("Script is not linked to a canonical source file".to_string());
    };
    if normalize_source_path_key(&source_path) != normalize_source_path_key(&payload.source_path) {
        return Err("Recovery draft canonical source path does not match the linked script".to_string());
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO canonical_recovery_drafts (id, script_id, source_path, source_revision, content) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.script_id)
    .bind(&payload.source_path)
    .bind(&payload.source_revision)
    .bind(&payload.content)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, CanonicalRecoveryDraft>(
        "SELECT id, script_id, source_path, source_revision, content, created_at FROM canonical_recovery_drafts WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

async fn discard_canonical_recovery_draft_record(
    pool: &SqlitePool,
    draft_id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM canonical_recovery_drafts WHERE id = ?")
        .bind(draft_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn create_python_venv(workspace_path: &Path, venv_path: &Path) -> Result<(), String> {
    let candidates: &[(&str, &[&str])] = if cfg!(windows) {
        &[("py", &["-3", "-m", "venv"]), ("python", &["-m", "venv"])]
    } else {
        &[("python3", &["-m", "venv"]), ("python", &["-m", "venv"])]
    };

    let mut failures = Vec::new();
    for (program, args) in candidates {
        let output = Command::new(program)
            .args(*args)
            .arg(venv_path)
            .current_dir(workspace_path)
            .output();

        match output {
            Ok(output) if output.status.success() => return Ok(()),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let details = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("exit code {:?}", output.status.code())
                };
                failures.push(format!("{program}: {details}"));
            }
            Err(error) => failures.push(format!("{program}: {error}")),
        }
    }

    Err(format!(
        "Failed to create Python virtual environment. Install Python 3 and ensure it is on PATH. Attempts: {}",
        failures.join("; ")
    ))
}

async fn open_folder_record(
    pool: &SqlitePool,
    payload: OpenFolderPayload,
) -> Result<OpenFolderResult, String> {
    let folder_path = payload
        .folder_path_camel
        .as_deref()
        .or(payload.folder_path.as_deref())
        .ok_or_else(|| "Folder path is required".to_string())?
        .trim();
    if folder_path.is_empty() {
        return Err("Folder path is required".to_string());
    }

    let resolved_folder = fs::canonicalize(folder_path)
        .map_err(|_| "Selected folder does not exist".to_string())?;
    if !resolved_folder.is_dir() {
        return Err("Selected folder does not exist".to_string());
    }

    let files = list_supported_folder_scripts(&resolved_folder)?;
    if files.is_empty() {
        return Err("No supported script files found in that folder".to_string());
    }

    let mode = payload.mode.unwrap_or_else(|| "temporary".to_string());
    let is_temporary = mode != "collection";
    let runtime_preset = payload
        .runtime_preset
        .or(payload.runtime_preset_camel)
        .unwrap_or_else(|| "general".to_string());
    let python_toolchain_enabled = payload
        .python_toolchain_enabled
        .or(payload.python_toolchain_enabled_camel)
        .unwrap_or(false);
    let folder_path_str = path_to_display_string(&resolved_folder);

    if is_temporary {
        let temp_ids: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM collections WHERE is_temporary = 1 AND folder_path IS NOT NULL",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        for id in temp_ids {
            sqlx::query("DELETE FROM scripts WHERE collection_id = ?")
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
            sqlx::query("DELETE FROM collections WHERE id = ?")
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    let collection_id: Option<String> = if is_temporary {
        None
    } else {
        sqlx::query_scalar(
            "SELECT id FROM collections WHERE folder_path = ? ORDER BY created_at LIMIT 1",
        )
        .bind(&folder_path_str)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
    };

    let collection_name = payload
        .collection_name
        .or(payload.collection_name_camel)
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| folder_display_name(&resolved_folder));
    let collection_name = if is_temporary {
        format!("{collection_name} (Temporary)")
    } else {
        collection_name
    };

    let collection_id = if let Some(id) = collection_id {
        sqlx::query(
            "UPDATE collections SET name = ?, is_temporary = ?, runtime_preset = ?, python_toolchain_enabled = ? WHERE id = ?",
        )
        .bind(&collection_name)
        .bind(is_temporary)
        .bind(&runtime_preset)
        .bind(python_toolchain_enabled)
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        id
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO collections (id, name, folder_path, is_temporary, runtime_preset, python_toolchain_enabled) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&collection_name)
        .bind(&folder_path_str)
        .bind(is_temporary)
        .bind(&runtime_preset)
        .bind(python_toolchain_enabled)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
        id
    };

    let existing_rows = sqlx::query(
        "SELECT id, source_path FROM scripts WHERE collection_id = ? AND source_path IS NOT NULL",
    )
    .bind(&collection_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let existing_by_source = existing_rows
        .iter()
        .filter_map(|row| {
            let id: String = row.try_get("id").ok()?;
            let source_path: String = row.try_get("source_path").ok()?;
            Some((normalize_source_path_key(&source_path), id))
        })
        .collect::<HashMap<_, _>>();

    let mut active_source_paths = HashSet::new();
    let mut linked_scripts = Vec::new();

    for file_path in files {
        let source_path = path_to_display_string(&file_path);
        let source_key = normalize_source_path_key(&source_path);
        active_source_paths.insert(source_key.clone());
        let base_name = build_linked_script_name(&resolved_folder, &file_path);
        let display_name = unique_script_name(
            pool,
            &format!("{}/{}", folder_display_name(&resolved_folder), base_name),
            existing_by_source.get(&source_key).map(String::as_str),
        )
        .await?;
        let filename = file_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("script")
            .to_string();
        let language = infer_script_language(&file_path);

        let script_id = if let Some(existing_id) = existing_by_source.get(&source_key) {
            sqlx::query(
                "UPDATE scripts SET name = ?, filename = ?, source_path = ?, language = ?, collection_id = ? WHERE id = ?",
            )
            .bind(&display_name)
            .bind(&filename)
            .bind(&source_path)
            .bind(language)
            .bind(&collection_id)
            .bind(existing_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            existing_id.clone()
        } else {
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO scripts (id, name, filename, source_path, language, parameters, webhook_token, collection_id, description) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, '')",
            )
            .bind(&id)
            .bind(&display_name)
            .bind(&filename)
            .bind(&source_path)
            .bind(language)
            .bind(Uuid::new_v4().simple().to_string())
            .bind(&collection_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
            id
        };

        linked_scripts.push(LinkedScriptSummary {
            id: script_id,
            name: display_name,
        });
    }

    for (source_key, script_id) in existing_by_source {
        if !active_source_paths.contains(&source_key) {
            sqlx::query("DELETE FROM scripts WHERE id = ?")
                .bind(script_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(OpenFolderResult {
        collection: read_collection_record(pool, &collection_id).await?,
        imported_count: linked_scripts.len(),
        scripts: linked_scripts,
    })
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

fn supported_script_extension(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.to_ascii_lowercase()),
        Some(ext) if matches!(ext.as_str(), "py" | "js" | "ts" | "sh" | "ps1" | "bat" | "cmd" | "rb")
    )
}

fn path_to_display_string(path: &Path) -> String {
    let raw = path.to_string_lossy().to_string();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn should_skip_folder(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some("node_modules" | ".git" | ".hg" | ".svn" | "__pycache__" | ".venv" | "venv" | "env" | ".env" | "envs")
    )
}

fn list_supported_folder_scripts(root: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
        let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                if !should_skip_folder(&path) {
                    visit(&path, files)?;
                }
            } else if path.is_file() && supported_script_extension(&path) {
                files.push(path);
            }
        }
        Ok(())
    }

    let mut files = Vec::new();
    visit(root, &mut files)?;
    files.sort();
    Ok(files)
}

fn folder_display_name(folder: &Path) -> String {
    folder
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("Imported Folder")
        .to_string()
}

fn build_linked_script_name(folder: &Path, file: &Path) -> String {
    let relative = file.strip_prefix(folder).unwrap_or(file);
    let mut without_ext = relative.to_path_buf();
    without_ext.set_extension("");
    without_ext
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect::<Vec<_>>()
        .join("/")
}

fn infer_script_language(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("py") => "python",
        Some("js" | "ts") => "node",
        Some("sh" | "ps1" | "bat" | "cmd") => "shell",
        Some("rb") => "custom",
        _ => "custom",
    }
}

fn normalize_source_path_key(path: &str) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path));
    let raw = resolved.to_string_lossy().to_string();
    if cfg!(windows) {
        raw.to_ascii_lowercase()
    } else {
        raw
    }
}

pub(crate) fn assert_canonical_source_inside(folder: &Path, file: &Path) -> Result<(), String> {
    let resolved_folder = fs::canonicalize(folder)
        .map_err(|e| format!("Linked collection folder is unavailable: {e}"))?;
    // The file may not exist yet when saving new content; canonicalize the
    // parent instead so containment still holds for fresh files.
    let resolved_file = fs::canonicalize(file).or_else(|_| {
        let parent = file.parent().unwrap_or(Path::new("."));
        let resolved_parent = fs::canonicalize(parent)?;
        let file_name = file.file_name().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "missing file name")
        })?;
        Ok::<PathBuf, std::io::Error>(resolved_parent.join(file_name))
    })
    .map_err(|e| format!("Canonical script source is unavailable: {e}"))?;
    if !resolved_file.starts_with(&resolved_folder) {
        return Err(
            "Canonical script source must stay inside the linked collection folder".to_string(),
        );
    }
    Ok(())
}

async fn load_script_collection_folder(
    pool: &SqlitePool,
    collection_id: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(collection_id) = collection_id else {
        return Ok(None);
    };
    let folder: Option<Option<String>> =
        sqlx::query_scalar("SELECT folder_path FROM collections WHERE id = ?")
            .bind(collection_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(folder.flatten().filter(|path| !path.trim().is_empty()))
}

/// Linked-folder scripts keep their canonical content on disk; the DB content
/// column stays NULL. Resolve the file content with a containment check
/// against the linked collection folder, mirroring the old desktop runtime.
async fn resolve_script_source_content(
    pool: &SqlitePool,
    script: &Script,
) -> Result<Option<String>, String> {
    let Some(source_path) = script.source_path.as_deref() else {
        return Ok(None);
    };
    if !script.source_available {
        return Err("Canonical script source is unavailable".to_string());
    }
    let path = PathBuf::from(source_path);
    if !path.is_file() {
        return Ok(Some(String::new()));
    }
    if let Some(folder) = load_script_collection_folder(pool, script.collection_id.as_deref()).await? {
        assert_canonical_source_inside(Path::new(&folder), &path)?;
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| format!("Failed to read canonical script source: {e}"))
}

async fn unique_script_name(
    pool: &SqlitePool,
    base_name: &str,
    current_script_id: Option<&str>,
) -> Result<String, String> {
    let mut candidate = base_name.to_string();
    let mut suffix = 2;

    loop {
        let existing: Option<String> = sqlx::query_scalar("SELECT id FROM scripts WHERE name = ?")
            .bind(&candidate)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

        match (existing.as_deref(), current_script_id) {
            (None, _) => return Ok(candidate),
            (Some(existing_id), Some(current_id)) if existing_id == current_id => return Ok(candidate),
            _ => {
                candidate = format!("{base_name} ({suffix})");
                suffix += 1;
            }
        }
    }
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
    async fn webhook_controls_update_script_security_fields() {
        let pool = test_pool().await;
        let script = create_script_record(
            &pool,
            CreateScriptPayload {
                name: "Webhooked".to_string(),
                description: None,
                sync_to_gist: None,
                sync_to_gist_camel: None,
                content: Some("print('webhook')".to_string()),
                language: Some("python".to_string()),
                interpreter: None,
                parameters: None,
                collection_id: None,
                collection_id_camel: None,
            },
        )
        .await
        .expect("create script");

        let token = regenerate_webhook_record(&pool, &script.id)
            .await
            .expect("regenerate webhook")
            .webhook_token;
        assert_eq!(token.len(), 32);

        let stored_token: Option<String> =
            sqlx::query_scalar("SELECT webhook_token FROM scripts WHERE id = ?")
                .bind(&script.id)
                .fetch_one(&pool)
                .await
                .expect("read webhook token");
        assert_eq!(stored_token.as_deref(), Some(token.as_str()));

        let secret = regenerate_webhook_secret_record(&pool, &script.id)
            .await
            .expect("regenerate webhook secret")
            .webhook_secret;
        let toggle = toggle_webhook_signature_record(
            &pool,
            ToggleWebhookSignaturePayload {
                script_id: script.id.clone(),
                require_signature: true,
            },
        )
        .await
        .expect("toggle signature");
        assert!(toggle.require_webhook_signature);
        assert_eq!(toggle.webhook_secret, None);

        let read_back = read_script_record(&pool, &script.id)
            .await
            .expect("read script");
        assert!(read_back.require_webhook_signature);
        assert!(read_back.webhook_secret_set);

        let stored_secret: Option<String> =
            sqlx::query_scalar("SELECT webhook_secret FROM scripts WHERE id = ?")
                .bind(&script.id)
                .fetch_one(&pool)
                .await
                .expect("read webhook secret");
        assert_eq!(stored_secret.as_deref(), Some(secret.as_str()));
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
    async fn open_folder_links_supported_scripts_as_temporary_workspace() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-open-folder-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join("nested")).unwrap();
        std::fs::write(root.join("main.py"), "print('ok')").unwrap();
        std::fs::write(root.join("nested").join("tool.ps1"), "Write-Host ok").unwrap();
        std::fs::write(root.join("notes.txt"), "not a script").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("temporary".to_string()),
                collection_name: None,
                collection_name_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(true),
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");

        assert!(result.collection.is_temporary);
        assert_eq!(result.collection.folder_path.as_deref(), Some(root.to_string_lossy().as_ref()));
        assert_eq!(result.collection.runtime_preset, "python");
        assert!(result.collection.python_toolchain_enabled);
        assert_eq!(result.imported_count, 2);
        assert_eq!(result.scripts.len(), 2);

        let stored = load_scripts(&pool).await.unwrap();
        assert_eq!(stored.len(), 2);
        assert!(stored.iter().all(|script| script.source_path.is_some()));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn open_folder_accepts_renderer_camel_case_payload() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-open-folder-camel-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("hello-smoke.py"), "print('ok')").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: None,
                folder_path_camel: Some(root.to_string_lossy().to_string()),
                mode: Some("temporary".to_string()),
                collection_name: None,
                collection_name_camel: None,
                runtime_preset: None,
                runtime_preset_camel: Some("general".to_string()),
                python_toolchain_enabled: None,
                python_toolchain_enabled_camel: Some(false),
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder from camelCase payload");

        assert!(result.collection.is_temporary);
        assert_eq!(result.collection.folder_path.as_deref(), Some(root.to_string_lossy().as_ref()));
        assert_eq!(result.collection.runtime_preset, "general");
        assert!(!result.collection.python_toolchain_enabled);
        assert_eq!(result.imported_count, 1);
        let folder_display = root.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        assert_eq!(result.scripts[0].name, format!("{}/hello-smoke", folder_display));

        let _ = std::fs::remove_dir_all(&root);
    }

    async fn link_single_script_folder(file_content: &str) -> (SqlitePool, PathBuf, String) {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-linked-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("linked.py"), file_content).unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("temporary".to_string()),
                collection_name: None,
                collection_name_camel: None,
                runtime_preset: None,
                runtime_preset_camel: None,
                python_toolchain_enabled: None,
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");

        (pool, root, result.scripts[0].id.clone())
    }

    #[tokio::test]
    async fn read_script_resolves_linked_source_content() {
        let (pool, root, script_id) =
            link_single_script_folder("print('from canonical file')\n").await;

        let script = read_script_record(&pool, &script_id).await.expect("read script");
        assert_eq!(script.content.as_deref(), Some("print('from canonical file')\n"));

        // The DB content column stays empty: the file is the source of truth.
        let stored: Option<Option<String>> =
            sqlx::query_scalar("SELECT content FROM scripts WHERE id = ?")
                .bind(&script_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored.flatten().as_deref(), Some(""));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn save_script_writes_linked_source_file() {
        let (pool, root, script_id) = link_single_script_folder("print('v1')\n").await;

        let updated = save_script_record(
            &pool,
            SaveScriptPayload {
                id: script_id.clone(),
                name: "renamed linked".to_string(),
                content: "print('v2 from editor')\n".to_string(),
                sync_to_gist: Some(false),
                language: None,
                interpreter: None,
                parameters: None,
                timeout_ms: None,
                collection_id: None,
            },
        )
        .await
        .expect("save linked script");

        assert_eq!(updated.content.as_deref(), Some("print('v2 from editor')\n"));
        assert_eq!(
            std::fs::read_to_string(root.join("linked.py")).unwrap(),
            "print('v2 from editor')\n"
        );
        let stored: Option<Option<String>> =
            sqlx::query_scalar("SELECT content FROM scripts WHERE id = ?")
                .bind(&script_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(stored.flatten().as_deref(), Some(""));
        let snapshots: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM script_versions WHERE script_id = ?")
                .bind(&script_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(snapshots, 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn save_script_rejects_source_outside_linked_folder() {
        let (pool, root, script_id) = link_single_script_folder("print('v1')\n").await;
        let outside = std::env::temp_dir().join(format!("sm-outside-{}.py", Uuid::new_v4()));
        std::fs::write(&outside, "print('outside')").unwrap();

        sqlx::query("UPDATE scripts SET source_path = ? WHERE id = ?")
            .bind(outside.to_string_lossy().to_string())
            .bind(&script_id)
            .execute(&pool)
            .await
            .unwrap();

        let error = save_script_record(
            &pool,
            SaveScriptPayload {
                id: script_id,
                name: "escape attempt".to_string(),
                content: "print('nope')".to_string(),
                sync_to_gist: None,
                language: None,
                interpreter: None,
                parameters: None,
                timeout_ms: None,
                collection_id: None,
            },
        )
        .await
        .expect_err("save must reject source outside the linked folder");
        assert!(error.contains("inside the linked collection folder"));

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_file(&outside);
    }

    #[tokio::test]
    async fn inspect_collection_workspace_returns_linked_folder_state() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-collection-workspace-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".venv").join("Scripts")).unwrap();
        std::fs::write(root.join(".venv").join("Scripts").join("python.exe"), "").unwrap();
        std::fs::write(root.join("main.py"), "print('ok')").unwrap();
        std::fs::write(root.join("pyproject.toml"), "[project]\nname = \"demo\"").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("collection".to_string()),
                collection_name: Some("Workspace".to_string()),
                collection_name_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(true),
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");

        let status = inspect_collection_workspace_record(&pool, &result.collection.id)
            .await
            .expect("inspect collection workspace");

        assert_eq!(status.collection.id, result.collection.id);
        assert_eq!(status.workspace_path.as_deref(), Some(root.to_string_lossy().as_ref()));
        assert!(status.has_venv);
        assert_eq!(status.manifests, vec!["pyproject.toml".to_string()]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn canonical_recovery_drafts_save_list_and_discard() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-canonical-drafts-{}", Uuid::new_v4()));
        let source = root.join("main.py");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&source, "print('canonical')").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("collection".to_string()),
                collection_name: Some("Canonical".to_string()),
                collection_name_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(false),
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");
        let script_id = result.scripts[0].id.clone();

        let saved = save_canonical_recovery_draft_record(
            &pool,
            SaveCanonicalRecoveryDraftPayload {
                script_id: script_id.clone(),
                source_path: source.to_string_lossy().to_string(),
                source_revision: "rev-1".to_string(),
                content: "print('unsaved')".to_string(),
            },
        )
        .await
        .expect("save draft");
        assert_eq!(saved.script_id, script_id);
        assert_eq!(saved.content, "print('unsaved')");

        let drafts = list_canonical_recovery_drafts_record(&pool, &saved.script_id)
            .await
            .expect("list drafts");
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].id, saved.id);

        discard_canonical_recovery_draft_record(&pool, &saved.id)
            .await
            .expect("discard draft");
        assert!(list_canonical_recovery_drafts_record(&pool, &saved.script_id)
            .await
            .expect("list drafts")
            .is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn rescan_canonical_folder_refreshes_linked_scripts() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-rescan-folder-{}", Uuid::new_v4()));
        let first = root.join("first.py");
        let second = root.join("second.py");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(&first, "print('first')").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("collection".to_string()),
                collection_name: Some("Rescan".to_string()),
                collection_name_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(false),
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");
        std::fs::remove_file(&first).unwrap();
        std::fs::write(&second, "print('second')").unwrap();

        let rescanned = rescan_canonical_folder_record(&pool, &result.collection.id)
            .await
            .expect("rescan folder");
        assert_eq!(rescanned.imported_count, 1);
        assert_eq!(rescanned.scripts.len(), 1);

        let stored = load_scripts(&pool).await.expect("load scripts");
        assert_eq!(stored.len(), 1);
        assert!(stored[0]
            .source_path
            .as_deref()
            .expect("source path")
            .ends_with("second.py"));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn manage_collection_python_env_updates_existing_venv_metadata() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-manage-venv-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".venv").join("Scripts")).unwrap();
        std::fs::write(root.join(".venv").join("Scripts").join("python.exe"), "").unwrap();
        std::fs::write(root.join("main.py"), "print('ok')").unwrap();

        let result = open_folder_record(
            &pool,
            OpenFolderPayload {
                folder_path: Some(root.to_string_lossy().to_string()),
                folder_path_camel: None,
                mode: Some("collection".to_string()),
                collection_name: Some("Python Workspace".to_string()),
                collection_name_camel: None,
                runtime_preset: Some("python".to_string()),
                runtime_preset_camel: None,
                python_toolchain_enabled: Some(false),
                python_toolchain_enabled_camel: None,
                create_venv_if_missing: None,
                create_venv_if_missing_camel: None,
            },
        )
        .await
        .expect("open folder");

        let status = manage_collection_python_env_record(
            &pool,
            ManageCollectionPythonEnvPayload {
                collection_id: result.collection.id,
                recreate: Some(false),
            },
        )
        .await
        .expect("manage python env");

        assert!(status.has_venv);
        assert!(status.collection.python_toolchain_enabled);
        assert_eq!(status.collection.python_venv_path, status.venv_path);
        assert_eq!(status.collection.python_interpreter_path, status.interpreter_path);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn inspect_folder_detects_python_workspace_state() {
        let root = std::env::temp_dir().join(format!("sm-inspect-folder-{}", Uuid::new_v4()));
        std::fs::create_dir_all(root.join(".venv").join("Scripts")).unwrap();
        std::fs::write(root.join(".venv").join("Scripts").join("python.exe"), "").unwrap();
        std::fs::write(root.join("requirements.txt"), "pytest").unwrap();

        let inspection = inspect_folder_record(&root.to_string_lossy()).expect("inspect folder");

        assert!(inspection.has_venv);
        assert_eq!(inspection.venv_path.as_deref(), Some(root.join(".venv").to_string_lossy().as_ref()));
        assert_eq!(
            inspection.interpreter_path.as_deref(),
            Some(root.join(".venv").join("Scripts").join("python.exe").to_string_lossy().as_ref())
        );
        assert_eq!(inspection.manifests, vec!["requirements.txt".to_string()]);

        let _ = std::fs::remove_dir_all(&root);
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
