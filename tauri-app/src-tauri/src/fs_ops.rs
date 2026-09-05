use notify::{Event, RecursiveMode, Watcher};
use std::fs;
use std::path::Path;
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
