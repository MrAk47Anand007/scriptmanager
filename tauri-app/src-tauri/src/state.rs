use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AppPaths {
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub scripts_dir: PathBuf,
    pub builds_dir: PathBuf,
}

impl AppPaths {
    pub fn resolve(app_handle: &AppHandle) -> AppResult<Self> {
        let data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|error| AppError::InvalidInput(error.to_string()))
            .unwrap_or_else(|_| {
                let manifest_dir = env!("CARGO_MANIFEST_DIR");
                PathBuf::from(manifest_dir).join("../../data")
            });

        let db_path = data_dir.join("scriptmanager.db");
        let scripts_dir = data_dir.join("scripts");
        let builds_dir = data_dir.join("builds");

        std::fs::create_dir_all(&data_dir)?;
        std::fs::create_dir_all(&scripts_dir)?;
        std::fs::create_dir_all(&builds_dir)?;

        Ok(Self {
            data_dir,
            db_path,
            scripts_dir,
            builds_dir,
        })
    }
}
