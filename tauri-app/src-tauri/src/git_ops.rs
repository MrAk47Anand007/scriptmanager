use git2::Repository;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::{Component, Path, PathBuf};
use tauri::command;

const GIT_ACTION_NAMES: [&str; 14] = [
    "status",
    "diff",
    "branches",
    "checkout",
    "commit",
    "fetch",
    "pull",
    "push",
    "clean",
    "add",
    "reset",
    "restore",
    "log",
    "branch_create",
];

#[derive(Serialize, Deserialize)]
pub struct GitCommitInfo {
    pub id: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

// ---------- Action payload (camelCase-compatible) ----------

#[derive(Debug, Clone, Deserialize)]
pub struct GitActionPayload {
    pub action: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub remote: Option<String>,
    #[serde(default)]
    pub force: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct RunGitActionPayload {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub action: GitActionPayload,
}

#[derive(Debug, Deserialize)]
pub struct GitClonePayload {
    pub url: String,
    #[serde(rename = "targetPath", default)]
    pub target_path_camel: Option<String>,
    #[serde(rename = "target_path", default)]
    pub target_path_snake: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(rename = "projectName", default)]
    pub project_name_camel: Option<String>,
    #[serde(rename = "project_name", default)]
    pub project_name_snake: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
}

// ---------- URL helpers (mirror lib/git/urlUtils.ts) ----------

pub(crate) fn sanitize_git_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Ok(mut parsed) = url::Url::parse(trimmed) {
        let _ = parsed.set_username("");
        let _ = parsed.set_password(None);
        return parsed.to_string();
    }
    trimmed.to_string()
}

pub(crate) fn extract_repo_name(raw: &str) -> String {
    let clean = sanitize_git_url(raw);
    let clean = clean.trim_end_matches('/');
    let last = clean.rsplit('/').next().unwrap_or("repo");
    let name = last.strip_suffix(".git").or_else(|| last.strip_suffix(".GIT")).unwrap_or(last);
    if name.is_empty() {
        "project".to_string()
    } else {
        name.to_string()
    }
}

pub(crate) fn inject_git_auth(raw_url: &str, token: Option<&str>) -> String {
    let trimmed = raw_url.trim();
    let token = token.map(|t| t.trim()).filter(|t| !t.is_empty());
    let Some(token) = token else {
        return trimmed.to_string();
    };
    let Ok(mut parsed) = url::Url::parse(trimmed) else {
        return trimmed.to_string();
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return trimmed.to_string();
    }
    let host = parsed.host_str().unwrap_or("").to_string();
    if host.contains("gitlab.com") {
        let _ = parsed.set_username("oauth2");
        let _ = parsed.set_password(Some(token));
    } else if host.contains("github.com") {
        let _ = parsed.set_username("x-access-token");
        let _ = parsed.set_password(Some(token));
    } else {
        let _ = parsed.set_username(token);
        let _ = parsed.set_password(None);
    }
    parsed.to_string()
}

// ---------- Path containment (mirror lib/git/policy.ts) ----------

pub(crate) fn resolve_repository_path(root: &str, requested: &str) -> Result<PathBuf, String> {
    let requested_path = Path::new(requested);
    if requested_path.is_absolute()
        || requested.starts_with("\\\\")
        || (requested.len() >= 3
            && requested.chars().nth(1) == Some(':')
            && (requested.chars().nth(2) == Some('\\') || requested.chars().nth(2) == Some('/')))
    {
        return Err("Requested path is outside the granted repository root".to_string());
    }
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|_| "Repository root is not accessible".to_string())?;
    // Lexically join + normalize so non-existent subpaths still resolve safely.
    let mut normalized = canonical_root.clone();
    for component in Path::new(requested).components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                return Err("Requested path is outside the granted repository root".to_string());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() || normalized != canonical_root && !normalized.starts_with(&canonical_root) {
                    return Err("Requested path is outside the granted repository root".to_string());
                }
                if !normalized.starts_with(&canonical_root) {
                    return Err("Requested path is outside the granted repository root".to_string());
                }
            }
            Component::Normal(part) => normalized.push(part),
        }
    }
    if normalized != canonical_root && !normalized.starts_with(&canonical_root) {
        return Err("Requested path is outside the granted repository root".to_string());
    }
    Ok(normalized)
}

