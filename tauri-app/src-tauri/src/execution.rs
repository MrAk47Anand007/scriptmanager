use reqwest::Client;
use tauri::command;
use serde_json::Value;
use boa_engine::{Context, Source};
use std::collections::HashMap;

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
    let res_headers: HashMap<String, String> = res.headers().iter()
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
    let mut context = Context::default();
    
    let result = context.eval(Source::from_bytes(&code));
    
    match result {
        Ok(res) => Ok(res.display().to_string()),
        Err(e) => Err(format!("Execution error: {}", e.display())),
    }
}

#[command]
pub async fn run_workflow_dag(workflow_id: String) -> Result<String, String> {
    // This is a stub for the complex DAG execution logic.
    // The tokio async runtime allows for concurrent node execution.
    // Full logic will map workflow nodes to execution streams.
    
    Ok(format!("Workflow {} started successfully.", workflow_id))
}
