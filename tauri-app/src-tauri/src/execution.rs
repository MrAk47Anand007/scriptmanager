use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::Arc;
use tauri::{command, Window};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use std::process::Stdio;

#[command]
pub async fn execute_api_request(
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<Value, String> {
    let client = Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => return Err("Unsupported method".into()),
    };

    for (k, v) in headers {
        req = req.header(k, v);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| e.to_string())?;

    let status = res.status().as_u16();
    let res_headers: HashMap<String, String> = res
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();

    let text = res.text().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "status": status,
        "headers": res_headers,
        "body": text
    }))
}

#[command]
pub fn execute_js_script(code: String) -> Result<String, String> {
    let mut context = boa_engine::Context::default();

    let result = context.eval(boa_engine::Source::from_bytes(&code));

    match result {
        Ok(res) => Ok(res.display().to_string()),
        Err(e) => Err(format!("Execution error: {}", e)),
    }
}

// --- Script Execution ---

pub struct ExecutionState {
    pub cancels: Mutex<HashMap<String, Arc<tokio::sync::Notify>>>,
    pub builds_dir: PathBuf,
}

impl Default for ExecutionState {
    fn default() -> Self {
        Self {
            cancels: Mutex::new(HashMap::new()),
            builds_dir: PathBuf::from("builds"),
        }
    }
}

