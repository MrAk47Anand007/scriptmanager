use git2::{Repository, Oid, Signature};
use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct GitCommitInfo {
    pub id: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[command]
pub fn git_clone(url: String, path: String) -> Result<(), String> {
    Repository::clone(&url, &path).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn git_log(path: String) -> Result<Vec<GitCommitInfo>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let mut revwalk = repo.revwalk().map_err(|e| e.to_string())?;
    
    revwalk.push_head().map_err(|e| e.to_string())?;
    
    let mut commits = Vec::new();
    for oid in revwalk.take(50) {
        if let Ok(oid) = oid {
            if let Ok(commit) = repo.find_commit(oid) {
                commits.push(GitCommitInfo {
                    id: commit.id().to_string(),
                    message: commit.message().unwrap_or("").to_string(),
                    author: commit.author().name().unwrap_or("").to_string(),
                    timestamp: commit.time().seconds(),
                });
            }
        }
    }
    
    Ok(commits)
}

#[command]
pub fn git_status(path: String) -> Result<Vec<String>, String> {
    let repo = Repository::open(&path).map_err(|e| e.to_string())?;
    let statuses = repo.statuses(None).map_err(|e| e.to_string())?;
    
    let mut changed_files = Vec::new();
    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            changed_files.push(path.to_string());
        }
    }
    
    Ok(changed_files)
}
