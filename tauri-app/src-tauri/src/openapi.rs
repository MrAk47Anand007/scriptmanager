//! OpenAPI 3 import: turn a spec (JSON or YAML) into a ScriptManager API
//! collection — one request per path×method, path parameters templated as
//! `{{param}}`, query parameters pre-filled, JSON request bodies from schema
//! examples, and one status-2xx check per request.

use serde::Deserialize;
use sqlx::Row;
use serde_json::{Map, Value};
use sqlx::SqlitePool;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
pub struct ImportOpenApiPayload {
    /// Collection name; defaults to the spec's info.title.
    #[serde(default)]
    pub name: Option<String>,
    /// Raw OpenAPI 3 document (JSON or YAML).
    pub spec: String,
    /// Attach a `status equals 2xx-first-choice` check to every request.
    #[serde(default = "default_true_checks")]
    pub add_checks: bool,
}

fn default_true_checks() -> bool {
    true
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOpenApiResult {
    pub collection_id: String,
    pub collection_name: String,
    pub request_count: usize,
}

fn parse_spec(spec: &str) -> Result<Value, String> {
    let trimmed = spec.trim();
    if trimmed.starts_with('{') {
        serde_json::from_str(trimmed).map_err(|error| format!("Invalid OpenAPI JSON: {error}"))
    } else {
        serde_yaml::from_str(trimmed).map_err(|error| format!("Invalid OpenAPI YAML: {error}"))
    }
}

const METHODS: [&str; 8] = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

fn schema_example(schema: &Value) -> Option<Value> {
    if let Some(example) = schema.get("example") {
        return Some(example.clone());
    }
    if let Some(default) = schema.get("default") {
        return Some(default.clone());
    }
    match schema.get("type").and_then(Value::as_str) {
        Some("object") => {
            let mut object = Map::new();
            if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
                for (name, property) in properties {
                    object.insert(name.clone(), schema_example(property).unwrap_or(Value::Null));
                }
            }
            Some(Value::Object(object))
        }
        Some("array") => Some(Value::Array(
            schema
                .get("items")
                .and_then(|items| resolve_schema_example(items, None))
                .map(|item| vec![item])
                .unwrap_or_default(),
        )),
        Some("string") => Some(Value::String(String::new())),
        Some("integer") | Some("number") => Some(Value::from(0)),
        Some("boolean") => Some(Value::Bool(false)),
        _ => None,
    }
}

fn parameter_rows(operation: &Value, path_item: &Value, path: &str) -> Vec<(String, String)> {
    let mut rows = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for source in [path_item, operation] {
        if let Some(parameters) = source.get("parameters").and_then(Value::as_array) {
            for parameter in parameters {
                let name = parameter.get("name").and_then(Value::as_str).unwrap_or_default().to_string();
                let location = parameter.get("in").and_then(Value::as_str).unwrap_or_default().to_string();
                if name.is_empty() || location != "query" || !seen.insert(name.clone()) {
                    continue;
                }
                let example = parameter
                    .get("example")
                    .cloned()
                    .or_else(|| parameter.get("schema").and_then(schema_example))
                    .map(|value| match value {
                        Value::String(text) => text,
                        other => other.to_string(),
                    })
                    .unwrap_or_default();
                rows.push((name, example));
            }
        }
    }
    let _ = path;
    rows
}

fn body_from_operation(operation: &Value, components: Option<&Value>) -> (String, String) {
    let Some(request_body) = operation.get("requestBody") else {
        return ("none".to_string(), String::new());
    };
    let Some(content) = request_body.get("content").and_then(Value::as_object) else {
        return ("none".to_string(), String::new());
    };
    for (media_type, media) in content {
        if media_type.contains("json") {
            let body = media
                .get("example")
                .cloned()
                .or_else(|| media.get("examples").and_then(|examples| examples.get("example1").cloned()))
                .or_else(|| media.get("schema").and_then(|schema| resolve_schema_example(schema, components)))
                .map(|value| serde_json::to_string_pretty(&value).unwrap_or_default())
                .unwrap_or_default();
            return ("json".to_string(), body);
        }
        if media_type.contains("form-urlencoded") {
            let body = media
                .get("schema")
                .and_then(|schema| resolve_schema_example(schema, components))
                .map(|value| {
                    value
                        .as_object()
                        .map(|map| {
                            map.iter()
                                .map(|(k, v)| format!("{k}={}", stringify(v)))
                                .collect::<Vec<_>>()
                                .join("&")
                        })
                        .unwrap_or_default()
                })
                .unwrap_or_default();
            return ("urlencoded".to_string(), body);
        }
    }
    ("none".to_string(), String::new())
}

fn stringify(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn resolve_schema_example(schema: &Value, components: Option<&Value>) -> Option<Value> {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let name = reference.rsplit('/').next()?;
        let target = components?
            .get("schemas")
            .and_then(|schemas| schemas.get(name))?;
        return resolve_schema_example(target, components);
    }
    schema_example(schema)
}

