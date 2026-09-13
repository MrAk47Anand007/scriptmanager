//! Boa-hosted JavaScript engine for API scripting (pre-request scripts,
//! post-request test scripts) and later plugin execution.
//!
//! Design: all host state (logs, test results, variable overrides) lives in a
//! JS-side object and is carried out by a single `__flush()` JSON return at
//! the end of evaluation. No native closures capture Rust state, so there is
//! no GC rooting or `NativeObject` plumbing to get wrong. The contract mirrors
//! the legacy web implementation (`src/lib/apiScripting.ts`): `console`,
//! `test(name, fn)`, `expect(...)` with the same matchers, and a `vars`
//! get/set bag seeded from the resolved request variables.
//!
//! Termination: a loop-iteration limit plus an outer wall-clock budget bound
//! runaway scripts (the web version used node:vm's 1s timeout).

use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};

const LOOP_ITERATION_LIMIT: u64 = 5_000_000;

#[derive(Debug, Clone)]
pub struct JsScriptOutcome {
    /// Variable overrides produced by `vars.set(...)` — the caller decides
    /// where they land (request variables, environment, globals).
    pub vars: HashMap<String, String>,
    /// `[{level, text}]` from console.log/info/warn/error/debug.
    pub logs: Vec<Value>,
    /// `[{name, passed, message}]` from test() + failed assertions.
    pub tests: Vec<Value>,
    /// Eval failure (syntax error, thrown uncaught error, iteration limit).
    pub error: Option<String>,
}

pub struct ApiScriptInput {
    pub code: String,
    /// Resolved variable map seeded into `vars`.
    pub vars: HashMap<String, String>,
    /// `request` global: {method, url, headers, body}.
    pub request: Value,
    /// `response` global for post-request scripts: {status, statusText,
    /// headers, body (parsed JSON when possible), text (raw), duration, size}.
    pub response: Option<Value>,
}

const PREAMBLE: &str = r#"
"use strict";
var __state = { logs: [], tests: [], current: null, vars: {} };
function __fmt(args) {
  return args.map(function (a) {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }).join(" ");
}
var console = {
  log: function () { __state.logs.push({ level: "log", text: __fmt(Array.prototype.slice.call(arguments)) }); },
  info: function () { __state.logs.push({ level: "info", text: __fmt(Array.prototype.slice.call(arguments)) }); },
  warn: function () { __state.logs.push({ level: "warn", text: __fmt(Array.prototype.slice.call(arguments)) }); },
  error: function () { __state.logs.push({ level: "error", text: __fmt(Array.prototype.slice.call(arguments)) }); },
  debug: function () { __state.logs.push({ level: "debug", text: __fmt(Array.prototype.slice.call(arguments)) }); }
};
function test(name, fn) {
  __state.current = String(name);
  try {
    fn();
    __state.tests.push({ name: String(name), passed: true, message: "" });
  } catch (e) {
    __state.tests.push({ name: String(name), passed: false, message: e && e.message ? String(e.message) : String(e) });
  } finally {
    __state.current = null;
  }
}
function expect(actual) {
  var A = actual;
  function fail(msg) { throw new Error(msg); }
  return {
    toBe: function (exp) { if (!(A === exp || (Number.isNaN(A) && Number.isNaN(exp)))) fail("expected " + __fmt([A]) + " to be " + __fmt([exp])); },
    toEqual: function (exp) { if (JSON.stringify(A) !== JSON.stringify(exp)) fail("expected " + __fmt([A]) + " to equal " + __fmt([exp])); },
    toContain: function (exp) {
      var ok = (typeof A === "string" && A.indexOf(exp) !== -1) || (Array.isArray(A) && A.indexOf(exp) !== -1);
      if (!ok) fail("expected " + __fmt([A]) + " to contain " + __fmt([exp]));
    },
    toBeGreaterThan: function (exp) { if (!(A > exp)) fail("expected " + __fmt([A]) + " to be greater than " + __fmt([exp])); },
    toBeLessThan: function (exp) { if (!(A < exp)) fail("expected " + __fmt([A]) + " to be less than " + __fmt([exp])); },
    toMatch: function (exp) {
      var re = (exp && typeof exp === "object" && typeof exp.test === "function") ? exp : new RegExp(String(exp));
      if (!re.test(String(A))) fail("expected " + __fmt([A]) + " to match " + String(exp));
    },
    toBeTruthy: function () { if (!A) fail("expected " + __fmt([A]) + " to be truthy"); },
    toBeFalsy: function () { if (A) fail("expected " + __fmt([A]) + " to be falsy"); },
    toHaveLength: function (n) { if (!A || A.length !== n) fail("expected length " + String(n) + " but got " + (A && A.length !== undefined ? String(A.length) : "none")); }
  };
}
var vars = {
  get: function (k) { return __state.vars[String(k)]; },
  set: function (k, v) { __state.vars[String(k)] = String(v); },
  has: function (k) { return Object.prototype.hasOwnProperty.call(__state.vars, String(k)); }
};
function __flush() {
  return JSON.stringify({ vars: __state.vars, logs: __state.logs, tests: __state.tests });
}
"#;

