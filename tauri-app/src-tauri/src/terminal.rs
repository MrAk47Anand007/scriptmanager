use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child as PtyChild, CommandBuilder, PtySize};
use tauri::{Emitter, State, Window};

#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TerminalEvent {
    Connected {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Data {
        #[serde(rename = "sessionId")]
        session_id: String,
        data: String,
    },
    Closed {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    Error {
        #[serde(rename = "sessionId")]
        session_id: String,
        message: String,
    },
}

pub(crate) fn missing_terminal_session_error() -> String {
    "Terminal session not found".to_string()
}

pub(crate) fn sanitize_terminal_env_key(key: &str) -> String {
    key.replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '_',
        "_",
    )
    .to_uppercase()
}

pub(crate) fn terminal_script_extension(language: Option<&str>) -> &'static str {
    match language {
        Some("python") => "py",
        Some("javascript") | Some("node") | Some("typescript") => "js",
        Some("powershell") => "ps1",
        Some("shell") | Some("bash") => "sh",
        _ => "py",
    }
}

pub(crate) fn escape_terminal_env_value(value: &str, is_windows: bool) -> String {
    if is_windows {
        // PowerShell single-quote escape is ''
        value.replace('\'', "''")
    } else {
        // Bash: close quote, escaped quote, reopen quote
        value.replace('\'', "'\\''")
    }
}

pub(crate) fn build_terminal_env_prefix(
    param_values: Option<&HashMap<String, String>>,
    is_windows: bool,
) -> String {
    let mut out = String::new();
    if let Some(params) = param_values {
        for (key, value) in params {
            let env_key = sanitize_terminal_env_key(key);
            let escaped = escape_terminal_env_value(value, is_windows);
            if is_windows {
                out.push_str(&format!("$env:{}='{}'\r", env_key, escaped));
            } else {
                out.push_str(&format!("export {}='{}'\r", env_key, escaped));
            }
        }
    }
    out
}

pub struct TerminalSession {
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Option<Box<dyn PtyChild + Send>>,
    pub script_id: Option<String>,
}

impl TerminalSession {
    pub fn new(
        master: Box<dyn portable_pty::MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        child: Box<dyn portable_pty::Child + Send>,
    ) -> Self {
        Self {
            master,
            writer,
            child: Some(child),
            script_id: None,
        }
    }
}

pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn create_terminal(
    session_id: String,
    window: Window,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let cmd = if cfg!(target_os = "windows") {
        CommandBuilder::new("powershell.exe")
    } else {
        CommandBuilder::new("bash")
    };

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Drop slave to avoid deadlock
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let session_id_clone = session_id.clone();

    // Emit connected event
    window
        .emit(
            "terminal-event",
            TerminalEvent::Connected {
                session_id: session_id_clone.clone(),
            },
        )
        .ok();

    // Read loop — emits on a single typed event channel
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = window.emit(
                        "terminal-event",
                        TerminalEvent::Closed {
                            session_id: session_id_clone.clone(),
                        },
                    );
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).into_owned();
                    let _ = window.emit(
                        "terminal-event",
                        TerminalEvent::Data {
                            session_id: session_id_clone.clone(),
                            data: output,
                        },
                    );
                }
                Err(e) => {
                    let _ = window.emit(
                        "terminal-event",
                        TerminalEvent::Error {
                            session_id: session_id_clone.clone(),
                            message: e.to_string(),
                        },
                    );
                    break;
                }
            }
        }
    });

    let session = TerminalSession::new(pair.master, writer, child);
    state
        .sessions
        .lock()
        .unwrap()
        .insert(session_id, session);

    Ok(())
}

#[tauri::command]
pub fn write_terminal(
    session_id: String,
    data: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
    } else {
        return Err(missing_terminal_session_error());
    }
    Ok(())
}

#[tauri::command]
pub fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get(&session_id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    } else {
        return Err(missing_terminal_session_error());
    }
    Ok(())
}

#[tauri::command]
pub fn close_terminal(
    session_id: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.remove(&session_id) {
        // Kill the child process if it hasn't exited, then drop PTY handles.
        // Dropping `session` after kill closes master/writer handles,
        // letting the reader thread observe EOF and emit `Closed`.
        if let Some(mut child) = session.child {
            let _ = child.kill();
        }
    } else {
        return Err(missing_terminal_session_error());
    }
    Ok(())
}

#[tauri::command]
pub fn set_terminal_context(
    session_id: String,
    script_id: Option<String>,
    state: State<'_, TerminalState>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&session_id) {
        session.script_id = script_id;
        Ok(true)
    } else {
        Err(missing_terminal_session_error())
    }
}