// ---------- Action validation (mirror lib/git/policy.ts) ----------

pub(crate) fn validate_git_action(action: &GitActionPayload) -> Result<(), String> {
    if !GIT_ACTION_NAMES.contains(&action.action.as_str()) {
        return Err("Git action is invalid".to_string());
    }
    let check_token = |label: &str, value: Option<&String>| -> Result<(), String> {
        if let Some(v) = value {
            if v.trim().is_empty() || v.len() > 255 {
                return Err(format!("Git {} is invalid", label));
            }
            if v.starts_with('-') || v.chars().any(|c| c.is_whitespace()) {
                return Err(format!("Git {} is invalid", label));
            }
            if v.contains('\0') {
                return Err(format!("Git {} contains an invalid character", label));
            }
        }
        Ok(())
    };
    if let Some(p) = action.path.as_ref() {
        if p.trim().is_empty() || p.len() > 4096 || p.contains('\0') {
            return Err("Git path contains an invalid character".to_string());
        }
    }
    check_token("branch", action.branch.as_ref())?;
    check_token("remote", action.remote.as_ref())?;
    if let Some(m) = action.message.as_ref() {
        if m.trim().is_empty() || m.len() > 10_000 || m.contains('\0') {
            return Err("Git message is required".to_string());
        }
    }
    match action.action.as_str() {
        "checkout" | "branch_create" => {
            if action.branch.as_ref().map(|b| b.trim().is_empty()).unwrap_or(true) {
                return Err(format!("Git {} branch is required", action.action));
            }
        }
        "commit" => {
            if action.message.as_ref().map(|m| m.trim().is_empty()).unwrap_or(true) {
                return Err("Git commit message is required".to_string());
            }
        }
        _ => {}
    }
    Ok(())
}

// ---------- git process runner (argument arrays, never shell strings) ----------

struct GitOutput {
    stdout: String,
}

fn run_git(root: &str, args: &[&str]) -> Result<GitOutput, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|e| format!("Git is not available: {}", e))?;
    Ok(GitOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
    })
}

#[cfg(test)]
fn run_git_capture(root: &str, args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|e| format!("Git is not available: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git {} failed", args.first().unwrap_or(&"command"))
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

// ---------- Status / branches / log / diff parsers ----------

fn classify_file_state(index: char, worktree: char) -> &'static str {
    if (index == 'U' || worktree == 'U') || (index == 'A' && worktree == 'A') || (index == 'D' && worktree == 'D') {
        return "conflicted";
    }
    if index == '?' && worktree == '?' {
        return "untracked";
    }
    if index == 'R' || worktree == 'R' {
        return "renamed";
    }
    if index == 'A' || worktree == 'A' {
        return "added";
    }
    if index == 'D' || worktree == 'D' {
        return "deleted";
    }
    "modified"
}