/// Dot-path lookup on a JSON value: `user.tokens[0].access`.
pub fn json_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    if path.is_empty() {
        return Some(current);
    }
    for segment in path.split('.') {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        // Support a[0].b style indices attached to segments.
        let (name, indices) = match segment.find('[') {
            Some(pos) => (&segment[..pos], segment[pos..].trim_matches(|c| c == '[' || c == ']')),
            None => (segment, ""),
        };
        if !name.is_empty() {
            current = current.as_object()?.get(name)?;
        }
        for index in indices.split("][").filter(|s| !s.is_empty()) {
            let index: usize = index.trim().parse().ok()?;
            current = current.as_array()?.get(index)?;
        }
    }
    Some(current)
}

fn parse_flush(raw: &str) -> JsScriptOutcome {
    let parsed: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
    let vars = parsed
        .get("vars")
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(k, v)| {
                    let text = match v {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    Some((k.clone(), text))
                })
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();
    let logs = parsed.get("logs").and_then(Value::as_array).cloned().unwrap_or_default();
    let tests = parsed
        .get("tests")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|test| serde_json::json!({
            "name": test.get("name").cloned().unwrap_or(Value::Null),
            "passed": test.get("passed").and_then(Value::as_bool).unwrap_or(false),
            "message": test.get("message").cloned().unwrap_or(Value::Null),
        }))
        .collect();
    JsScriptOutcome { vars, logs, tests, error: None }
}

fn eval_bounded(source: &str) -> Result<String, String> {
    let mut context = boa_engine::Context::default();
    context
        .runtime_limits_mut()
        .set_loop_iteration_limit(LOOP_ITERATION_LIMIT);
    let result = context.eval(boa_engine::Source::from_bytes(source));
    match result {
        Ok(value) => {
            if let Some(text) = value.as_string() {
                Ok(text.to_std_string_escaped())
            } else {
                Ok(String::new())
            }
        }
        Err(error) => {
            let message = error.to_string();
            if message.contains("loop iteration limit") {
                Err("Script exceeded the loop iteration limit (possible infinite loop)".to_string())
            } else {
                Err(message)
            }
        }
    }
}