impl ExecutionState {
    pub fn new(builds_dir: PathBuf) -> Self {
        Self {
            cancels: Mutex::new(HashMap::new()),
            builds_dir,
        }
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct RunScriptPayload {
    #[serde(rename = "scriptId")]
    pub script_id: String,
    #[serde(rename = "paramValues")]
    pub param_values: Option<HashMap<String, String>>,
    #[serde(rename = "buildId")]
    pub build_id: Option<String>,
    #[serde(rename = "triggeredBy", default)]
    pub triggered_by: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct RunScriptResult {
    #[serde(rename = "buildId")]
    pub build_id: String,
    pub status: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BuildEvent {
    Started {
        build_id: String,
    },
    Line {
        build_id: String,
        line: String,
    },
    Done {
        build_id: String,
        status: String,
        exit_code: Option<i64>,
    },
    Error {
        build_id: String,
        message: String,
    },
}

#[derive(Debug, sqlx::FromRow)]
#[allow(dead_code)]
struct ScriptForExec {
    id: String,
    name: String,
    filename: String,
    language: String,
    interpreter: Option<String>,
    content: Option<String>,
    timeout_ms: Option<i64>,
    source_path: Option<String>,
    collection_id: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
struct ScriptCollectionForExec {
    folder_path: Option<String>,
    python_toolchain_enabled: bool,
    python_interpreter_path: Option<String>,
}

#[derive(Debug)]
struct ScriptExecutionTarget {
    script_path: PathBuf,
    working_dir: PathBuf,
    interpreter_override: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
#[allow(dead_code)]
struct EnvVarRowForExec {
    key: String,
    value: String,
    is_secret: i64,
}

/// Linked-folder scripts execute their canonical source file inside the linked
/// folder; managed scripts are materialized into a scratch build directory.
async fn resolve_script_execution_target(
    pool: &sqlx::SqlitePool,
    script: &ScriptForExec,
    builds_dir: &Path,
    build_id: &str,
) -> Result<ScriptExecutionTarget, String> {
    if let Some(source_path) = script.source_path.as_deref() {
        let path = PathBuf::from(source_path);
        if !path.is_file() {
            return Err(format!("Script file not found: {}", path.display()));
        }
        let mut interpreter_override = None;
        if let Some(collection_id) = script.collection_id.as_deref() {
            let collection: Option<ScriptCollectionForExec> = sqlx::query_as(
                "SELECT folder_path, python_toolchain_enabled, python_interpreter_path FROM collections WHERE id = ?",
            )
            .bind(collection_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
            if let Some(collection) = collection {
                if let Some(folder) = collection
                    .folder_path
                    .as_deref()
                    .filter(|folder| !folder.trim().is_empty())
                {
                    crate::commands::assert_canonical_source_inside(Path::new(folder), &path)?;
                }
                if collection.python_toolchain_enabled {
                    interpreter_override = collection.python_interpreter_path;
                }
            }
        }
        let working_dir = path
            .parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| builds_dir.to_path_buf());
        return Ok(ScriptExecutionTarget {
            script_path: path,
            working_dir,
            interpreter_override,
        });
    }

    let script_dir = builds_dir.join(build_id);
    std::fs::create_dir_all(&script_dir).map_err(|e| e.to_string())?;
    let script_path = script_dir.join(&script.filename);
    std::fs::write(
        &script_path,
        script.content.as_deref().unwrap_or_default(),
    )
    .map_err(|e| e.to_string())?;
    Ok(ScriptExecutionTarget {
        script_path,
        working_dir: script_dir,
        interpreter_override: None,
    })
}

fn resolve_interpreter(language: &str, interpreter: Option<&str>) -> (String, Vec<String>) {
    let is_windows = cfg!(target_os = "windows");
    match language {
        "python" => {
            let cmd = interpreter
                .map(str::to_string)
                .unwrap_or_else(|| if is_windows { "python" } else { "python3" }.to_string());
            (cmd, vec!["-u".to_string()])
        }
        "node" | "javascript" | "typescript" => ("node".to_string(), vec![]),
        "shell" | "bash" => {
            if is_windows {
                ("cmd".to_string(), vec!["/c".to_string()])
            } else {
                ("bash".to_string(), vec![])
            }
        }
        "powershell" => {
            if is_windows {
                ("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-File".to_string()])
            } else {
                ("pwsh".to_string(), vec!["-NoLogo".to_string(), "-File".to_string()])
            }
        }
        "custom" => {
            let cmd = interpreter
                .unwrap_or(if is_windows { "python" } else { "python3" });
            (cmd.to_string(), vec![])
        }
        _ => {
            let cmd = if is_windows { "python" } else { "python3" }.to_string();
            (cmd, vec!["-u".to_string()])
        }
    }
}

fn sanitize_env_key(key: &str) -> String {
    key.replace(|c: char| !c.is_ascii_alphanumeric() && c != '_', "_")
        .to_uppercase()
}

fn emit_line_event<E: tauri::Emitter<tauri::Wry>>(window: &E, build_id: &str, line: &str) {
    let _ = window.emit(
        "build-event",
        BuildEvent::Line {
            build_id: build_id.to_string(),
            line: line.to_string(),
        },
    );
}

fn emit_error_event<E: tauri::Emitter<tauri::Wry>>(window: &E, build_id: &str, message: &str) {
    let _ = window.emit(
        "build-event",
        BuildEvent::Error {
            build_id: build_id.to_string(),
            message: message.to_string(),
        },
    );
}

fn emit_done_event<E: tauri::Emitter<tauri::Wry>>(window: &E, build_id: &str, status: &str, exit_code: Option<i64>) {
    let _ = window.emit(
        "build-event",
        BuildEvent::Done {
            build_id: build_id.to_string(),
            status: status.to_string(),
            exit_code,
        },
    );
}

fn emit_started_event<E: tauri::Emitter<tauri::Wry>>(window: &E, build_id: &str) {
    let _ = window.emit(
        "build-event",
        BuildEvent::Started {
            build_id: build_id.to_string(),
        },
    );
}

#[command]
pub async fn run_script(
    pool: tauri::State<'_, sqlx::SqlitePool>,
    window: Window,
    exec_state: tauri::State<'_, ExecutionState>,
    payload: RunScriptPayload,
) -> Result<RunScriptResult, String> {
    run_script_core((*pool).clone(), window, &exec_state, payload).await
}

/// Shared execution path used by manual runs and the scheduler.
/// `triggered_by` distinguishes build records ('manual' vs 'schedule').
pub async fn run_script_core<E>(
    pool: sqlx::SqlitePool,
    window: E,
    exec_state: &ExecutionState,
    payload: RunScriptPayload,
) -> Result<RunScriptResult, String>
where
    E: tauri::Emitter<tauri::Wry> + Clone + Send + Sync + 'static,
{
    let build_id = payload.build_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let script_id = payload.script_id.clone();

    let builds_dir = exec_state.builds_dir.clone();

    // Create the build record
    sqlx::query(
        "INSERT INTO builds (id, script_id, status, triggered_by, started_at) VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP)",
    )
    .bind(&build_id)
    .bind(&script_id)
    .bind(payload.triggered_by.as_deref().unwrap_or("manual"))
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Look up the script
    let script: Option<ScriptForExec> = sqlx::query_as(
        "SELECT id, name, filename, language, interpreter, content, timeout_ms, source_path, collection_id FROM scripts WHERE id = ?",
    )
    .bind(&script_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let script = match script {
        Some(s) => s,
        None => {
            let _ = sqlx::query(
                "UPDATE builds SET status = 'failure', exit_code = -1, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(&build_id)
            .execute(&pool)
            .await;
            emit_error_event(&window, &build_id, "Script not found");
            emit_done_event(&window, &build_id, "failure", Some(-1));
            return Ok(RunScriptResult {
                build_id,
                status: "failed".to_string(),
            });
        }
    };

    // Resolve the execution target: linked scripts run their canonical file in
    // the linked folder; managed scripts run from a scratch build directory.
    let target = match resolve_script_execution_target(&pool, &script, &builds_dir, &build_id).await
    {
        Ok(target) => target,
        Err(message) => {
            let _ = sqlx::query(
                "UPDATE builds SET status = 'failure', exit_code = 1, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(&build_id)
            .execute(&pool)
            .await;
            emit_error_event(&window, &build_id, &message);
            emit_done_event(&window, &build_id, "failure", Some(1));
            return Ok(RunScriptResult {
                build_id,
                status: "failed".to_string(),
            });
        }
    };
    let script_path = target.script_path.clone();

    // Set up log file in the scratch build directory (never inside a linked folder)
    let log_dir = builds_dir.join(&build_id);
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_file_path = log_dir.join(format!("{}.log", &build_id));
    let log_file = log_file_path.to_string_lossy().to_string();

    // Store log file path in build record
    let _ = sqlx::query("UPDATE builds SET log_file = ? WHERE id = ?")
        .bind(&log_file)
        .bind(&build_id)
        .execute(&pool)
        .await;

    // Resolve interpreter (collection venv interpreter wins for python toolchains)
    let (interpreter, base_args) = resolve_interpreter(
        &script.language,
        target
            .interpreter_override
            .as_deref()
            .or(script.interpreter.as_deref()),
    );
    let mut args = base_args.clone();
    args.push(script_path.to_string_lossy().to_string());

    // Load script env vars from DB
    let script_envs: Vec<EnvVarRowForExec> = sqlx::query_as(
        "SELECT key, value, is_secret FROM script_env_vars WHERE script_id = ?",
    )
    .bind(&script_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Build the environment for the child process
    let mut env = std::env::vars().collect::<HashMap<String, String>>();
    env.insert("PYTHONUNBUFFERED".to_string(), "1".to_string());

    for env_var in script_envs {
        env.insert(sanitize_env_key(&env_var.key), env_var.value);
    }

    if let Some(param_values) = &payload.param_values {
        for (key, value) in param_values {
            env.insert(sanitize_env_key(key), value.clone());
        }
    }

    // Set up cancellation via Notify
    let cancel_notify = Arc::new(tokio::sync::Notify::new());
    {
        let mut cancels = exec_state.cancels.lock().unwrap();
        cancels.insert(build_id.clone(), cancel_notify.clone());
    }

    // Emit 'started' event
    emit_started_event(&window, &build_id);

    // Spawn the child process
    let timeout_ms = script.timeout_ms.unwrap_or(30_000);
    let mut child = match Command::new(&interpreter)
        .args(&args)
        .current_dir(&target.working_dir)
        .envs(&env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = sqlx::query(
                "UPDATE builds SET status = 'failure', exit_code = -1, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(&build_id)
            .execute(&pool)
            .await;
            emit_error_event(&window, &build_id, &format!("Failed to start process: {e}"));
            emit_done_event(&window, &build_id, "failure", Some(-1));
            exec_state.cancels.lock().unwrap().remove(&build_id);
            return Ok(RunScriptResult {
                build_id,
                status: "failed".to_string(),
            });
        }
    };

    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    let pool_for_bg = pool.clone();
    let window_for_bg = window.clone();
    let bg_build_id = build_id.clone();
    let bg_log_file = log_file.clone();
    let bg_script_id = script_id.clone();

    // Spawn background task for output streaming and process management
    tauri::async_runtime::spawn(async move {
        let mut output_buffer = String::new();
        let mut was_cancelled = false;
        let mut timed_out = false;
        let mut exit_result: Option<std::io::Result<std::process::ExitStatus>> = None;

        let deadline = tokio::time::Instant::now()
            + tokio::time::Duration::from_millis(timeout_ms as u64);
        let timeout_sleep = tokio::time::sleep_until(deadline);
        tokio::pin!(timeout_sleep);

        loop {
            tokio::select! {
                _ = cancel_notify.notified() => {
                    was_cancelled = true;
                    let _ = child.kill().await;
                    break;
                }
                _ = &mut timeout_sleep => {
                    timed_out = true;
                    let msg = format!(
                        "\n[ScriptManager] Execution timed out after {}s. Killing process...\n",
                        timeout_ms / 1000
                    );
                    output_buffer.push_str(&msg);
                    emit_line_event(&window_for_bg, &bg_build_id, &msg);
                    let _ = child.kill().await;
                    break;
                }
                result = async {
                    if let Some(ref mut s) = stdout {
                        let mut buf = [0u8; 1024];
                        match s.read(&mut buf).await {
                            Ok(0) => None,
                            Ok(n) => Some(String::from_utf8_lossy(&buf[..n]).into_owned()),
                            Err(_) => None,
                        }
                    } else {
                        std::future::pending::<Option<String>>().await
                    }
                } => {
                    if let Some(line) = result {
                        output_buffer.push_str(&line);
                        emit_line_event(&window_for_bg, &bg_build_id, &line);
                    } else {
                        stdout = None;
                    }
                }
                result = async {
                    if let Some(ref mut s) = stderr {
                        let mut buf = [0u8; 1024];
                        match s.read(&mut buf).await {
                            Ok(0) => None,
                            Ok(n) => Some(String::from_utf8_lossy(&buf[..n]).into_owned()),
                            Err(_) => None,
                        }
                    } else {
                        std::future::pending::<Option<String>>().await
                    }
                } => {
                    if let Some(line) = result {
                        output_buffer.push_str(&line);
                        emit_line_event(&window_for_bg, &bg_build_id, &line);
                    } else {
                        stderr = None;
                    }
                }
                status = child.wait() => {
                    exit_result = Some(status);
                    break;
                }
            }
        }

        // Determine final status
        let (status_str, exit_code) = if was_cancelled {
            ("cancelled".to_string(), None)
        } else if timed_out {
            ("timeout".to_string(), None)
        } else {
            match exit_result.and_then(|res| res.ok()) {
                Some(es) => {
                    let code = es.code().map(|c| c as i64);
                    if es.success() {
                        ("success".to_string(), code)
                    } else {
                        ("failure".to_string(), code)
                    }
                }
                None => ("failure".to_string(), None),
            }
        };

        // Write log file
        let log_path = Path::new(&bg_log_file);
        if let Some(parent) = log_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(log_path, &output_buffer);

        // Finalize build record
        let _ = sqlx::query(
            "UPDATE builds SET status = ?, exit_code = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(&status_str)
        .bind(exit_code)
        .bind(&bg_build_id)
        .execute(&pool_for_bg)
        .await;

        // Update script last_run
        let _ = sqlx::query("UPDATE scripts SET last_run = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&bg_script_id)
            .execute(&pool_for_bg)
            .await;

        // Emit done event
        emit_done_event(&window_for_bg, &bg_build_id, &status_str, exit_code);
    });

    Ok(RunScriptResult {
        build_id,
        status: "started".to_string(),
    })
}

#[command]
pub async fn cancel_run(
    exec_state: tauri::State<'_, ExecutionState>,
    build_id: String,
) -> Result<serde_json::Value, String> {
    let notify = exec_state.cancels.lock().unwrap().remove(&build_id);

    match notify {
        Some(notify) => {
            notify.notify_one();
            Ok(serde_json::json!({ "ok": true, "buildId": build_id }))
        }
        None => Ok(serde_json::json!({
            "ok": false,
            "buildId": build_id,
            "reason": "not running"
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::ensure_schema;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> sqlx::SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("create in-memory sqlite pool");
        ensure_schema(&pool).await.expect("ensure schema");
        pool
    }

    fn exec_script(
        source_path: Option<String>,
        collection_id: Option<String>,
        content: Option<&str>,
    ) -> ScriptForExec {
        ScriptForExec {
            id: "script-1".to_string(),
            name: "demo".to_string(),
            filename: "demo.py".to_string(),
            language: "python".to_string(),
            interpreter: None,
            content: content.map(str::to_string),
            timeout_ms: None,
            source_path,
            collection_id,
        }
    }

    #[tokio::test]
    async fn execution_target_runs_linked_source_in_its_folder() {
        let pool = test_pool().await;
        let root = std::env::temp_dir().join(format!("sm-exec-target-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("linked.py");
        std::fs::write(&source, "print('canonical')").unwrap();

        let collection_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO collections (id, name, runtime_preset, python_toolchain_enabled, folder_path) VALUES (?, ?, 'general', 1, ?)",
        )
        .bind(&collection_id)
        .bind("Linked")
        .bind(root.to_string_lossy().to_string())
        .execute(&pool)
        .await
        .unwrap();

        let builds_dir = std::env::temp_dir().join("sm-exec-target-builds");
        let target = resolve_script_execution_target(
            &pool,
            &exec_script(
                Some(source.to_string_lossy().to_string()),
                Some(collection_id.clone()),
                None,
            ),
            &builds_dir,
            "build-1",
        )
        .await
        .expect("resolve linked target");

        assert_eq!(target.script_path, source);
        assert_eq!(target.working_dir, root);

        // Python toolchain collections surface their recorded venv interpreter.
        let venv_python = root.join(".venv").join("Scripts").join("python.exe");
        sqlx::query("UPDATE collections SET python_interpreter_path = ? WHERE id = ?")
            .bind(venv_python.to_string_lossy().to_string())
            .bind(&collection_id)
            .execute(&pool)
            .await
            .unwrap();
        let target = resolve_script_execution_target(
            &pool,
            &exec_script(
                Some(source.to_string_lossy().to_string()),
                Some(collection_id),
                None,
            ),
            &builds_dir,
            "build-2",
        )
        .await
        .expect("resolve linked target with venv");
        assert_eq!(target.interpreter_override.as_deref(), Some(venv_python.to_string_lossy().as_ref()));

        let _ = std::fs::remove_dir_all(&root);
    }

    #[tokio::test]
    async fn execution_target_materializes_managed_scripts_in_builds_dir() {
        let pool = test_pool().await;
        let builds_dir = std::env::temp_dir().join(format!("sm-exec-managed-{}", uuid::Uuid::new_v4()));

        let target = resolve_script_execution_target(
            &pool,
            &exec_script(None, None, Some("print('managed')")),
            &builds_dir,
            "build-3",
        )
        .await
        .expect("resolve managed target");

        assert_eq!(target.script_path, builds_dir.join("build-3").join("demo.py"));
        assert_eq!(target.working_dir, builds_dir.join("build-3"));
        assert_eq!(
            std::fs::read_to_string(&target.script_path).unwrap(),
            "print('managed')"
        );

        let _ = std::fs::remove_dir_all(&builds_dir);
    }

    #[tokio::test]
    async fn execution_target_rejects_missing_linked_source() {
        let pool = test_pool().await;
        let missing = std::env::temp_dir()
            .join(format!("sm-exec-missing-{}", uuid::Uuid::new_v4()))
            .join("gone.py");

        let error = resolve_script_execution_target(
            &pool,
            &exec_script(Some(missing.to_string_lossy().to_string()), None, None),
            Path::new("builds"),
            "build-4",
        )
        .await
        .expect_err("missing source must fail");
        assert!(error.contains("Script file not found"));
    }

    #[test]
    fn resolve_interpreter_matches_server_behavior() {
        let (cmd, args) = resolve_interpreter("python", None);
        assert!(cmd == "python" || cmd == "python3");
        assert!(args.contains(&"-u".to_string()));

        let (cmd, _args) = resolve_interpreter("node", None);
        assert_eq!(cmd, "node");

        let (cmd, _args) = resolve_interpreter("shell", None);
        if cfg!(target_os = "windows") {
            assert_eq!(cmd, "cmd");
        } else {
            assert_eq!(cmd, "bash");
        }

        let (cmd, _args) = resolve_interpreter("custom", Some("/usr/bin/myinterp"));
        assert_eq!(cmd, "/usr/bin/myinterp");

        let (cmd, _args) = resolve_interpreter("unknown", None);
        assert!(cmd == "python" || cmd == "python3");
    }

    #[test]
    fn sanitize_env_key_uppercases_and_replaces_invalid_chars() {
        assert_eq!(sanitize_env_key("MY_VAR"), "MY_VAR");
        assert_eq!(sanitize_env_key("my-var"), "MY_VAR");
        assert_eq!(sanitize_env_key("my var"), "MY_VAR");
        assert_eq!(sanitize_env_key("my.var"), "MY_VAR");
    }
}