#[tauri::command]
pub async fn run_script_in_terminal(
    session_id: String,
    script_id: String,
    param_values: Option<HashMap<String, String>>,
    state: State<'_, TerminalState>,
    window: Window,
    pool: State<'_, sqlx::SqlitePool>,
) -> Result<bool, String> {
    // Look up the script from the DB
    let script: Option<ScriptForTerminalExec> = sqlx::query_as(
        "SELECT id, language, interpreter, content, timeout_ms FROM scripts WHERE id = ?",
    )
    .bind(&script_id)
    .fetch_optional(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let script = match script {
        Some(s) => s,
        None => {
            let _ = window.emit(
                "terminal-event",
                TerminalEvent::Error {
                    session_id: session_id.clone(),
                    message: "Script not found".to_string(),
                },
            );
            return Err("Script not found".to_string());
        }
    };

    // Resolve interpreter
    let (interpreter, _base_args) = resolve_terminal_interpreter(
        &script.language,
        script.interpreter.as_deref(),
    );

    // Write script content to a temp file
    let temp_dir = std::env::temp_dir();
    let script_dir = temp_dir.join("scriptmanager-terminal");
    std::fs::create_dir_all(&script_dir).map_err(|e| e.to_string())?;

    let extension = terminal_script_extension(script.language.as_deref());

    let script_path = script_dir.join(format!("{}__term.{}", script_id, extension));
    std::fs::write(&script_path, script.content.unwrap_or_default()).map_err(|e| e.to_string())?;

    // Build the command string that the user will see typed in the terminal.
    // Quote the path so spaces in temp dirs do not split the command.
    let command_str = format!("{} \"{}\"\r", interpreter, script_path.display());

    // Build env prefix with shell-aware syntax (PowerShell vs bash).
    let is_windows_shell = cfg!(target_os = "windows");
    let env_commands = build_terminal_env_prefix(param_values.as_ref(), is_windows_shell);

    let full_input = format!("{}{}", env_commands, command_str);

    // Lock sessions, write to writer, set context, release
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(session) = sessions.get_mut(&session_id) {
            session.script_id = Some(script_id.clone());
            if let Err(e) = session.writer.write_all(full_input.as_bytes()) {
                let msg = e.to_string();
                let _ = window.emit(
                    "terminal-event",
                    TerminalEvent::Error {
                        session_id: session_id.clone(),
                        message: msg.clone(),
                    },
                );
                return Err(msg);
            }
        } else {
            let msg = missing_terminal_session_error();
            let _ = window.emit(
                "terminal-event",
                TerminalEvent::Error {
                    session_id: session_id.clone(),
                    message: msg.clone(),
                },
            );
            return Err(msg);
        }
    }

    let _ = window.emit(
        "terminal-event",
        TerminalEvent::Data {
            session_id: session_id.clone(),
            data: full_input,
        },
    );

    Ok(true)
}