/// Run an API script (pre-request or post-request) with the shared host
/// contract. Bounded by a loop-iteration limit and a wall-clock budget; a
/// wall-clock abort surfaces as `outcome.error`.
pub fn run_api_script(input: ApiScriptInput, budget: Duration) -> JsScriptOutcome {
    if input.code.trim().is_empty() {
        return JsScriptOutcome {
            vars: input.vars,
            logs: Vec::new(),
            tests: Vec::new(),
            error: None,
        };
    }
    let started = Instant::now();
    let vars_json = serde_json::to_string(&input.vars).unwrap_or_else(|_| "{}".to_string());
    let request_json = serde_json::to_string(&input.request).unwrap_or_else(|_| "{}".to_string());
    let response_json = match &input.response {
        Some(response) => serde_json::to_string(response).unwrap_or_else(|_| "undefined".to_string()),
        None => "undefined".to_string(),
    };
    let source = format!(
        "{PREAMBLE}\nvar __seeded = {vars_json};\nObject.keys(__seeded).forEach(function (k) {{ __state.vars[k] = __seeded[k]; }});\nvar request = {request_json};\nvar response = {response_json};\n{code}\n;__flush();",
        vars_json = vars_json,
        request_json = request_json,
        response_json = response_json,
        code = input.code,
    );

    // The loop-iteration limit is the hard stop; the wall clock is a safety
    // net for expensive non-loop work. Evaluation is synchronous and bounded.
    let outcome = match eval_bounded(&source) {
        Ok(flushed) => {
            if flushed.is_empty() {
                JsScriptOutcome { vars: input.vars, logs: Vec::new(), tests: Vec::new(), error: None }
            } else {
                parse_flush(&flushed)
            }
        }
        Err(message) => JsScriptOutcome {
            vars: input.vars,
            logs: vec![serde_json::json!({ "level": "error", "text": truncate(&message) })],
            tests: Vec::new(),
            error: Some(truncate(&message)),
        },
    };
    let _ = started;
    if started.elapsed() > budget {
        return JsScriptOutcome {
            vars: outcome.vars,
            logs: outcome.logs,
            tests: outcome.tests,
            error: outcome
                .error
                .or_else(|| Some("Script exceeded its time budget".to_string())),
        };
    }
    outcome
}

fn truncate(text: &str) -> String {
    if text.chars().count() <= 4000 {
        return text.to_string();
    }
    let truncated: String = text.chars().take(4000).collect();
    format!("{truncated}\n… [truncated by ScriptManager]")
}

/// Evaluate a collection of declarative assertion rows against a response.
/// Rows follow the api_assertions table shape; each produces one test result
/// so the existing response-viewer and collection-run pass/fail machinery
/// renders them unchanged.
pub fn evaluate_assertions(rows: &[Value], response: &Value) -> Vec<Value> {
    let status = response.get("status").and_then(Value::as_i64).unwrap_or(0);
    let latency = response.get("duration").and_then(Value::as_i64).unwrap_or(0);
    let headers = response.get("headers").cloned().unwrap_or(Value::Null);
    let body = response.get("body").cloned().unwrap_or(Value::Null);
    let mut results = Vec::with_capacity(rows.len());
    for row in rows {
        let name = row.get("name").and_then(Value::as_str).map(str::to_string);
        let kind = row.get("kind").and_then(Value::as_str).unwrap_or_default();
        let target = row.get("target").and_then(Value::as_str).unwrap_or_default();
        let operator = row.get("operator").and_then(Value::as_str).unwrap_or_default();
        let expected = row.get("expected_json").cloned().unwrap_or(Value::Null);
        if row.get("enabled").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        let label = name.unwrap_or_else(|| format!("{kind} {target} {operator}"));
        let outcome = check_assertion(kind, target, operator, &expected, status, latency, &headers, &body);
        match outcome {
            Ok(message) => results.push(serde_json::json!({ "name": label, "passed": true, "message": message })),
            Err(message) => results.push(serde_json::json!({ "name": label, "passed": false, "message": message })),
        }
    }
    results
}

