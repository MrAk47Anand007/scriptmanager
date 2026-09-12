use notify::{Event, RecursiveMode, Watcher};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::mpsc::channel;
use tauri::{command, Emitter, Window};

#[command]
pub fn start_folder_watch(path: String, window: Window) -> Result<(), String> {
    std::thread::spawn(move || {
        let (tx, rx) = channel();

        let mut watcher = notify::recommended_watcher(tx).unwrap();
        watcher
            .watch(Path::new(&path), RecursiveMode::Recursive)
            .unwrap();

        for res in rx {
            match res {
                Ok(Event { kind, paths, .. }) => {
                    if let Some(p) = paths.first() {
                        let path_str = p.to_string_lossy().into_owned();
                        let event_name = format!("fs-event-{:?}", kind);
                        window
                            .emit(
                                "canonical-folder-change",
                                serde_json::json!({
                                    "type": event_name,
                                    "path": path_str
                                }),
                            )
                            .ok();
                    }
                }
                Err(e) => println!("watch error: {:?}", e),
            }
        }
    });

    Ok(())
}

#[command]
pub fn atomic_write_file(path: String, content: String) -> Result<(), String> {
    let temp_path = format!("{}.tmp", path);
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    fs::rename(&temp_path, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[command]
pub fn reveal_path(path: String) -> Result<bool, String> {
    let target = Path::new(&path);
    let reveal_target = if target.exists() {
        target
    } else {
        target
            .parent()
            .filter(|parent| parent.exists())
            .ok_or_else(|| format!("Path does not exist: {path}"))?
    };

    #[cfg(target_os = "windows")]
    {
        let status = if reveal_target.is_file() {
            Command::new("explorer")
                .arg(format!("/select,{}", reveal_target.display()))
                .status()
        } else {
            Command::new("explorer").arg(reveal_target).status()
        };
        return status
            .map(|status| status.success())
            .map_err(|error| error.to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg("-R")
            .arg(reveal_target)
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(status.success());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let directory = if reveal_target.is_dir() {
            reveal_target
        } else {
            reveal_target
                .parent()
                .ok_or_else(|| format!("Could not resolve parent directory for {path}"))?
        };
        let status = Command::new("xdg-open")
            .arg(directory)
            .status()
            .map_err(|error| error.to_string())?;
        return Ok(status.success());
    }
}