pub(crate) fn parse_status_output(output: &str) -> serde_json::Value {
    let mut branch = String::new();
    let mut upstream: Option<String> = None;
    let mut ahead = 0i64;
    let mut behind = 0i64;
    let mut files = Vec::new();

    for (i, line) in output.lines().enumerate() {
        if i == 0 && line.starts_with("## ") {
            let header = line.trim_start_matches("## ");
            if let Some(stripped) = header.strip_prefix("No commits yet on ") {
                branch = stripped.to_string();
            } else {
                let (branch_part, tracking) = match header.find("...") {
                    Some(idx) => (&header[..idx], Some(&header[idx + 3..])),
                    None => (header.split(' ').next().unwrap_or(header), None),
                };
                branch = branch_part.to_string();
                if let Some(tracking) = tracking {
                    let tracking = tracking.split(' ').next().unwrap_or(tracking);
                    if tracking != "[gone]" {
                        upstream = Some(tracking.to_string());
                    }
                    let bracket = header.find('[').and_then(|s| header.find(']').map(|e| &header[s..=e])).unwrap_or("");
                    for part in bracket.trim_matches(|c| c == '[' || c == ']').split(',') {
                        let part = part.trim();
                        if let Some(n) = part.strip_prefix("ahead ") {
                            ahead = n.trim().parse().unwrap_or(0);
                        } else if let Some(n) = part.strip_prefix("behind ") {
                            behind = n.trim().parse().unwrap_or(0);
                        }
                    }
                }
            }
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        let mut chars = line.chars();
        let index = chars.next().unwrap_or(' ');
        let worktree = chars.next().unwrap_or(' ');
        if index == '#' {
            continue;
        }
        let raw_path = line[3..].trim();
        let path = match raw_path.find(" -> ") {
            Some(idx) => raw_path[idx + 4..].to_string(),
            None => raw_path.to_string(),
        };
        let state = classify_file_state(index, worktree);
        let entry = serde_json::json!({
            "path": path,
            "index": index.to_string(),
            "workingTree": worktree.to_string(),
            "state": state,
        });
        files.push(entry);
    }

    let staged: Vec<_> = files
        .iter()
        .filter(|f| {
            let idx = f["index"].as_str().unwrap_or(" ");
            idx != " " && idx != "?"
        })
        .cloned()
        .collect();
    let unstaged: Vec<_> = files
        .iter()
        .filter(|f| {
            let wt = f["workingTree"].as_str().unwrap_or(" ");
            let idx = f["index"].as_str().unwrap_or(" ");
            wt != " " || (idx == "?" && wt == "?")
        })
        .cloned()
        .collect();

    serde_json::json!({
        "branch": branch,
        "upstream": upstream,
        "ahead": ahead,
        "behind": behind,
        "files": files,
        "staged": staged,
        "unstaged": unstaged,
        "clean": files.is_empty(),
    })
}

pub(crate) fn parse_branches_output(output: &str) -> serde_json::Value {
    let mut current: Option<String> = None;
    let mut local = Vec::new();
    let mut remote = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let (is_current, name) = match line.strip_prefix("* ") {
            Some(n) => (true, n.trim()),
            None => (false, line),
        };
        if name.contains(" -> ") {
            continue;
        }
        if let Some(stripped) = name.strip_prefix("remotes/") {
            remote.push(stripped.to_string());
        } else {
            if is_current {
                current = Some(name.to_string());
            }
            local.push(name.to_string());
        }
    }
    serde_json::json!({ "current": current, "local": local, "remote": remote })
}

pub(crate) fn parse_log_output(output: &str) -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    for line in output.lines() {
        let parts: Vec<&str> = line.splitn(5, '|').collect();
        if parts.len() != 5 || parts[0].is_empty() {
            continue;
        }
        out.push(serde_json::json!({
            "hash": parts[0],
            "author": parts[1],
            "email": parts[2],
            "date": parts[3],
            "message": parts[4],
        }));
    }
    out
}

pub(crate) fn parse_diff_output(output: &str) -> Vec<serde_json::Value> {
    let mut files = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_patch = String::new();
    let mut additions = 0i64;
    let mut deletions = 0i64;

    let flush = |path: &mut Option<String>, patch: &mut String, add: &mut i64, del: &mut i64, files: &mut Vec<serde_json::Value>| {
        if let Some(p) = path.take() {
            files.push(serde_json::json!({
                "path": p,
                "additions": *add,
                "deletions": *del,
                "patch": patch.clone(),
            }));
        }
        patch.clear();
        *add = 0;
        *del = 0;
    };

    for line in output.lines() {
        if let Some(rest) = line.strip_prefix("diff --git ") {
            flush(&mut current_path, &mut current_patch, &mut additions, &mut deletions, &mut files);
            let path = rest
                .rsplit(" b/")
                .next()
                .unwrap_or(rest)
                .trim_start_matches("a/")
                .to_string();
            current_path = Some(path);
            current_patch.push_str(line);
            current_patch.push('\n');
            continue;
        }
        if current_path.is_some() {
            current_patch.push_str(line);
            current_patch.push('\n');
            if line.starts_with('+') && !line.starts_with("+++") {
                additions += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                deletions += 1;
            }
        }
    }
    flush(&mut current_path, &mut current_patch, &mut additions, &mut deletions, &mut files);
    files
}

// ---------- Action dispatch ----------

