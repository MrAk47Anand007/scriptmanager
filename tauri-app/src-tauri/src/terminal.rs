use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtyPair};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{State, Window, Emitter};
use std::io::{Read, Write};

pub struct TerminalState {
    pub ptys: Mutex<HashMap<String, (Box<dyn portable_pty::MasterPty + Send>, Box<dyn Write + Send>)>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            ptys: Mutex::new(HashMap::new()),
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
    
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;

    let cmd = if cfg!(target_os = "windows") {
        CommandBuilder::new("powershell.exe")
    } else {
        CommandBuilder::new("bash")
    };

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    // Drop slave to avoid deadlock
    drop(pair.slave);
    
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let session_id_clone = session_id.clone();
    
    // Read loop
    std::thread::spawn(move || {
        let mut buf = [0u8; 1024];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 { break; }
            let output = String::from_utf8_lossy(&buf[..n]).into_owned();
            window.emit(&format!("terminal-data-{}", session_id_clone), output).ok();
        }
    });

    state.ptys.lock().unwrap().insert(session_id, (pair.master, writer));

    Ok(())
}

#[tauri::command]
pub fn write_terminal(
    session_id: String,
    data: String,
    state: State<'_, TerminalState>,
) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some((_, writer)) = ptys.get_mut(&session_id) {
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
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
    let ptys = state.ptys.lock().unwrap();
    if let Some((master, _)) = ptys.get(&session_id) {
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}