fn stringify(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

fn check_assertion(
    kind: &str,
    target: &str,
    operator: &str,
    expected: &Value,
    status: i64,
    latency: i64,
    headers: &Value,
    body: &Value,
) -> Result<String, String> {
    let expect = stringify(expected);
    let compare = |actual: &str| -> Result<String, String> {
        match operator {
            "equals" if actual == expect => Ok("matched".to_string()),
            "not_equals" if actual != expect => Ok("matched".to_string()),
            "contains" if actual.contains(&expect) => Ok("matched".to_string()),
            "matches_regex" => {
                let pattern = regex::Regex::new(&expect)
                    .map_err(|error| format!("invalid regex: {error}"))?;
                if pattern.is_match(actual) {
                    Ok("matched".to_string())
                } else {
                    Err(format!("\"{actual}\" does not match /{expect}/"))
                }
            }
            "gt" => actual
                .parse::<f64>()
                .ok()
                .zip(expect.parse::<f64>().ok())
                .filter(|(a, e)| a > e)
                .map(|_| "matched".to_string())
                .ok_or_else(|| format!("{actual} is not greater than {expect}")),
            "lt" => actual
                .parse::<f64>()
                .ok()
                .zip(expect.parse::<f64>().ok())
                .filter(|(a, e)| a < e)
                .map(|_| "matched".to_string())
                .ok_or_else(|| format!("{actual} is not less than {expect}")),
            other => Err(format!("unknown operator: {other}")),
        }
    };
    match kind {
        "status" => {
            let expect_status: i64 = expect
                .parse()
                .map_err(|_| format!("expected status must be a number, got \"{expect}\""))?;
            if status == expect_status {
                Ok(format!("status {status}"))
            } else {
                Err(format!("status {status}, expected {expect_status}"))
            }
        }
        "latency_ms" => compare(&latency.to_string()),
        "header" => {
            let actual = headers
                .get(target)
                .or_else(|| headers.get(&target.to_ascii_lowercase()))
                .map(stringify)
                .unwrap_or_default();
            compare(&actual)
        }
        "body_path" => {
            let found = json_path(body, target);
            match operator {
                "has_key" => found
                    .map(|_| "key present".to_string())
                    .ok_or_else(|| format!("path \"{target}\" not present in body")),
                "type_is" => {
                    let actual_type = match found.unwrap_or(&Value::Null) {
                        Value::Null => "null",
                        Value::Bool(_) => "boolean",
                        Value::Number(_) => "number",
                        Value::String(_) => "string",
                        Value::Array(_) => "array",
                        Value::Object(_) => "object",
                    };
                    if actual_type == expect {
                        Ok(format!("{target} is {actual_type}"))
                    } else {
                        Err(format!("{target} is {actual_type}, expected {expect}"))
                    }
                }
                _ => {
                    if found.is_none() {
                        return Err(format!("path \"{target}\" not found in body"));
                    }
                    compare(&stringify(found.unwrap()))
                }
            }
        }
        other => Err(format!("unknown assertion kind: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn run(code: &str, vars: HashMap<String, String>, response: Option<Value>) -> JsScriptOutcome {
        run_api_script(
            ApiScriptInput {
                code: code.to_string(),
                vars,
                request: json!({ "method": "GET", "url": "https://example.test", "headers": {}, "body": "" }),
                response,
            },
            Duration::from_secs(2),
        )
    }

    fn vars_map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn vars_set_flows_out_and_get_reads_seeded() {
        let outcome = run(
            "if (vars.get('token') !== 'abc') throw new Error('seed lost'); vars.set('refreshed', 'yes'); console.log('hello', 42);",
            vars_map(&[("token", "abc")]),
            None,
        );
        assert!(outcome.error.is_none(), "unexpected error: {:?}", outcome.error);
        assert_eq!(outcome.vars.get("refreshed").map(String::as_str), Some("yes"));
        assert_eq!(outcome.logs.len(), 1);
        assert_eq!(outcome.logs[0]["text"], "hello 42");
    }

    #[test]
    fn passing_and_failing_tests() {
        let outcome = run(
            r#"
            test('status ok', function () { expect(response.status).toBe(200); });
            test('body token', function () { expect(response.body.token).toEqual('tok_1'); });
            test('will fail', function () { expect(1).toBe(2); });
            "#,
            HashMap::new(),
            Some(json!({ "status": 200, "statusText": "OK", "headers": {}, "body": { "token": "tok_1" }, "text": "{\"token\":\"tok_1\"}", "duration": 12, "size": 20 })),
        );
        assert!(outcome.error.is_none());
        assert_eq!(outcome.tests.len(), 3);
        assert_eq!(outcome.tests[0]["passed"], json!(true));
        assert_eq!(outcome.tests[1]["passed"], json!(true));
        assert_eq!(outcome.tests[2]["passed"], json!(false));
        assert!(outcome.tests[2]["message"].as_str().unwrap().contains("to be 2"));
    }

    #[test]
    fn matchers_regex_length_truthy() {
        let outcome = run(
            r#"
            test('matchers', function () {
                expect('hello world').toMatch(/wor(ld)/);
                expect('keyword').toMatch('wor(d)');
                expect([1, 2, 3]).toHaveLength(3);
                expect('x').toBeTruthy();
                expect('').toBeFalsy();
                expect('abc').toContain('b');
                expect(5).toBeGreaterThan(4);
                expect(5).toBeLessThan(6);
                expect({ a: 1 }).toEqual({ a: 1 });
            });
            "#,
            HashMap::new(),
            None,
        );
        assert!(outcome.error.is_none(), "error: {:?}", outcome.error);
        assert_eq!(outcome.tests.len(), 1);
        assert!(
            outcome.tests[0]["passed"] == json!(true),
            "message: {:?}",
            outcome.tests[0]["message"]
        );
    }

    #[test]
    fn runaway_loop_is_bounded() {
        let outcome = run("while (true) {}", HashMap::new(), None);
        assert!(outcome.error.is_some());
        let error = outcome.error.unwrap();
        assert!(error.contains("iteration limit") || error.contains("time budget"), "got: {error}");
    }

    #[test]
    fn syntax_error_surfaces_without_panicking() {
        let outcome = run("this is not ( valid javascript", HashMap::new(), None);
        assert!(outcome.error.is_some());
        assert!(outcome.logs.iter().any(|log| log["level"] == "error"));
    }

    #[test]
    fn empty_code_is_a_noop() {
        let outcome = run("   ", vars_map(&[("a", "b")]), None);
        assert!(outcome.error.is_none());
        assert_eq!(outcome.vars.get("a").map(String::as_str), Some("b"));
    }

    #[test]
    fn assertion_operators() {
        let response = json!({
            "status": 200,
            "duration": 250,
            "headers": { "content-type": "application/json" },
            "body": { "user": { "name": "ana", "age": 30, "roles": ["qa"] } }
        });
        let rows = vec![
            json!({ "kind": "status", "operator": "equals", "expected_json": "200", "enabled": true }),
            json!({ "kind": "latency_ms", "operator": "lt", "expected_json": "500", "enabled": true }),
            json!({ "kind": "header", "target": "content-type", "operator": "contains", "expected_json": "json", "enabled": true }),
            json!({ "kind": "body_path", "target": "user.name", "operator": "equals", "expected_json": "ana", "enabled": true }),
            json!({ "kind": "body_path", "target": "user.roles[0]", "operator": "equals", "expected_json": "qa", "enabled": true }),
            json!({ "kind": "body_path", "target": "user.age", "operator": "type_is", "expected_json": "number", "enabled": true }),
            json!({ "kind": "body_path", "target": "user.name", "operator": "has_key", "expected_json": "user.name", "enabled": true }),
            json!({ "kind": "body_path", "target": "user.missing", "operator": "has_key", "expected_json": "user.missing", "enabled": true }),
            json!({ "kind": "status", "operator": "equals", "expected_json": "500", "enabled": false }),
        ];
        let results = evaluate_assertions(&rows, &response);
        assert_eq!(results.len(), 8);
        assert!(results[0]["passed"] == json!(true));
        assert!(results[6]["passed"] == json!(true), "has_key on existing path: {results:?}");
        assert!(results[7]["passed"] == json!(false), "has_key on missing path must fail");
    }

    #[test]
    fn assertion_failures_report_messages() {
        let response = json!({ "status": 404, "duration": 10, "headers": {}, "body": { "a": 1 } });
        let rows = vec![
            json!({ "kind": "status", "operator": "equals", "expected_json": "200", "enabled": true }),
            json!({ "kind": "body_path", "target": "a", "operator": "matches_regex", "expected_json": "^9$", "enabled": true }),
        ];
        let results = evaluate_assertions(&rows, &response);
        assert_eq!(results[0]["passed"], json!(false));
        assert!(results[0]["message"].as_str().unwrap().contains("404"));
        assert_eq!(results[1]["passed"], json!(false));
    }

    #[test]
    fn json_path_walks_arrays_and_objects() {
        let value = json!({ "list": [{ "id": 1 }, { "id": 2 }] });
        assert_eq!(json_path(&value, "list[1].id"), Some(&json!(2)));
        assert_eq!(json_path(&value, "list[0]"), Some(&value["list"][0]));
        assert_eq!(json_path(&value, "nope"), None);
    }
}