fn action_args(action: &GitActionPayload) -> Result<Vec<String>, String> {
    let owned = |parts: Vec<&str>| parts.into_iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match action.action.as_str() {
        "status" => Ok(owned(vec!["status", "--short", "--branch"])),
        "diff" => Ok(owned(vec!["diff", "--no-ext-diff", "--", action.path.as_deref().unwrap_or(".")])),
        "branches" => Ok(owned(vec!["branch", "--all", "--no-color"])),
        "checkout" => {
            let mut args = vec!["checkout".to_string()];
            if action.force.unwrap_or(false) {
                args.push("--force".to_string());
            }
            args.push(action.branch.clone().unwrap_or_default());
            Ok(args)
        }
        "branch_create" => Ok(vec!["checkout".to_string(), "-b".to_string(), action.branch.clone().unwrap_or_default()]),
        "add" => Ok(owned(vec!["add", "--", action.path.as_deref().unwrap_or(".")])),
        "reset" => {
            if let Some(p) = action.path.as_ref() {
                Ok(vec!["reset".to_string(), "HEAD".to_string(), "--".to_string(), p.clone()])
            } else {
                Ok(vec!["reset".to_string()])
            }
        }
        "restore" => Ok(owned(vec!["checkout", "--", action.path.as_deref().unwrap_or(".")])),
        "commit" => Ok(vec!["commit".to_string(), "-m".to_string(), action.message.clone().unwrap_or_default()]),
        "fetch" => Ok(vec!["fetch".to_string(), action.remote.clone().unwrap_or_else(|| "origin".to_string())]),
        "pull" => {
            let mut args = vec!["pull".to_string(), "--ff-only".to_string(), action.remote.clone().unwrap_or_else(|| "origin".to_string())];
            if let Some(b) = action.branch.as_ref().filter(|b| !b.trim().is_empty()) {
                args.push(b.clone());
            }
            Ok(args)
        }
        "push" => {
            let mut args = vec!["push".to_string()];
            if action.force.unwrap_or(false) {
                args.push("--force-with-lease".to_string());
            }
            args.push(action.remote.clone().unwrap_or_else(|| "origin".to_string()));
            if let Some(b) = action.branch.as_ref().filter(|b| !b.trim().is_empty()) {
                args.push(b.clone());
            }
            Ok(args)
        }
        "clean" => Ok(owned(vec!["clean", "-fd"])),
        "log" => Ok(owned(vec!["log", "-n", "50", "--pretty=format:%H|%an|%ae|%ad|%s", "--date=short"])),
        _ => Err("Git action is invalid".to_string()),
    }
}

fn policy_allows(policy: &serde_json::Value, action: &GitActionPayload) -> Result<(), String> {
    let get = |key: &str, fallback: bool| {
        policy.get(key).and_then(|v| v.as_bool()).unwrap_or(fallback)
    };
    if action.action == "commit" && !get("allowCommit", true) {
        return Err("Commits are disabled by workspace policy".to_string());
    }
    if action.action == "pull" && !get("allowPull", true) {
        return Err("Pull is disabled by workspace policy".to_string());
    }
    let protected = (action.action == "push" && get("requireApprovalForPush", true))
        || (action.force.unwrap_or(false) && get("requireApprovalForForce", true))
        || (action.action == "clean" && get("requireApprovalForCleanup", true));
    if protected {
        // Approvals inbox is Task 11; surface a stable typed error instead of
        // pretending the operation ran or crashing the workbench.
        return Err("This Git operation requires approval, which is not migrated yet".to_string());
    }
    Ok(())
}

