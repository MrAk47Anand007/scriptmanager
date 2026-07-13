# Workflow Operations

Published workflow versions are immutable acyclic graphs. Manual, cron, signed webhook, and workflow triggers enqueue durable runs; the worker persists node state before and after each attempt. Approval nodes pause descendants, joins wait for required branches, retries obey bounded policy, and cancellation is cooperative before process-tree termination.

Webhook senders must provide the configured HMAC signature, timestamp inside the replay window, and a stable idempotency key. Keep request bodies within the configured limit. When recovery finds a process that was running during shutdown, only nodes explicitly declared resumable may continue; others become interrupted and require operator review.

Use correlation IDs to connect workflow, script, API, remote, ACP, notification, plugin, and audit records. Never place credentials in workflow variables; use opaque vault references.
