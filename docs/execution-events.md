# Execution Event Architecture

Execution events use schema version 1 and contain an event ID, correlation ID, timestamp, execution kind, actor, target, type, and redacted JSON data. The shared implementation lives in `src/lib/execution/`.

Lifecycle types are `execution.started`, `execution.succeeded`, `execution.failed`, and `execution.timed_out`. API, script, webhook, scheduler, and remote entry points propagate one correlation ID for the complete run. HTTP entry points accept `x-correlation-id` and return the effective value in the response.

The `execution_events` table is append-only application telemetry. Indexes support correlation timelines, execution-kind queries, and target history. Business execution state remains in `Build`, `ApiHistory`, and `RemoteExecution`; event persistence is deliberately failure-safe and does not replace those authoritative records.