fn first_success_status(operation: &Value) -> String {
    operation
        .get("responses")
        .and_then(Value::as_object)
        .and_then(|responses| {
            responses
                .keys()
                .filter_map(|code| code.parse::<u16>().ok())
                .filter(|code| (200..300).contains(code))
                .min()
        })
        .map(|code| code.to_string())
        .unwrap_or_else(|| "200".to_string())
}

/// Import an OpenAPI document into a new collection.
pub async fn import_openapi_record(
    pool: &SqlitePool,
    payload: ImportOpenApiPayload,
) -> Result<ImportOpenApiResult, String> {
    let document = parse_spec(&payload.spec)?;
    let object = document
        .as_object()
        .ok_or_else(|| "OpenAPI document must be an object".to_string())?;
    if !object.contains_key("openapi") && !object.contains_key("swagger") {
        return Err("Not an OpenAPI/Swagger document (missing `openapi` field)".to_string());
    }
    let info_title = object
        .get("info")
        .and_then(|info| info.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("Imported API")
        .trim()
        .to_string();
    let collection_name = if payload.name.as_deref().map(str::trim).unwrap_or("").is_empty() {
        if info_title.is_empty() {
            "Imported API".to_string()
        } else {
            info_title
        }
    } else {
        payload.name.as_deref().unwrap_or("Imported API").trim().to_string()
    };
    let base_url = object
        .get("servers")
        .and_then(Value::as_array)
        .and_then(|servers| servers.first())
        .and_then(|server| server.get("url"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim_end_matches('/')
        .to_string();
    let components = object.get("components");

    let collection = crate::api_client::save_collection_record(
        pool,
        crate::api_client::SaveApiCollectionPayload {
            id: None,
            name: collection_name.clone(),
            description: object
                .get("info")
                .and_then(|info| info.get("description"))
                .and_then(Value::as_str)
                .map(str::to_string),
            variables: None,
        },
    )
    .await?;

    let paths = object
        .get("paths")
        .and_then(Value::as_object)
        .ok_or_else(|| "OpenAPI document has no `paths`".to_string())?;
    // BTreeMap keeps import order deterministic across runs.
    let sorted_paths: BTreeMap<&String, &Value> = paths.iter().collect();
    let mut request_count = 0usize;

    for (path, path_item) in &sorted_paths {
        let Some(path_item_object) = path_item.as_object() else { continue };
        for method in METHODS {
            let Some(operation) = path_item_object.get(method) else { continue };
            if !operation.is_object() {
                continue;
            }
            let name = operation
                .get("summary")
                .and_then(Value::as_str)
                .filter(|summary| !summary.trim().is_empty())
                .or_else(|| operation.get("operationId").and_then(Value::as_str))
                .map(str::to_string)
                .unwrap_or_else(|| format!("{} {path}", method.to_uppercase()));

            let templated_path = replace_path_parameters(path);
            let url = format!("{base_url}{templated_path}");
            let query_rows: Vec<Value> = parameter_rows(operation, path_item, path)
                .into_iter()
                .map(|(key, value)| serde_json::json!({ "key": key, "value": value, "enabled": true }))
                .collect();

            let (body_type, body) = body_from_operation(operation, components);
            let mut test_script = String::new();
            if payload.add_checks {
                let expected = first_success_status(operation);
                test_script = format!(
                    "test('status is {expected}', function () {{ expect(response.status).toBe({expected}); }});"
                );
            }

            crate::api_client::save_request_record(
                pool,
                crate::api_client::SaveApiRequestPayload {
                    id: None,
                    name,
                    method: Some(method.to_uppercase()),
                    url: Some(url),
                    headers: None,
                    query_params_snake: Some(serde_json::to_string(&query_rows).unwrap_or_else(|_| "[]".to_string())),
                    query_params_camel: None,
                    variables: None,
                    request_options_snake: None,
                    request_options_camel: None,
                    pre_request_script_snake: None,
                    pre_request_script_camel: None,
                    test_script_snake: if payload.add_checks { Some(test_script) } else { None },
                    test_script_camel: None,
                    response_mappings_snake: None,
                    response_mappings_camel: None,
                    body_type_snake: Some(body_type),
                    body_type_camel: None,
                    body: Some(body),
                    auth_type_snake: Some("none".to_string()),
                    auth_type_camel: None,
                    auth_config_snake: None,
                    auth_config_camel: None,
                    collection_id_snake: Some(collection.id.clone()),
                    collection_id_camel: None,
                },
            )
            .await?;
            request_count += 1;
        }
    }

    if request_count == 0 {
        crate::api_client::delete_collection_record(pool, &collection.id).await?;
        return Err("No operations found in the OpenAPI document".to_string());
    }

    Ok(ImportOpenApiResult {
        collection_id: collection.id,
        collection_name: collection.name,
        request_count,
    })
}

/// `/users/{userId}/posts/{postId}` → `/users/{{userId}}/posts/{{postId}}`.
fn replace_path_parameters(path: &str) -> String {
    let mut out = String::with_capacity(path.len() + 8);
    let mut chars = path.chars().peekable();
    while let Some(current) = chars.next() {
        if current == '{' {
            let mut name = String::new();
            for inner in chars.by_ref() {
                if inner == '}' {
                    break;
                }
                name.push(inner);
            }
            out.push_str("{{");
            out.push_str(&name);
            out.push_str("}}");
        } else {
            out.push(current);
        }
    }
    out
}

#[tauri::command]
pub async fn import_openapi(
    pool: tauri::State<'_, SqlitePool>,
    payload: ImportOpenApiPayload,
) -> Result<ImportOpenApiResult, String> {
    import_openapi_record(&pool, payload).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_parameters_are_templated() {
        assert_eq!(replace_path_parameters("/users/{userId}/posts/{postId}"), "/users/{{userId}}/posts/{{postId}}");
        assert_eq!(replace_path_parameters("/health"), "/health");
    }

    #[test]
    fn parses_json_and_yaml_specs() {
        let json_spec = r#"{"openapi":"3.0.0","info":{"title":"J"},"paths":{}}"#;
        assert!(parse_spec(json_spec).is_ok());
        let yaml_spec = "openapi: 3.0.0\ninfo:\n  title: Y\npaths: {}\n";
        assert!(parse_spec(yaml_spec).is_ok());
        assert!(parse_spec("not: [a: spec").is_err());
    }

    #[tokio::test]
    async fn import_creates_collection_with_templated_requests_and_checks() {
        let pool = crate::schema::test_pool().await;
        let spec = r#"{
            "openapi": "3.0.0",
            "info": { "title": "Pet Store" },
            "servers": [{ "url": "https://api.example.test/v1" }],
            "paths": {
                "/pets/{petId}": {
                    "get": {
                        "summary": "Get pet",
                        "responses": { "200": { "description": "ok" } }
                    },
                    "delete": {
                        "operationId": "deletePet",
                        "responses": { "204": { "description": "gone" } }
                    }
                },
                "/pets": {
                    "post": {
                        "summary": "Create pet",
                        "requestBody": {
                            "content": { "application/json": { "schema": {
                                "type": "object",
                                "properties": { "name": { "type": "string" }, "age": { "type": "integer" } }
                            } } }
                        },
                        "responses": { "201": { "description": "created" } }
                    }
                }
            }
        }"#;
        let result = import_openapi_record(
            &pool,
            ImportOpenApiPayload { name: None, spec: spec.to_string(), add_checks: true },
        )
        .await
        .unwrap();
        assert_eq!(result.collection_name, "Pet Store");
        assert_eq!(result.request_count, 3);

        let requests: Vec<Value> = sqlx::query(
            "SELECT name, method, url, query_params, test_script, body_type, body FROM api_requests
             WHERE collection_id = ? ORDER BY created_at ASC",
        )
        .bind(&result.collection_id)
        .fetch_all(&pool)
        .await
        .unwrap()
        .into_iter()
        .map(|row| {
            serde_json::json!({
                "name": row.try_get::<String, _>("name").unwrap(),
                "method": row.try_get::<String, _>("method").unwrap(),
                "url": row.try_get::<String, _>("url").unwrap(),
                "query_params": row.try_get::<String, _>("query_params").unwrap(),
                "test_script": row.try_get::<String, _>("test_script").unwrap(),
                "body_type": row.try_get::<String, _>("body_type").unwrap(),
                "body": row.try_get::<String, _>("body").unwrap(),
            })
        })
        .collect();
        let get_pet = requests.iter().find(|request| request["name"] == "Get pet").unwrap();
        assert_eq!(get_pet["url"], "https://api.example.test/v1/pets/{{petId}}");
        assert_eq!(get_pet["method"], "GET");
        assert!(get_pet["test_script"].as_str().unwrap().contains("toBe(200)"));

        let delete_pet = requests.iter().find(|request| request["name"] == "deletePet").unwrap();
        assert!(delete_pet["test_script"].as_str().unwrap().contains("toBe(204)"));

        let create_pet = requests.iter().find(|request| request["name"] == "Create pet").unwrap();
        assert_eq!(create_pet["body_type"], "json");
        let body: Value = serde_json::from_str(create_pet["body"].as_str().unwrap()).unwrap();
        assert_eq!(body["name"], "");

        // A spec without paths errors and leaves no empty collection behind.
        let count_before: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM api_collections").fetch_one(&pool).await.unwrap();
        let empty = import_openapi_record(
            &pool,
            ImportOpenApiPayload {
                name: Some("Empty".to_string()),
                spec: r#"{"openapi":"3.0.0","info":{"title":"X"},"paths":{}}"#.to_string(),
                add_checks: false,
            },
        )
        .await;
        assert!(empty.is_err());
        let count_after: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM api_collections").fetch_one(&pool).await.unwrap();
        assert_eq!(count_before, count_after);
    }
}
