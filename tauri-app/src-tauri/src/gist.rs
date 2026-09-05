use serde::Serialize;
use serde_json::Value;
use sqlx::{Row, SqlitePool};
use tauri::State;

use crate::settings::GIST_TOKEN_KEY;

const GITHUB_API_BASE: &str = "https://api.github.com";

fn github_client(token: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("scriptmanager-desktop")
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::AUTHORIZATION,
                reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
                    .map_err(|e| format!("Invalid GitHub token: {e}"))?,
            );
            headers.insert(
                reqwest::header::ACCEPT,
                reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
            );
            headers
        })
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

#[derive(Debug, Serialize)]
pub struct GistSyncResult {
    pub gist_id: String,
    pub gist_url: String,
    pub gist_filename: String,
}

struct GistScript {
    name: String,
    filename: String,
    content: String,
    gist_id: Option<String>,
}

async fn load_gist_script(pool: &SqlitePool, script_id: &str) -> Result<GistScript, String> {
    let row = sqlx::query("SELECT name, filename, content, gist_id FROM scripts WHERE id = ?")
        .bind(script_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Script not found".to_string())?;

    Ok(GistScript {
        name: row.try_get(0).map_err(|e| e.to_string())?,
        filename: row.try_get(1).map_err(|e| e.to_string())?,
        content: row
            .try_get::<Option<String>, _>(2)
            .map_err(|e| e.to_string())?
            .unwrap_or_default(),
        gist_id: row.try_get(3).map_err(|e| e.to_string())?,
    })
}

async fn persist_gist_links(
    pool: &SqlitePool,
    script_id: &str,
    gist_id: Option<&str>,
    gist_url: Option<&str>,
) -> Result<(), String> {
    sqlx::query("UPDATE scripts SET gist_id = ?, gist_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(gist_id)
        .bind(gist_url)
        .bind(script_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn sync_gist_core(pool: &SqlitePool, script_id: &str) -> Result<GistSyncResult, String> {
    let token = crate::settings::get_setting(pool, GIST_TOKEN_KEY)
        .await?
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "GitHub token is not configured. Add it in Settings → GitHub Gist.".to_string())?;

    let script = load_gist_script(pool, script_id).await?;
    if script.content.trim().is_empty() {
        return Err("Script has no content to sync".to_string());
    }

    let client = github_client(token.trim())?;
    let files = serde_json::json!({
        &script.filename: { "content": script.content }
    });

    let response = match &script.gist_id {
        Some(gist_id) => client
            .patch(format!("{GITHUB_API_BASE}/gists/{gist_id}"))
            .json(&serde_json::json!({
                "description": script.name,
                "files": files,
            }))
            .send()
            .await
            .map_err(|e| format!("Gist update failed: {e}"))?,
        None => client
            .post(format!("{GITHUB_API_BASE}/gists"))
            .json(&serde_json::json!({
                "description": script.name,
                "files": files,
                "public": false,
            }))
            .send()
            .await
            .map_err(|e| format!("Gist creation failed: {e}"))?,
    };

    let status = response.status();
    let body: Value = response.json().await.map_err(|e| format!("Invalid Gist response: {e}"))?;
    if !status.is_success() {
        let message = body
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Unknown GitHub error");
        return Err(format!("GitHub API error ({status}): {message}"));
    }

    let gist_id = body
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Gist response missing id".to_string())?
        .to_string();
    let gist_url = body
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    persist_gist_links(pool, script_id, Some(&gist_id), Some(&gist_url)).await?;

    Ok(GistSyncResult {
        gist_id,
        gist_url,
        gist_filename: script.filename,
    })
}

pub async fn delete_gist_core(pool: &SqlitePool, script_id: &str) -> Result<bool, String> {
    let script = load_gist_script(pool, script_id).await?;

    if let Some(gist_id) = &script.gist_id {
        let token = crate::settings::get_setting(pool, GIST_TOKEN_KEY)
            .await?
            .filter(|token| !token.trim().is_empty())
            .ok_or_else(|| "GitHub token is not configured. Add it in Settings → GitHub Gist.".to_string())?;
        let client = github_client(token.trim())?;
        let response = client
            .delete(format!("{GITHUB_API_BASE}/gists/{gist_id}"))
            .send()
            .await
            .map_err(|e| format!("Gist deletion failed: {e}"))?;
        if !response.status().is_success() && response.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(format!("GitHub API error ({})", response.status()));
        }
    }

    persist_gist_links(pool, script_id, None, None).await?;
    Ok(true)
}

#[tauri::command]
pub async fn sync_gist(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<GistSyncResult, String> {
    sync_gist_core(&pool, &script_id).await
}

#[tauri::command]
pub async fn delete_gist(
    pool: State<'_, SqlitePool>,
    script_id: String,
) -> Result<serde_json::Value, String> {
    let ok = delete_gist_core(&pool, &script_id).await?;
    Ok(serde_json::json!({ "ok": ok }))
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
    async fn sync_requires_configured_token() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, content) VALUES ('s-1', 'N', 'n.py', 'print(1)')")
            .execute(&pool)
            .await
            .unwrap();
        let err = sync_gist_core(&pool, "s-1").await.unwrap_err();
        assert!(err.contains("token is not configured"));
    }

    #[tokio::test]
    async fn delete_clears_gist_links_even_without_gist() {
        let pool = test_pool().await;
        sqlx::query("INSERT INTO scripts (id, name, filename, content, gist_id, gist_url) VALUES ('s-1', 'N', 'n.py', 'x', 'abc', 'https://gist/abc')")
            .execute(&pool)
            .await
            .unwrap();
        // No token configured and gist id exists -> API call fails with the
        // token error; without a gist id the links clear unconditionally.
        let err = delete_gist_core(&pool, "s-1").await.unwrap_err();
        assert!(err.contains("token is not configured"));

        sqlx::query("UPDATE scripts SET gist_id = NULL, gist_url = NULL WHERE id = 's-1'")
            .execute(&pool)
            .await
            .unwrap();
        assert!(delete_gist_core(&pool, "s-1").await.unwrap());
        let row = sqlx::query("SELECT gist_id, gist_url FROM scripts WHERE id = 's-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
        let gist_id: Option<String> = row.try_get(0).unwrap();
        assert!(gist_id.is_none());
    }
}