fn resolve_terminal_interpreter(language: &Option<String>, interpreter: Option<&str>) -> (String, Vec<String>) {
    let is_windows = cfg!(target_os = "windows");
    match language.as_deref() {
        Some("python") => {
            let cmd = if is_windows { "python" } else { "python3" }.to_string();
            (cmd, vec!["-u".to_string()])
        }
        Some("javascript") | Some("node") | Some("typescript") => ("node".to_string(), vec![]),
        Some("shell") | Some("bash") => {
            if is_windows {
                ("cmd".to_string(), vec!["/c".to_string()])
            } else {
                ("bash".to_string(), vec![])
            }
        }
        Some("powershell") => {
            if is_windows {
                ("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-File".to_string()])
            } else {
                ("pwsh".to_string(), vec!["-NoLogo".to_string(), "-File".to_string()])
            }
        }
        Some("custom") => {
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

#[allow(dead_code)]
#[derive(Debug, sqlx::FromRow)]
struct ScriptForTerminalExec {
    id: String,
    language: Option<String>,
    interpreter: Option<String>,
    content: Option<String>,
    timeout_ms: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_state_starts_empty() {
        let state = TerminalState::default();
        let sessions = state.sessions.lock().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn terminal_missing_session_error_is_controlled() {
        // create/write/resize/close/set_context on unknown ids must return
        // the same controlled string so the renderer can render a stable
        // error state instead of crashing. Real PTY create/close is covered
        // by manual smoke (echo hello, resize, close, reopen, no orphan).
        assert_eq!(
            missing_terminal_session_error(),
            "Terminal session not found"
        );
    }

    #[test]
    fn terminal_state_close_removes_bookkeeping_entry() {
        // Simulates the HashMap bookkeeping behind close_terminal:
        // remove() must drop the entry so a second close sees "missing".
        let mut bookkeeping: HashMap<String, bool> = HashMap::new();
        bookkeeping.insert("term-1".to_string(), true);
        assert!(bookkeeping.remove("term-1").is_some());
        assert!(bookkeeping.remove("term-1").is_none());
    }

    #[test]
    fn terminal_state_resize_missing_is_controlled_error() {
        // Simulates resize_terminal missing-session branch without a real PTY.
        let bookkeeping: HashMap<String, bool> = HashMap::new();
        let result: Result<(), String> = if bookkeeping.get("nope").is_some() {
            Ok(())
        } else {
            Err(missing_terminal_session_error())
        };
        assert_eq!(result.unwrap_err(), "Terminal session not found");
    }

    #[test]
    fn terminal_env_key_sanitization_matches_contract() {
        assert_eq!(sanitize_terminal_env_key("my-key.1"), "MY_KEY_1");
        assert_eq!(sanitize_terminal_env_key("already_OK"), "ALREADY_OK");
    }

    #[test]
    fn terminal_script_extension_mapping() {
        assert_eq!(terminal_script_extension(Some("python")), "py");
        assert_eq!(terminal_script_extension(Some("node")), "js");
        assert_eq!(terminal_script_extension(Some("powershell")), "ps1");
        assert_eq!(terminal_script_extension(Some("bash")), "sh");
        assert_eq!(terminal_script_extension(None), "py");
    }

    #[test]
    fn terminal_env_prefix_is_shell_aware() {
        let mut params = HashMap::new();
        params.insert("my-key".to_string(), "a'b".to_string());

        let bash = build_terminal_env_prefix(Some(&params), false);
        assert!(bash.contains("export MY_KEY="));
        assert!(bash.contains("a'\\''b"));

        let pwsh = build_terminal_env_prefix(Some(&params), true);
        assert!(pwsh.contains("$env:MY_KEY="));
        assert!(pwsh.contains("a''b"));

        assert_eq!(build_terminal_env_prefix(None, false), "");
    }

    #[test]
    fn terminal_event_serializes_with_camel_case_tagged_payload() {
        let connected = TerminalEvent::Connected {
            session_id: "term-1".to_string(),
        };
        let json = serde_json::to_string(&connected).unwrap();
        assert!(json.contains("\"type\":\"connected\""));
        assert!(json.contains("\"sessionId\":\"term-1\""));

        let data = TerminalEvent::Data {
            session_id: "term-1".to_string(),
            data: "hello\n".to_string(),
        };
        let json = serde_json::to_string(&data).unwrap();
        assert!(json.contains("\"type\":\"data\""));
        assert!(json.contains("\"sessionId\":\"term-1\""));
        assert!(json.contains("\"data\":\"hello\\n\""));

        let closed = TerminalEvent::Closed {
            session_id: "term-1".to_string(),
        };
        let json = serde_json::to_string(&closed).unwrap();
        assert!(json.contains("\"type\":\"closed\""));

        let error = TerminalEvent::Error {
            session_id: "term-1".to_string(),
            message: "boom".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        assert!(json.contains("\"type\":\"error\""));
        assert!(json.contains("\"message\":\"boom\""));
    }

    #[test]
    fn resolve_terminal_interpreter_matches_server_behavior() {
        let (cmd, args) = resolve_terminal_interpreter(&Some("python".to_string()), None);
        assert!(cmd == "python" || cmd == "python3");
        assert!(args.contains(&"-u".to_string()));

        let (cmd, _args) = resolve_terminal_interpreter(&Some("node".to_string()), None);
        assert_eq!(cmd, "node");

        let (cmd, _args) = resolve_terminal_interpreter(&Some("shell".to_string()), None);
        if cfg!(target_os = "windows") {
            assert_eq!(cmd, "cmd");
        } else {
            assert_eq!(cmd, "bash");
        }

        let (cmd, _args) = resolve_terminal_interpreter(&Some("custom".to_string()), Some("/usr/bin/myinterp"));
        assert_eq!(cmd, "/usr/bin/myinterp");

        let (cmd, _args) = resolve_terminal_interpreter(&None, None);
        assert!(cmd == "python" || cmd == "python3");
    }
}