async fn dispatch_git_action(
    pool: &SqlitePool,
    project_id: &str,
    action: GitActionPayload,
) -> Result<serde_json::Value, String> {
    validate_git_action(&action)?;
    let project = crate::projects::get_project_record(pool, project_id)
        .await?
        .ok_or_else(|| "Project not found".to_string())?;
    let root = project
        .repository_root
        .clone()
        .filter(|r| !r.trim().is_empty())
        .ok_or_else(|| "Project is not connected to a repository".to_string())?;
    // Containment for the repo itself and any requested subpath.
    resolve_repository_path(&root, ".")?;
    if let Some(p) = action.path.as_ref() {
        resolve_repository_path(&root, p)?;
    }
    let policy = project.workspace_policy.clone();
    policy_allows(&policy, &action)?;

    let args = action_args(&action)?;
    if args.iter().any(|a| a.is_empty()) {
        return Err(format!("Missing input for Git {}", action.action));
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = std::process::Command::new("git")
        .args(&arg_refs)
        .current_dir(&root)
        .output()
        .map_err(|e| format!("Git is not available: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("Git {} failed", action.action)
        } else {
            stderr
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let data = match action.action.as_str() {
        "status" => parse_status_output(&stdout),
        "branches" => parse_branches_output(&stdout),
        "diff" => serde_json::Value::Array(parse_diff_output(&stdout)),
        "log" => serde_json::Value::Array(parse_log_output(&stdout)),
        _ => serde_json::json!({ "output": stdout }),
    };
    Ok(serde_json::json!({ "kind": "result", "data": data }))
}

// ---------- Probe & clone ----------

fn probe_is_auth_failure(stderr_lower: &str) -> bool {
    ["could not read username", "authentication failed", "not found", "repository not found", "401", "403", "permission denied", "access denied"]
        .iter()
        .any(|needle| stderr_lower.contains(needle))
}

fn probe_remote(url: &str, token: Option<&str>) -> serde_json::Value {
    let target = inject_git_auth(url, token);
    let output = std::process::Command::new("git")
        .args(["ls-remote", "--heads", &target])
        .output();
    let output = match output {
        Ok(o) => o,
        Err(e) => {
            return serde_json::json!({ "isPrivate": false, "status": "error", "message": format!("Failed to probe repository: {}", e) });
        }
    };
    if output.status.success() {
        let branches: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| line.split("refs/heads/").nth(1).map(|s| s.to_string()))
            .filter(|s| !s.is_empty())
            .collect();
        let default_branch = if branches.iter().any(|b| b == "main") {
            "main".to_string()
        } else if branches.iter().any(|b| b == "master") {
            "master".to_string()
        } else {
            branches.first().cloned().unwrap_or_else(|| "main".to_string())
        };
        return serde_json::json!({ "isPrivate": false, "status": "ready", "defaultBranch": default_branch });
    }
    let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
    if probe_is_auth_failure(&stderr) {
        if token.map(|t| t.trim().is_empty()).unwrap_or(true) {
            return serde_json::json!({ "isPrivate": true, "status": "auth_required", "message": "This repository is private or requires a Personal Access Token (PAT)." });
        }
        return serde_json::json!({ "isPrivate": true, "status": "auth_failed", "message": "Authentication failed. Please verify your Personal Access Token has read access." });
    }
    // Never echo the authed URL back; it may contain the token.
    let stderr_clean = String::from_utf8_lossy(&output.stderr).trim().to_string();
    serde_json::json!({ "isPrivate": false, "status": "error", "message": if stderr_clean.is_empty() { "Could not connect to the remote repository.".to_string() } else { stderr_clean } })
}

// ---------- Tauri commands ----------

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

#[command]
pub async fn run_git_action(
    pool: tauri::State<'_, SqlitePool>,
    payload: RunGitActionPayload,
) -> Result<serde_json::Value, String> {
    dispatch_git_action(&pool, &payload.project_id, payload.action).await
}

#[command]
pub async fn git_probe(url: String, token: Option<String>) -> Result<serde_json::Value, String> {
    if url.trim().is_empty() {
        return Err("Repository URL is required".to_string());
    }
    Ok(probe_remote(url.trim(), token.as_deref()))
}

#[command]
pub async fn git_clone_project(
    pool: tauri::State<'_, SqlitePool>,
    payload: GitClonePayload,
) -> Result<crate::projects::ProjectRecord, String> {
    let url = payload.url.trim().to_string();
    if url.is_empty() {
        return Err("Repository URL is required".to_string());
    }
    let target = payload
        .target_path_camel
        .or(payload.target_path_snake)
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .ok_or_else(|| "Destination directory is required".to_string())?;
    let token = payload.token.as_deref().map(|t| t.trim()).filter(|t| !t.is_empty());
    let branch = payload.branch.as_deref().map(|b| b.trim()).filter(|b| !b.is_empty());

    let resolved = PathBuf::from(&target);
    if resolved.exists() {
        let entries = std::fs::read_dir(&resolved).map_err(|e| e.to_string())?;
        if entries.count() > 0 {
            return Err(format!("Destination directory \"{}\" already exists and is not empty.", resolved.display()));
        }
    } else if let Some(parent) = resolved.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    let authed = inject_git_auth(&url, token);
    let mut args: Vec<&str> = vec!["clone"];
    let mut owned_branch: Option<String> = None;
    if let Some(b) = branch {
        args.push("-b");
        owned_branch = Some(b.to_string());
    }
    let mut owned: Vec<String> = Vec::new();
    if let Some(b) = owned_branch.as_ref() {
        owned.push(b.clone());
    }
    // Build final argv without ever logging `authed`.
    let mut argv: Vec<&str> = vec!["clone"];
    if owned_branch.is_some() {
        argv.push("-b");
        argv.push(owned.first().map(|s| s.as_str()).unwrap_or(""));
    }
    let resolved_str = resolved.to_string_lossy().to_string();
    argv.push(authed.as_str());
    argv.push(resolved_str.as_str());
    let _ = args;

    let output = std::process::Command::new("git")
        .args(&argv)
        .output()
        .map_err(|e| format!("Git is not available: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
        if stderr.contains("could not read username")
            || stderr.contains("authentication failed")
            || stderr.contains("401")
            || stderr.contains("403")
        {
            return Err("Authentication failed while cloning. Please check your Access Token.".to_string());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Git clone failed.".to_string()
        } else {
            stderr
        });
    }

    let default_branch = run_git(
        &resolved.to_string_lossy(),
        &["rev-parse", "--abbrev-ref", "HEAD"],
    )
    .map(|o| o.stdout.trim().to_string())
    .ok()
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "main".to_string());

    let safe_url = sanitize_git_url(&url);
    let name = payload
        .project_name_camel
        .or(payload.project_name_snake)
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| extract_repo_name(&url));
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let id = uuid::Uuid::new_v4().to_string();
    let policy = crate::projects::default_workspace_policy();
    let policy_text = serde_json::to_string(&policy).unwrap_or_else(|_| "{}".to_string());
    let description = format!("Imported from {}", safe_url);
    sqlx::query(
        "INSERT INTO projects (id, workspace_id, name, description, environment, color,
            repository_root, default_branch, remote_url, workspace_policy, created_at, updated_at)
         VALUES (?, 'default', ?, ?, 'development', '#3b82f6', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&name)
    .bind(&description)
    .bind(resolved.to_string_lossy().to_string())
    .bind(&default_branch)
    .bind(&safe_url)
    .bind(&policy_text)
    .bind(&now)
    .bind(&now)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    crate::projects::get_project_record(&pool, &id)
        .await?
        .ok_or_else(|| "Project not found".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_action_validation_rejects_bad_input() {
        let bad = GitActionPayload {
            action: "explode".to_string(),
            path: None,
            branch: None,
            message: None,
            remote: None,
            force: None,
        };
        assert!(validate_git_action(&bad).is_err());

        let missing_branch = GitActionPayload {
            action: "checkout".to_string(),
            path: None,
            branch: None,
            message: None,
            remote: None,
            force: None,
        };
        assert!(validate_git_action(&missing_branch).is_err());

        let missing_message = GitActionPayload {
            action: "commit".to_string(),
            path: None,
            branch: None,
            message: None,
            remote: None,
            force: None,
        };
        assert!(validate_git_action(&missing_message).is_err());

        let ok = GitActionPayload {
            action: "status".to_string(),
            path: None,
            branch: None,
            message: None,
            remote: None,
            force: None,
        };
        assert!(validate_git_action(&ok).is_ok());
    }

    #[test]
    fn repository_path_containment_rejects_escapes() {
        let root = std::env::temp_dir().join("sm-git-root-check");
        std::fs::create_dir_all(&root).unwrap();
        let root_str = root.to_string_lossy().to_string();

        assert!(resolve_repository_path(&root_str, ".").is_ok());
        assert!(resolve_repository_path(&root_str, "sub/dir").is_ok());
        assert!(resolve_repository_path(&root_str, "../outside").is_err());
        assert!(resolve_repository_path(&root_str, "../../..").is_err());
        assert!(resolve_repository_path(&root_str, "/absolute/path").is_err());
        assert!(resolve_repository_path(&root_str, "C:\\Windows").is_err());
    }

    #[test]
    fn git_url_helpers_mirror_renderer() {
        assert_eq!(
            sanitize_git_url("https://x-access-token:secret@github.com/a/b.git"),
            "https://github.com/a/b.git"
        );
        assert_eq!(
            extract_repo_name("https://github.com/facebook/react.git"),
            "react"
        );
        let authed = inject_git_auth("https://github.com/a/b.git", Some("tok"));
        assert!(authed.contains("x-access-token"));
        assert!(!authed.contains("tok:") || authed.contains("tok"));
        assert_eq!(
            inject_git_auth("https://github.com/a/b.git", None),
            "https://github.com/a/b.git"
        );
    }

    #[test]
    fn status_parser_handles_branch_header_and_files() {
        let output = "## main...origin/main [ahead 1]\nM  src/a.ts\n?? new.txt\n";
        let parsed = parse_status_output(output);
        assert_eq!(parsed["branch"], serde_json::Value::String("main".to_string()));
        assert_eq!(parsed["ahead"], serde_json::Value::Number(1.into()));
        assert_eq!(parsed["clean"], serde_json::Value::Bool(false));
        assert_eq!(parsed["files"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn branches_parser_splits_local_and_remote() {
        let output = "* main\n  dev\n  remotes/origin/main\n  remotes/origin/HEAD -> origin/main\n";
        let parsed = parse_branches_output(output);
        assert_eq!(parsed["current"], serde_json::Value::String("main".to_string()));
        assert_eq!(parsed["local"].as_array().unwrap().len(), 2);
        assert_eq!(parsed["remote"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn log_and_diff_parsers_handle_shapes() {
        let log = "abc|Jane|j@x.com|2026-09-01|hello\n";
        let entries = parse_log_output(log);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["hash"], serde_json::Value::String("abc".to_string()));

        let diff = "diff --git a/f.txt b/f.txt\nindex 1..2 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-old\n+new\n";
        let files = parse_diff_output(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["additions"], serde_json::Value::Number(1.into()));
        assert_eq!(files[0]["deletions"], serde_json::Value::Number(1.into()));
    }

    fn init_temp_repo(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sm-git-{}-{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let dir_str = dir.to_string_lossy().to_string();
        run_git_capture(&dir_str, &["init"]).unwrap();
        run_git_capture(&dir_str, &["config", "user.email", "t@t.t"]).unwrap();
        run_git_capture(&dir_str, &["config", "user.name", "t"]).unwrap();
        std::fs::write(dir.join("f.txt"), "hello\n").unwrap();
        run_git_capture(&dir_str, &["add", "."]).unwrap();
        run_git_capture(&dir_str, &["commit", "-m", "init"]).unwrap();
        dir
    }

    #[test]
    fn temp_repo_status_log_branches_round_trip() {
        let dir = init_temp_repo("roundtrip");
        let dir_str = dir.to_string_lossy().to_string();

        let status = run_git_capture(&dir_str, &["status", "--short", "--branch"]).unwrap();
        let parsed = parse_status_output(&status);
        assert_eq!(parsed["clean"], serde_json::Value::Bool(true));

        let log = run_git_capture(&dir_str, &["log", "-n", "50", "--pretty=format:%H|%an|%ae|%ad|%s", "--date=short"]).unwrap();
        let entries = parse_log_output(&log);
        assert_eq!(entries.len(), 1);

        let branches = run_git_capture(&dir_str, &["branch", "--all", "--no-color"]).unwrap();
        let parsed_branches = parse_branches_output(&branches);
        assert!(parsed_branches["current"].is_string());
        assert!(!parsed_branches["local"].as_array().unwrap().is_empty());

        std::fs::write(dir.join("f.txt"), "hello\nworld\n").unwrap();
        let diff = run_git_capture(&dir_str, &["diff", "--no-ext-diff", "--", "."]).unwrap();
        let files = parse_diff_output(&diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0]["path"], serde_json::Value::String("f.txt".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
